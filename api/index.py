"""HTTP API. Vercel serves this as a Python function; locally: .venv/bin/uvicorn api.index:app --port 8000
(locally it also serves the UI from public/ at http://127.0.0.1:8000/).

Monitoring: every request prints one JSON line with key "chat_log" (Vercel -> Logs);
errors and traces go to Sentry when the SENTRY_DSN environment variable is set."""
import json
import os
import queue
import sys
import threading
import time

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agent.agent import MODEL, answer  # noqa: E402
from agent.db import get_con  # noqa: E402

# Sentry включается только при заданном SENTRY_DSN; без него или при сбое импорта сервис работает как раньше
if os.environ.get("SENTRY_DSN"):
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=os.environ["SENTRY_DSN"], traces_sample_rate=1.0,
                        environment=os.environ.get("VERCEL_ENV", "local"))
    except Exception as e:  # noqa: BLE001
        print(f"sentry init failed: {e}", flush=True)

app = FastAPI(title="UZEX trade agent")


def _log(req: Request, route: str, question: str, res: dict = None, error: str = "", t0: float = 0.0):
    """Одна JSON-строка на запрос: видно в Vercel → Logs (поиск по "chat_log")."""
    try:
        res = res or {}
        print(json.dumps({
            "chat_log": route,
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ip": (req.headers.get("x-forwarded-for") or (req.client.host if req.client else "")).split(",")[0].strip(),
            "country": req.headers.get("x-vercel-ip-country", ""),
            "ua": (req.headers.get("user-agent") or "")[:160],
            "q": question[:2000],
            "error": error,
            "answerable": res.get("answerable"),
            "verified": res.get("verified"),
            "lang": res.get("language"),
            "elapsed_s": res.get("elapsed_s") or round(time.time() - t0, 2),
            "tokens": res.get("usage"),
            "steps": len(res.get("steps") or []),
            "answer": (res.get("answer") or "")[:300],
        }, ensure_ascii=False, default=str), flush=True)
    except Exception:  # noqa: BLE001  лог никогда не ломает ответ
        pass


class Turn(BaseModel):
    q: str = ""
    a: str = ""


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default=[], max_length=20)


@app.get("/api/health")
def health():
    t0 = time.time()
    n = get_con().execute("SELECT count(*) FROM deals").fetchone()[0]
    return {"ok": True, "deals": n, "model": MODEL, "db_ms": int((time.time() - t0) * 1000)}


@app.post("/api/ask")
def ask(body: AskIn, request: Request):
    """One JSON response (used by tests/eval.py)."""
    get_con()
    t0 = time.time()
    res = answer(body.question.strip(), [h.model_dump() for h in body.history])
    _log(request, "ask", body.question, res, t0=t0)
    return res


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.post("/api/chat")
def chat(body: AskIn, request: Request):
    """Server-sent events: `status` for every agent step, then `done` with the checked answer (or `error`).
    The answer text is sent only after the number check, never token by token."""
    get_con()
    q: queue.Queue = queue.Queue()
    history = [h.model_dump() for h in body.history]

    t0 = time.time()

    def work():
        try:
            res = answer(body.question.strip(), history, on_event=lambda ev: q.put(("status", ev)))
            if res.get("note", "").startswith("LLM error"):
                code = "rate_limit" if "RateLimit" in res["note"] else "server"
                q.put(("error", {"code": code, "retryable": True, "detail": res["note"]}))
                _log(request, "chat", body.question, res, error=res["note"][:300], t0=t0)
            else:
                q.put(("done", res))
                _log(request, "chat", body.question, res, t0=t0)
        except Exception as e:  # noqa: BLE001
            q.put(("error", {"code": "server", "retryable": True, "detail": f"{type(e).__name__}: {e}"}))
            _log(request, "chat", body.question, error=f"{type(e).__name__}: {e}"[:300], t0=t0)
            try:
                import sentry_sdk
                sentry_sdk.capture_exception(e)
            except Exception:  # noqa: BLE001
                pass
        q.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while True:
            try:
                item = q.get(timeout=10)
            except queue.Empty:
                yield ": keep-alive\n\n"
                continue
            if item is None:
                return
            yield _sse(*item)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


_PUBLIC = os.path.join(ROOT, "public")
if os.path.isdir(_PUBLIC) and not os.environ.get("VERCEL"):
    app.mount("/", StaticFiles(directory=_PUBLIC, html=True), name="ui")
