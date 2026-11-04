"""HTTP API. Vercel serves this as a Python function; locally run: .venv/bin/uvicorn api.index:app --reload"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agent.agent import MODEL, answer  # noqa: E402
from agent.db import get_con  # noqa: E402

app = FastAPI(title="UZEX trade agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Turn(BaseModel):
    q: str = ""
    a: str = ""


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = []


@app.get("/api/health")
def health():
    t0 = time.time()
    n = get_con().execute("SELECT count(*) FROM deals").fetchone()[0]
    return {"ok": True, "deals": n, "model": MODEL, "db_ms": int((time.time() - t0) * 1000)}


@app.post("/api/ask")
def ask(body: AskIn):
    get_con()
    return answer(body.question.strip(), [h.model_dump() for h in body.history])
