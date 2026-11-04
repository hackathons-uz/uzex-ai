# uzex-ai

AI agent that answers questions about UZEX exchange trades (500 000 deals, 03.01.2022 – 30.10.2026) in Russian and Uzbek, strictly from the data.

## How it works

1. `scripts/build_data.py` cleans the raw CSVs into Parquet (`data/db/`): numbers parsed, USD deals converted at the deal-date rate, regions unified, contract/category/company names joined, search keys for fuzzy matching.
2. The API loads the Parquet into in-memory DuckDB (~0.1 s), then locks it: no file access, SELECT only, 15 s timeout.
3. Claude (default `claude-haiku-5-5`) runs a tool loop:
   - `search_entities` — fuzzy search for products, companies, brokers (Cyrillic ↔ Latin).
   - `run_sql` — read-only DuckDB query; every reported number is computed here.
   - `final_answer` — structured answer: text, language, answerable flag, assumptions.
4. A number check rejects any number or date in the answer that is not in a tool result; the model must fix it.
5. The UI (`public/`, plain JS, design from the team's artifact) calls `POST /api/chat` (server-sent events): one `status` event per agent step (search, SQL, number check), then `done` with the checked answer. It shows the answer, a "numbers checked" / "no data" badge, the assumptions, one source chip per step, and an expandable evidence block with every SQL query and its result rows. Chat history and the interface language are stored in the browser (localStorage). `/?q=...` asks a question on load.

## Run locally

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt uvicorn
.venv/bin/python scripts/build_data.py            # data/*.csv -> data/db/*.parquet (needs the raw CSVs)
echo 'ANTHROPIC_API_KEY=...' > .env
.venv/bin/uvicorn api.index:app --port 8000      # API + UI on http://127.0.0.1:8000/
```

## Test

```bash
.venv/bin/python tests/eval.py                          # all cases in tests/cases.json
.venv/bin/python tests/eval.py --model claude-sonnet-5-5 --only trap_gold,deal_parties
```

Ground truth for each case is computed with SQL; trap cases must return "no data".

## Config (env)

`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-haiku-5-5`), `ANTHROPIC_EFFORT` (default `medium`), `AGENT_DEADLINE_S` (default 70).
