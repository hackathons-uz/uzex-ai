"""Text normalization for fuzzy search across Russian, Uzbek Cyrillic and Uzbek Latin."""
import re

_CYR2LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "ғ": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "қ": "q", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ў": "o",
    "ф": "f", "х": "x", "ҳ": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "",
    "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

# Legal-form words that carry no identity ("MChJ", "МЧЖ", "ООО", ...), compared after transliteration.
_LEGAL = {
    "mchj", "ooo", "mas", "masuliyati", "cheklangan", "jamiyati", "aj", "ao", "oao", "zao",
    "xk", "xususiy", "korxonasi", "qk", "ok", "dk", "ip", "chp", "llc", "jsc", "ltd",
    "aksiyadorlik", "jamiyat", "unitar", "korxona", "fx", "mmt", "tmk", "sp",
}

_APOS = re.compile(r"[‘’ʻʼ`'ʻʼ]")
_NONWORD = re.compile(r"[^0-9a-z]+")


def translit(text: str) -> str:
    text = (text or "").lower()
    return "".join(_CYR2LAT.get(ch, ch) for ch in text)


def norm(text: str) -> str:
    """Lowercase, Cyrillic -> Latin, drop apostrophes and punctuation, collapse spaces."""
    t = translit(text)
    t = _APOS.sub("", t)
    t = _NONWORD.sub(" ", t)
    return " ".join(t.split())


def company_key(name: str) -> str:
    return " ".join(w for w in norm(name).split() if w not in _LEGAL)


def product_key(name: str) -> str:
    """Order-insensitive key: 'Топливо дизельное' == 'Дизельное топливо', 'Хлопок-сырец' == 'хлопок сырец'."""
    t = (name or "").lower().replace("ё", "е")
    t = re.sub(r"[^0-9a-zа-яўқғҳ]+", " ", t)
    return " ".join(sorted(t.split()))
