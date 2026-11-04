"""Product families: map every base product name (contracts.product) to one canonical family.

Hand-checked against all 230 base names in the data. Order matters: first match wins.
Each rule: (regex on lowercased name, family in Russian, Uzbek Latin synonyms used for search).
"""
import re

RULES = [
    (r"шрот", "Шрот хлопковый", "paxta shroti kunjara"),
    (r"масло хлопков|хлопковое масло", "Масло хлопковое", "paxta yog‘i paxta moyi"),
    (r"пряжа", "Пряжа хлопчатобумажная", "ip kalava paxta ipi"),
    (r"хлопок.?сырец", "Хлопок-сырец", "paxta xomashyosi paxta"),
    (r"подсолнечн", "Масло подсолнечное", "kungaboqar yog‘i"),
    (r"питьев", "Вода питьевая", "ichimlik suvi suv"),
    (r"мука", "Мука", "un bug‘doy uni"),
    (r"пшениц", "Пшеница", "bug‘doy"),
    (r"^рис", "Рис", "guruch"),
    (r"сахар", "Сахар", "shakar"),
    (r"соль", "Соль", "tuz osh tuzi"),
    (r"цемент", "Цемент", "sement portlandsement"),
    (r"кирпич", "Кирпич", "g‘isht"),
    (r"стекло", "Стекло", "shisha oyna"),
    (r"гипс", "Гипс", "gips"),
    (r"известь", "Известь", "ohak"),
    (r"пиломатериал", "Пиломатериалы", "yog‘och taxta"),
    (r"бензин", "Бензин", "benzin"),
    (r"дизельн", "Дизельное топливо", "dizel yoqilg‘isi solyarka"),
    (r"сжиженн", "Сжиженный газ", "suyultirilgan gaz propan butan"),
    (r"мазут", "Мазут", "mazut"),
    (r"битум", "Битум", "bitum"),
    (r"проволок", "Проволока арматурная", "armatura simi sim"),
    (r"арматур", "Арматура", "armatura"),
    (r"лист стальн", "Лист стальной горячекатаный", "po‘lat list"),
    (r"профиль алюмин|алюминиевый профиль", "Профиль алюминиевый", "alyuminiy profil"),
    (r"катод|медный катод", "Катод медный", "mis katod mis"),
    (r"труб", "Трубы полиэтиленовые", "polietilen quvur quvur"),
    (r"полиэтилен", "Полиэтилен", "polietilen"),
    (r"полипропилен", "Полипропилен", "polipropilen"),
    (r"поливинилхлорид", "Поливинилхлорид (ПВХ)", "polivinilxlorid pvx"),
    (r"карбамид|мочевина", "Карбамид", "karbamid mochevina"),
    (r"селитра", "Аммиачная селитра", "ammiakli selitra selitra"),
    (r"серная|серн", "Серная кислота", "sulfat kislota"),
    (r"сода", "Сода каустическая", "kaustik soda"),
    (r"^азот", "Азот", "azot"),
    (r"аргон", "Аргон", "argon"),
    (r"кабел", "Кабель силовой", "kabel"),
    (r"подшипник", "Подшипник", "podshipnik"),
    (r"эмаль", "Эмаль", "emal bo‘yoq"),
    (r"комбикорм", "Комбикорм", "omuxta yem yem"),
    (r"кормосмесь", "Кормосмесь", "yem aralashmasi yem"),
]

_COMPILED = [(re.compile(p), fam, uz) for p, fam, uz in RULES]


def family_of(product: str):
    name = (product or "").lower()
    for rx, fam, _ in _COMPILED:
        if rx.search(name):
            return fam
    return None


UZ_NAMES = {fam: uz for _, fam, uz in RULES}
FAMILIES = list(dict.fromkeys(fam for _, fam, _ in RULES))
