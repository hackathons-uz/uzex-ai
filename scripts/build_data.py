"""Build clean Parquet tables from the raw UZEX CSVs.

Usage: .venv/bin/python scripts/build_data.py [raw_csv_dir] [out_dir]
Defaults: data/ -> data/db/
"""
import os
import sys
import time

import duckdb

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agent.textnorm import company_key, norm, product_key  # noqa: E402

RAW = sys.argv[1] if len(sys.argv) > 1 else "data"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/db"

REGIONS = [
    # (uz_latin as in deals/participants, russian as in contracts, uz_cyrillic)
    ("Andijon viloyati", "Андижанская область", "Андижон вилояти"),
    ("Buxoro viloyati", "Бухарская область", "Бухоро вилояти"),
    ("Farg‘ona viloyati", "Ферганская область", "Фарғона вилояти"),
    ("Jizzax viloyati", "Джизакская область", "Жиззах вилояти"),
    ("Namangan viloyati", "Наманганская область", "Наманган вилояти"),
    ("Navoiy viloyati", "Навоийская область", "Навоий вилояти"),
    ("Qashqadaryo viloyati", "Кашкадарьинская область", "Қашқадарё вилояти"),
    ("Qoraqalpog‘iston Respublikasi", "Республика Каракалпакстан", "Қорақалпоғистон Республикаси"),
    ("Samarqand viloyati", "Самаркандская область", "Самарқанд вилояти"),
    ("Sirdaryo viloyati", "Сырдарьинская область", "Сирдарё вилояти"),
    ("Surxondaryo viloyati", "Сурхандарьинская область", "Сурхондарё вилояти"),
    ("Toshkent shahri", "г. Ташкент", "Тошкент шаҳри"),
    ("Toshkent viloyati", "Ташкентская область", "Тошкент вилояти"),
    ("Xorazm viloyati", "Хорезмская область", "Хоразм вилояти"),
]

NUM = "TRY_CAST(regexp_replace({c}, '[\\s ]', '', 'g') AS DOUBLE)"
DATE = "TRY_STRPTIME(NULLIF({c}, ''), '%d.%m.%Y')::DATE"


def n(c):
    return NUM.format(c=f'"{c}"')


def d(c):
    return DATE.format(c=f'"{c}"')


def add_key(con, table, src, dst, fn):
    """Add column `dst` = fn(`src`), computed in Python (no numpy needed)."""
    vals = [r[0] for r in con.execute(f"SELECT DISTINCT {src} FROM {table}").fetchall()]
    con.execute("CREATE OR REPLACE TEMP TABLE _k(src VARCHAR, k VARCHAR)")
    con.executemany("INSERT INTO _k VALUES (?, ?)", [(v, fn(v)) for v in vals])
    con.execute(f"ALTER TABLE {table} ADD COLUMN {dst} VARCHAR")
    con.execute(f"UPDATE {table} t SET {dst} = _k.k FROM _k WHERE _k.src = t.{src}")


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    con = duckdb.connect()

    rd = lambda f: f"read_csv('{RAW}/{f}', header=true, all_varchar=true, quote='\"', escape='\"')"

    con.execute("CREATE TABLE regions(region VARCHAR, region_ru VARCHAR, region_uz_cyr VARCHAR)")
    con.executemany("INSERT INTO regions VALUES (?, ?, ?)", REGIONS)

    con.execute(f"""
        CREATE TABLE usd_rates AS
        SELECT {d('Дата')} AS rate_date, {n('Курс')} AS usd_rate FROM {rd('usd_rates.csv')}
    """)

    con.execute(f"""
        CREATE TABLE participants AS
        SELECT "ИНН" AS inn, "Наименование" AS name, "Регион" AS region,
               "Вид деятельности" AS activity, "Роль" AS role,
               ("Плательщик НДС" = 'Да') AS vat_payer
        FROM {rd('participants.csv')}
    """)

    con.execute(f"""
        CREATE TABLE brokers AS
        SELECT "Код брокера" AS broker_code, "Наименование" AS name, "ИНН" AS inn, "Регион" AS region
        FROM {rd('brokers.csv')}
    """)

    con.execute(f"""
        CREATE TABLE contracts AS
        SELECT TRY_CAST("Номер контракта" AS BIGINT) AS contract_id,
               "Наименование продукта" AS product,
               NULLIF("Марка товара", '') AS brand, NULLIF("Размер товара", '') AS size,
               NULLIF("Сорт товара", '') AS grade, NULLIF("Тип товара", '') AS type,
               NULLIF("Класс товара", '') AS class,
               "Код ТН ВЭД" AS hs_code, "Группа товара" AS product_group,
               "Категория товара" AS category, "Отрасль промышленности" AS industry,
               "Единица измерения" AS unit, {n('Лот')} AS lot_size,
               CASE "Валюта" WHEN 'Доллар США' THEN 'USD' ELSE 'UZS' END AS currency,
               {n('Базисная цена')} AS base_price,
               TRY_CAST(regexp_replace("Сумма залога", '[^0-9.]', '', 'g') AS DOUBLE) AS deposit_pct,
               "Базис поставки" AS delivery_basis, "Упаковка" AS packaging,
               r.region AS region, "Адрес склада" AS warehouse_address,
               "Тип торгов" AS trade_type, "Тип контракта" AS contract_type,
               "Форма контракта" AS contract_form,
               TRY_CAST("Срок оплаты" AS INTEGER) AS payment_term_days,
               TRY_CAST("Срок поставки" AS INTEGER) AS delivery_term_days,
               "ИНН продавца" AS seller_inn,
               {d('Дата регистрации')} AS registered_on, {d('Действует до')} AS valid_until
        FROM {rd('contracts.csv')} c LEFT JOIN regions r ON r.region_ru = c."Регион"
    """)

    add_key(con, "participants", "name", "search_key", company_key)
    add_key(con, "brokers", "name", "search_key", company_key)
    add_key(con, "contracts", "product", "product_key", product_key)

    con.execute(f"""
        CREATE TABLE deals AS
        WITH raw AS (SELECT * FROM {rd('deals_20*.csv')})
        SELECT TRY_CAST("Номер сделки" AS BIGINT) AS deal_id,
               {d('Дата сделки')} AS deal_date,
               "Время сделки" AS deal_time,
               "Тип торгов" AS trade_type,
               {n('Количество')} AS lots,
               {n('Сумма сделки')} AS amount,
               {n('Стартовая цена')} AS start_price,
               TRY_CAST("Номер контракта" AS BIGINT) AS contract_id,
               "Наименование товара" AS product_full,
               {n('Лот')} AS lot_size,
               "Единица измерения" AS unit,
               "Регион" AS region,
               "Тип контракта" AS contract_type,
               "Форма контракта" AS contract_form,
               "Состояние сделки" AS status,
               "ИНН продавца" AS seller_inn, "ИНН покупателя" AS buyer_inn,
               "Брокер продавца" AS seller_broker, "Брокер покупателя" AS buyer_broker,
               {d('Дата оплаты')} AS payment_date, {d('Дата поставки')} AS delivery_date,
               {n('Поставлено')} AS delivered_lots
        FROM raw
    """)

    con.execute("""
        CREATE TABLE deals2 AS
        SELECT d.deal_id, d.deal_date, d.deal_time,
               year(d.deal_date) AS year, month(d.deal_date) AS month,
               d.trade_type, d.lots, d.lot_size, d.unit,
               d.lots * d.lot_size AS volume,
               d.amount, c.currency,
               CASE WHEN c.currency = 'USD' THEN r.usd_rate ELSE NULL END AS usd_rate,
               CASE WHEN c.currency = 'USD' THEN d.amount * r.usd_rate ELSE d.amount END AS amount_uzs,
               CASE WHEN c.currency = 'USD' THEN d.amount ELSE d.amount / r.usd_rate END AS amount_usd,
               d.amount / NULLIF(d.lots * d.lot_size, 0) AS unit_price,
               d.start_price,
               d.contract_id, d.product_full, c.product, c.product_key,
               c.category, c.product_group, c.industry, c.hs_code,
               d.region, d.contract_type, d.contract_form, d.status,
               d.status = 'Аннулирован(Не оплачен)' AS is_cancelled,
               d.seller_inn, ps.name AS seller_name,
               d.buyer_inn, pb.name AS buyer_name,
               d.seller_broker, d.buyer_broker,
               d.payment_date, d.delivery_date, d.delivered_lots
        FROM deals d
        LEFT JOIN contracts c USING (contract_id)
        LEFT JOIN usd_rates r ON r.rate_date = d.deal_date
        LEFT JOIN participants ps ON ps.inn = d.seller_inn
        LEFT JOIN participants pb ON pb.inn = d.buyer_inn
        ORDER BY d.deal_id
    """)
    con.execute("DROP TABLE deals; ALTER TABLE deals2 RENAME TO deals")

    # Product catalogue for fuzzy search: one row per distinct deal product string.
    con.execute("""
        CREATE TABLE products AS
        SELECT product_full, any_value(product) AS product, any_value(product_key) AS product_key,
               any_value(category) AS category, any_value(unit) AS unit,
               count(*) AS n_deals, min(deal_date) AS first_deal, max(deal_date) AS last_deal
        FROM deals GROUP BY product_full
    """)
    add_key(con, "products", "product_full", "search_key", norm)

    for t in ["deals", "contracts", "participants", "brokers", "usd_rates", "regions", "products"]:
        con.execute(f"COPY {t} TO '{OUT}/{t}.parquet' (FORMAT parquet, COMPRESSION zstd)")
        cnt = con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        print(f"{t:14s} {cnt:>8,} rows  {os.path.getsize(f'{OUT}/{t}.parquet') / 1e6:6.1f} MB")

    # Sanity checks: every join resolved.
    checks = {
        "deals with no contract": "SELECT count(*) FROM deals WHERE product IS NULL",
        "deals with no amount": "SELECT count(*) FROM deals WHERE amount IS NULL",
        "deals with no date": "SELECT count(*) FROM deals WHERE deal_date IS NULL",
        "USD deals with no rate": "SELECT count(*) FROM deals WHERE currency='USD' AND usd_rate IS NULL",
        "deals with unknown seller": "SELECT count(*) FROM deals WHERE seller_name IS NULL",
        "deals with unknown buyer": "SELECT count(*) FROM deals WHERE buyer_name IS NULL",
        "contracts with unmapped region": "SELECT count(*) FROM contracts WHERE region IS NULL",
    }
    for label, q in checks.items():
        print(f"check: {label:32s} {con.execute(q).fetchone()[0]}")
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
