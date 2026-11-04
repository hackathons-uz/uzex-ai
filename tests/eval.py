"""Run the agent on tests/cases.json and score it against ground truth computed with SQL.

Usage: .venv/bin/python tests/eval.py [--only id1,id2] [--model claude-haiku-5-5] [--jobs 4]
Pass rule:
  answerable=false case: the agent must return answerable=false.
  otherwise: every value from the first row of truth_sql (columns listed in `check`) must appear in the answer
  (numbers compared at the precision the agent printed; strings compared case-insensitively).
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)

ap = argparse.ArgumentParser()
ap.add_argument("--only", default="")
ap.add_argument("--model", default="")
ap.add_argument("--jobs", type=int, default=4)
ap.add_argument("--out", default=os.path.join(ROOT, "tests", "results"))
args = ap.parse_args()
if args.model:
    os.environ["ANTHROPIC_MODEL"] = args.model

from agent.agent import MODEL, answer  # noqa: E402
from agent.db import get_con, run_sql  # noqa: E402
from agent.guard import numbers_in_text  # noqa: E402


def truth(case):
    if not case.get("truth_sql"):
        return {}
    r = run_sql(case["truth_sql"])
    if not r["rows"]:
        return {}
    return dict(zip(r["columns"], r["rows"][0]))


def value_in_answer(v, text):
    if isinstance(v, (int, float)):
        for _, x, dec in numbers_in_text(text):
            if abs(round(float(v), dec) - x) < 1e-9 * max(1, abs(x)) + (0.5 * 10 ** -dec if dec else 0.5):
                return True
        return False
    return str(v).lower() in text.lower()


def run_case(case):
    exp = truth(case)
    t0 = time.time()
    try:
        out = answer(case["q"])
    except Exception as e:
        out = {"answer": f"EXCEPTION {e}", "answerable": None, "steps": [], "verified": False}
    el = time.time() - t0
    if case.get("answerable", True) is False:
        ok = out.get("answerable") is False
        missing = [] if ok else ["expected answerable=false"]
    else:
        missing = [f"{c}={exp.get(c)}" for c in case.get("check", []) if not value_in_answer(exp.get(c), out.get("answer", ""))]
        if out.get("answerable") is False:
            missing.append("agent said no data")
        ok = not missing
    return {"id": case["id"], "group": case.get("group", ""), "ok": ok, "missing": missing, "q": case["q"],
            "expected": exp, "answer": out.get("answer"), "answerable": out.get("answerable"),
            "verified": out.get("verified"), "elapsed_s": round(el, 1), "usage": out.get("usage"),
            "steps": out.get("steps")}


def main():
    cases = json.load(open(os.path.join(ROOT, "tests", "cases.json"), encoding="utf-8"))
    if args.only:
        keep = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in keep]
    get_con()
    with ThreadPoolExecutor(args.jobs) as ex:
        res = list(ex.map(run_case, cases))
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"{time.strftime('%Y%m%d-%H%M%S')}-{MODEL}.json")
    json.dump(res, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)

    for r in res:
        mark = "PASS" if r["ok"] else "FAIL"
        print(f"{mark} {r['id']:<22} {r['elapsed_s']:>5}s  {r['q'][:60]}")
        if not r["ok"]:
            print(f"      missing: {r['missing']}\n      answer:  {(r['answer'] or '')[:300]}")
    n = len(res)
    passed = sum(r["ok"] for r in res)
    traps = [r for r in res if any(c["id"] == r["id"] and c.get("answerable") is False for c in cases)]
    times = sorted(r["elapsed_s"] for r in res)
    inp = sum((r["usage"] or {}).get("input", 0) for r in res)
    outp = sum((r["usage"] or {}).get("output", 0) for r in res)
    print(f"\nmodel {MODEL}: {passed}/{n} passed, traps {sum(r['ok'] for r in traps)}/{len(traps)}, "
          f"p50 {times[n // 2]}s, max {times[-1]}s, tokens in {inp:,} out {outp:,}\nsaved {path}")


if __name__ == "__main__":
    main()
