"""Check that every number in the answer appears in the tool results or in the question."""
import json
import re

# 1 234 567,89 | 1234567.89 | 17 | 2024
_NUM = re.compile(r"(?<![\w.,])\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|(?<![\w])\d+(?:[.,]\d+)?")


def _parse(tok: str):
    t = re.sub(r"[   ]", "", tok).replace(",", ".")
    try:
        val = float(t)
    except ValueError:
        return None, 0
    dec = len(t.split(".")[1]) if "." in t else 0
    return val, dec


def numbers_in_text(text: str):
    out = []
    for m in _NUM.finditer(text or ""):
        v, dec = _parse(m.group(0))
        if v is not None:
            out.append((m.group(0), v, dec))
    return out


def _collect(obj, acc: set):
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        acc.add(float(obj))
    elif isinstance(obj, str):
        for _, v, _ in numbers_in_text(obj):
            acc.add(v)
        for part in re.findall(r"\d+", obj):  # dates like 2024-01-02, codes like АИ-92
            acc.add(float(part))
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect(v, acc)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _collect(v, acc)


def _matches(x: float, dec: int, known: set) -> bool:
    for v in known:
        if abs(round(v, dec) - x) < 1e-9 or abs(v - x) < 1e-9:
            return True
        # percentages stored as fractions (0.123 -> 12.3)
        if abs(round(v * 100, dec) - x) < 1e-9:
            return True
    return False


_DATE_DMY = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")
_DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})")


def _dates(obj, acc: set):
    s = json.dumps(obj, ensure_ascii=False, default=str) if not isinstance(obj, str) else obj
    for y, m, d in _DATE_ISO.findall(s):
        acc.add((int(y), int(m), int(d)))
    for d, m, y in _DATE_DMY.findall(s):
        acc.add((int(y), int(m), int(d)))


def unverified_numbers(answer: str, tool_results: list, question: str) -> list:
    """Numbers and dates in `answer` that no tool result and no part of the question supports."""
    known = set()
    for r in tool_results:
        _collect(r, known)
    for _, v, _ in numbers_in_text(question):
        known.add(v)
    known.update(float(i) for i in range(0, 11))  # 'топ-5', '1 сделка', list numbering
    known_dates = set()
    for r in tool_results:
        _dates(r, known_dates)
    _dates(question, known_dates)
    known_dates.update({(2022, 1, 3), (2026, 10, 30), (2026, 11, 5)})  # data range and 'today' from the prompt

    bad = []
    for m in _DATE_DMY.finditer(answer or ""):
        d, mo, y = map(int, m.groups())
        if (y, mo, d) not in known_dates:
            bad.append(m.group(0))
    answer = _DATE_DMY.sub(" ", answer or "")
    for tok, v, dec in numbers_in_text(answer):
        if not _matches(v, dec, known):
            bad.append(tok)
    return bad


if __name__ == "__main__":
    res = [{"columns": ["n", "s"], "rows": [[11845, 1234567.891], ["2024-01-02", "АИ-92"]]}]
    print(unverified_numbers("Всего 11 845 сделок на 1 234 567,89 сум, 02.01.2024, АИ-92, 999", res, "топ-5"))
    print(json.dumps(numbers_in_text("1 234 567,89 и 17 и 3.5%")))
