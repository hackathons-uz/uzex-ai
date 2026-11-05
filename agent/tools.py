"""Tools the LLM can call: fuzzy entity search, read-only SQL, final answer."""
import difflib
import re
import threading

from .db import SQLError, get_con, run_sql
from .textnorm import company_key, norm

TOOLS = [
    {
        "name": "search_entities",
        "description": (
            "Fuzzy search for a product, company (participant) or broker by name, in any script "
            "(Russian, Uzbek Latin, Uzbek Cyrillic). Use it BEFORE filtering SQL by a name, because "
            "names in the data are written inconsistently. Product names in the data are in Russian: "
            "translate Uzbek product words to Russian first (shakar -> сахар, bug'doy -> пшеница, "
            "paxta -> хлопок, un -> мука, sement -> цемент, yog' -> масло). A 9-digit number is "
            "searched as an exact ИНН (inn); a code like BK062 as an exact broker code. "
            "Returns the best candidates with match scores; pick the ones that really match."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["product", "company", "broker"]},
                "query": {"type": "string", "description": "Name or part of a name, or an ИНН / broker code."},
            },
            "required": ["kind", "query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "run_sql",
        "description": (
            "Run ONE read-only DuckDB SELECT/WITH query over the tables described in the system prompt. "
            "Returns columns and up to 200 rows. Compute every number you will report (sums, counts, "
            "averages, percentages, differences) inside SQL - do not do arithmetic yourself."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "purpose": {"type": "string", "description": "3-6 words in the language and script of the user's question: what this query computes (shown to the user as a source label)."},
                "query": {"type": "string"},
            },
            "required": ["purpose", "query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "final_answer",
        "description": (
            "Give the final answer to the user. Call it exactly once, at the end. Every number and name "
            "in `answer` must come from a tool result in this conversation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "answerable": {
                    "type": "boolean",
                    "description": "false if the data cannot answer the question (no such record, period, field or topic).",
                },
                "language": {"type": "string", "enum": ["ru", "uz_latn", "uz_cyrl"],
                             "description": "Language and script of the user's question."},
                "answer": {"type": "string", "description": "The answer in the user's language and script. 1-4 sentences."},
                "assumptions": {
                    "type": "array", "items": {"type": "string"},
                    "description": ("1-3 short items (a few words each), in the user's language: only the filters and "
                                    "interpretations you chose, e.g. 'товар: все написания цемента', 'аннулированные сделки "
                                    "показаны отдельно'. No numbers and no repeating the answer; no column names or SQL."),
                },
                "followups": {
                    "type": "array", "items": {"type": "string"},
                    "description": ("2-3 short natural follow-up questions (max ~70 characters each) in the user's language "
                                    "and script, that this database CAN answer and that dig deeper into this answer: "
                                    "another period, a breakdown by month/region/buyer, a comparison, the top-N. "
                                    "Written as the user would ask them. For an unanswerable question, suggest close "
                                    "questions the data can answer."),
                },
            },
            "required": ["answerable", "language", "answer", "assumptions"],
            "additionalProperties": False,
        },
    },
]

# ---------------------------------------------------------------- fuzzy search

_cache = {}
_cache_lock = threading.Lock()


def _catalog(kind):
    with _cache_lock:
        if kind not in _cache:
            con = get_con()
            if kind == "product":
                rows = con.execute(
                    "SELECT product_full, product, category, unit, n_deals, first_deal, last_deal, search_key, product_family "
                    "FROM products").fetchall()
            elif kind == "company":
                rows = con.execute(
                    "SELECT p.inn, p.name, p.region, p.activity, p.role, p.search_key, "
                    "coalesce(s.n,0), coalesce(b.n,0) FROM participants p "
                    "LEFT JOIN (SELECT seller_inn inn, count(*) n FROM deals GROUP BY 1) s USING(inn) "
                    "LEFT JOIN (SELECT buyer_inn inn, count(*) n FROM deals GROUP BY 1) b USING(inn)").fetchall()
            else:
                rows = con.execute(
                    "SELECT b.broker_code, b.name, b.inn, b.region, b.search_key, "
                    "(SELECT count(*) FROM deals d WHERE d.seller_broker=b.broker_code OR d.buyer_broker=b.broker_code) "
                    "FROM brokers b").fetchall()
            _cache[kind] = rows
        return _cache[kind]


def _score(q_tokens, q_str, key):
    if not key:
        return 0.0
    k_tokens = key.split()
    hit = 0.0
    for qt in q_tokens:
        stem = qt[:5] if len(qt) > 5 else qt
        if any(kt == qt for kt in k_tokens):
            hit += 1.0
        elif any(kt.startswith(stem) for kt in k_tokens):
            hit += 0.8
    tok = hit / max(len(q_tokens), 1)
    ratio = difflib.SequenceMatcher(None, q_str, key).ratio()
    return round(0.75 * tok + 0.25 * ratio, 3)


def search_entities(kind: str, query: str) -> dict:
    query = (query or "").strip()
    rows = _catalog(kind)
    digits = re.sub(r"\D", "", query)

    if kind == "company" and len(digits) == 9 and digits == query.replace(" ", ""):
        hits = [r for r in rows if r[0] == digits]
        return {"exact_inn": digits, "found": bool(hits),
                "candidates": [_company_row(r, 1.0) for r in hits]}
    if kind == "broker" and re.fullmatch(r"(?i)bk\s*\d{1,3}", query):
        code = "BK" + re.sub(r"\D", "", query).zfill(3)
        hits = [r for r in rows if r[0] == code]
        return {"exact_code": code, "found": bool(hits),
                "candidates": [_broker_row(r, 1.0) for r in hits]}

    if kind == "company":
        q = company_key(query) or norm(query)
        key_idx, fmt = 5, _company_row
    elif kind == "broker":
        q = company_key(query) or norm(query)
        key_idx, fmt = 4, _broker_row
    else:
        q = norm(query)
        key_idx, fmt = 7, _product_row
    q_tokens = q.split()
    if not q_tokens:
        return {"found": False, "candidates": [], "note": "empty query"}

    scored = sorted(((_score(q_tokens, q, r[key_idx]), r) for r in rows), key=lambda x: -x[0])
    top = [(s, r) for s, r in scored[:25] if s >= 0.35]
    return {
        "found": bool(top),
        "candidates": [fmt(r, s) for s, r in top],
        "note": "Scores >= 0.8 are usually real matches; check the names. Several spellings of the same "
                "product are common - include all that truly match.",
    }


def _company_row(r, s):
    return {"inn": r[0], "name": r[1], "region": r[2], "activity": r[3], "role": r[4],
            "deals_as_seller": r[6], "deals_as_buyer": r[7], "score": s}


def _broker_row(r, s):
    return {"broker_code": r[0], "name": r[1], "inn": r[2], "region": r[3], "deals": r[5], "score": s}


def _product_row(r, s):
    return {"product_full": r[0], "product": r[1], "product_family": r[8], "category": r[2], "unit": r[3], "n_deals": r[4],
            "first_deal": str(r[5]), "last_deal": str(r[6]), "score": s}


# ---------------------------------------------------------------- dispatcher

def execute(name: str, args: dict) -> dict:
    """Returns a JSON-able dict. Errors come back as {'error': ...} so the model can fix them."""
    try:
        if name == "search_entities":
            return search_entities(args.get("kind", "product"), args.get("query", ""))
        if name == "run_sql":
            return run_sql(args.get("query", ""))
        return {"error": f"unknown tool {name}"}
    except SQLError as e:
        return {"error": str(e)}
    except Exception as e:  # never crash the loop on a tool
        return {"error": f"{type(e).__name__}: {e}"}
