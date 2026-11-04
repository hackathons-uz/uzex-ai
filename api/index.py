"""HTTP API. Vercel serves this as a Python function; locally: .venv/bin/uvicorn api.index:app --port 8000
(locally it also serves the UI from public/ at http://127.0.0.1:8000/)."""
import json
import os
import queue
import sys
import threading
import time

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)

from fastapi import FastAPI  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agent.agent import MODEL, answer  # noqa: E402
from agent.db import get_con  # noqa: E402

app = FastAPI(title="UZEX trade agent")


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
def ask(body: AskIn):
    """One JSON response (used by tests/eval.py)."""
    get_con()
    return answer(body.question.strip(), [h.model_dump() for h in body.history])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.post("/api/chat")
def chat(body: AskIn):
    """Server-sent events: `status` for every agent step, then `done` with the checked answer (or `error`).
    The answer text is sent only after the number check, never token by token."""
    get_con()
    q: queue.Queue = queue.Queue()
    history = [h.model_dump() for h in body.history]

    def work():
        try:
            res = answer(body.question.strip(), history, on_event=lambda ev: q.put(("status", ev)))
            if res.get("note", "").startswith("LLM error"):
                code = "rate_limit" if "RateLimit" in res["note"] else "server"
                q.put(("error", {"code": code, "retryable": True, "detail": res["note"]}))
            else:
                q.put(("done", res))
        except Exception as e:  # noqa: BLE001
            q.put(("error", {"code": "server", "retryable": True, "detail": f"{type(e).__name__}: {e}"}))
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
