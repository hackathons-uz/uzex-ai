"""In-memory DuckDB with the cleaned tables. Read-only SQL with a timeout and a row limit."""
import datetime as dt
import decimal
import os
import threading
import time

import duckdb

DATA_DIR = os.environ.get("UZEX_DATA_DIR") or os.path.join(os.path.dirname(__file__), "..", "data", "db")
TABLES = ["deals", "contracts", "participants", "brokers", "usd_rates", "regions", "products"]

_con = None
_lock = threading.Lock()


def get_con() -> duckdb.DuckDBPyConnection:
    global _con
    if _con is None:
        with _lock:
            if _con is None:
                con = duckdb.connect(":memory:", config={"threads": 4})
                for t in TABLES:
                    path = os.path.abspath(os.path.join(DATA_DIR, f"{t}.parquet"))
                    con.execute(f"CREATE TABLE {t} AS SELECT * FROM read_parquet('{path}')")
                # After loading: no file/network access, settings cannot be changed back.
                con.execute("SET enable_external_access = false")
                con.execute("SET lock_configuration = true")
                _con = con
    return _con


class SQLError(Exception):
    pass


def _check_read_only(query: str):
    try:
        stmts = duckdb.extract_statements(query)
    except duckdb.Error as e:
        raise SQLError(f"Parse error: {e}") from None
    if len(stmts) != 1:
        raise SQLError("Send exactly one SQL statement.")
    if stmts[0].type != duckdb.StatementType.SELECT:
        raise SQLError("Only SELECT / WITH queries are allowed.")


def _jsonable(v):
    if isinstance(v, float):
        return round(v, 6)
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.date, dt.datetime, dt.time)):
        return v.isoformat()
    return v


def run_sql(query: str, max_rows: int = 200, timeout_s: float = 15.0, params=None) -> dict:
    _check_read_only(query)
    cur = get_con().cursor()
    timer = threading.Timer(timeout_s, cur.interrupt)
    t0 = time.time()
    timer.start()
    try:
        rel = cur.execute(query, params or [])
        cols = [c[0] for c in rel.description]
        rows = rel.fetchmany(max_rows + 1)
    except duckdb.InterruptException:
        raise SQLError(f"Query took longer than {timeout_s:.0f}s and was stopped. Simplify it.") from None
    except duckdb.Error as e:
        raise SQLError(str(e).split("\n")[0][:500]) from None
    finally:
        timer.cancel()
        cur.close()
    truncated = len(rows) > max_rows
    rows = [[_jsonable(v) for v in r] for r in rows[:max_rows]]
    return {"columns": cols, "rows": rows, "row_count": len(rows), "truncated": truncated,
            "ms": int((time.time() - t0) * 1000)}
