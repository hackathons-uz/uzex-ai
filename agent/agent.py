"""The agent loop: Claude + tools, with a time budget and a number check on the final answer."""
import json
import os
import re
import time

import anthropic

from .guard import unverified_numbers
from .prompt import SYSTEM_PROMPT
from .tools import TOOLS, execute


def _load_dotenv():
    """Local dev: read KEY=VALUE lines from ../.env into os.environ (never overrides real env vars)."""
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5")
EFFORT = os.environ.get("ANTHROPIC_EFFORT", "medium")
MAX_STEPS = int(os.environ.get("AGENT_MAX_STEPS", "14"))
DEADLINE_S = float(os.environ.get("AGENT_DEADLINE_S", "70"))
MAX_GUARD_RETRIES = 2

_client = None


def client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=45.0, max_retries=2)
    return _client


def detect_lang(text: str) -> str:
    if re.search(r"[ўқғҳЎҚҒҲ]", text):
        return "uz_cyrl"
    if re.search(r"[а-яА-ЯёЁ]", text):
        return "ru"
    return "uz_latn"


FALLBACK = {
    "ru": "Не удалось надёжно получить ответ из данных. Попробуйте переформулировать вопрос.",
    "uz_latn": "Ma’lumotlardan ishonchli javob olib bo‘lmadi. Savolni boshqacha yozib ko‘ring.",
    "uz_cyrl": "Маълумотлардан ишончли жавоб олиб бўлмади. Саволни бошқача ёзиб кўринг.",
}


_LEAK = re.compile(r"</?(answer|parameter|invoke|antml|function_calls)\b[^>]*>", re.I)


def clean_final(args: dict) -> dict:
    """Repair a malformed final_answer: the model sometimes writes later fields inside `answer` as raw markup,
    e.g. '...text</answer>\n<parameter name="assumptions">["a", "b"]'. Split them back into real fields."""
    args = dict(args)
    text = str(args.get("answer", "") or "")
    m = _LEAK.search(text)
    if not m:
        return args
    head, tail = text[:m.start()], text[m.start():]
    for name, raw in re.findall(r'<parameter name="(\w+)">(.*?)(?=<parameter name=|</parameter>|$)', tail, re.S):
        raw = _LEAK.sub("", raw).strip()
        if name == "assumptions" and not args.get("assumptions"):
            try:
                val = json.loads(raw)
                args["assumptions"] = [str(x) for x in val] if isinstance(val, list) else [str(val)]
            except ValueError:
                args["assumptions"] = [raw] if raw else []
        elif name == "answerable" and raw.lower() in ("true", "false"):
            args["answerable"] = raw.lower() == "true"
    args["answer"] = _LEAK.sub("", head).strip()
    return args


def _history_block(history):
    if not history:
        return ""
    lines = ["Earlier in this chat - use it ONLY to understand what the new question refers to "
             "(a product, company, broker, region or period mentioned before). Answer only the new question. "
             "Do not re-check, re-run or repeat earlier answers. Compute every number for the new question with "
             "fresh tool calls; never copy numbers from these earlier answers."]
    for h in history[-3:]:
        lines.append(f"Q: {str(h.get('q', ''))[:2000]}\nA: {str(h.get('a', ''))[:1500]}")
    return "\n".join(lines) + "\n\nNew question:\n"


def answer(question: str, history=None, on_event=None) -> dict:
    """on_event(dict) is called with progress events: {'stage': 'read'|'search'|'sql'|'check'|'compose', ...}."""
    t0 = time.time()

    def emit(ev):
        if on_event:
            try:
                on_event(ev)
            except Exception:
                pass

    emit({"stage": "read"})
    lang = detect_lang(question)
    messages = [{"role": "user", "content": _history_block(history) + "Question: " + question}]
    steps, results = [], []
    usage = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    guard_retries = 0
    nudged = False

    def done(final: dict, verified: bool, note: str = ""):
        return {
            "answer": final.get("answer") or FALLBACK[lang],
            "answerable": bool(final.get("answerable", False)),
            "language": final.get("language", lang),
            "assumptions": final.get("assumptions", []),
            "verified": verified,
            "note": note,
            "steps": steps,
            "model": MODEL,
            "elapsed_s": round(time.time() - t0, 2),
            "usage": usage,
        }

    for _ in range(MAX_STEPS):
        if time.time() - t0 > DEADLINE_S and not nudged:
            messages.append({"role": "user", "content": "Time is almost up. Call final_answer now using only results you already have; if they are not enough, answer that you could not determine it."})
            nudged = True
        try:
            resp = client().messages.create(
                model=MODEL,
                max_tokens=8000,
                system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                tools=TOOLS,
                messages=messages,
                output_config={"effort": EFFORT},
            )
        except anthropic.APIError as e:
            return done({}, False, f"LLM error: {type(e).__name__}: {getattr(e, 'message', e)}")

        u = resp.usage
        usage["input"] += u.input_tokens or 0
        usage["output"] += u.output_tokens or 0
        usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
        usage["cache_write"] += getattr(u, "cache_creation_input_tokens", 0) or 0

        if resp.stop_reason == "refusal":
            return done({}, False, "model refused")

        messages.append({"role": "assistant", "content": resp.content})
        tool_uses = [b for b in resp.content if b.type == "tool_use"]

        if not tool_uses:
            # Model answered in plain text; ask it to use final_answer so the answer is structured and checked.
            messages.append({"role": "user", "content": "Call the final_answer tool with your answer."})
            continue

        tool_results, final = [], None
        for tu in tool_uses:
            args = tu.input if isinstance(tu.input, dict) else {}
            if tu.name == "final_answer":
                emit({"stage": "compose"})
                args = clean_final(args)
                bad = unverified_numbers(args.get("answer", ""), results, question)
                if bad and guard_retries < MAX_GUARD_RETRIES:
                    guard_retries += 1
                    emit({"stage": "check"})
                    steps.append({"tool": "guard", "purpose": "number check failed", "unverified": bad})
                    tool_results.append({
                        "type": "tool_result", "tool_use_id": tu.id, "is_error": True,
                        "content": (f"Rejected: these numbers are not in any tool result: {bad}. "
                                    "Compute them with run_sql, copy them exactly, or remove them. Then call final_answer again."),
                    })
                    continue
                final = (args, not bad)
                tool_results.append({"type": "tool_result", "tool_use_id": tu.id, "content": "ok"})
                continue

            if tu.name == "run_sql":
                emit({"stage": "sql", "purpose": args.get("purpose", "")})
            else:
                emit({"stage": "search", "kind": args.get("kind", ""), "query": args.get("query", "")})
            t1 = time.time()
            res = execute(tu.name, args)
            results.append(res)
            steps.append({
                "tool": tu.name,
                "purpose": args.get("purpose") or f"{args.get('kind', '')}: {args.get('query', '')}",
                "query": args.get("query"),
                "kind": args.get("kind"),
                "result": res,
                "ms": int((time.time() - t1) * 1000),
            })
            payload = json.dumps(res, ensure_ascii=False, default=str)
            if len(payload) > 20000:
                payload = payload[:20000] + " …(truncated)"
            tool_results.append({"type": "tool_result", "tool_use_id": tu.id, "content": payload,
                                 **({"is_error": True} if "error" in res else {})})

        if final is not None:
            args, ok = final
            return done(args, ok, "" if ok else "some numbers could not be matched to query results")
        messages.append({"role": "user", "content": tool_results})

    return done({}, False, "step limit reached")
