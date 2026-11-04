import { useEffect, useRef, useState } from "react";

const T = {
  ru: {
    title: "UZEX AI — агент по биржевым сделкам",
    subtitle: "Отвечает только по данным реестра: 500 000 сделок, 03.01.2022 – 30.10.2026",
    placeholder: "Задайте вопрос на русском или узбекском…",
    send: "Спросить",
    thinking: "Ищу в данных",
    how: "Как получен ответ",
    assumptions: "Условия",
    noData: "Нет в данных",
    verified: "Числа сверены с результатами запросов",
    unverified: "Не все числа удалось сверить",
    search: "Поиск",
    sql: "SQL-запрос",
    rows: "строк",
    examples: "Примеры",
    error: "Ошибка сервера",
    sec: "с",
  },
  uz: {
    title: "UZEX AI — birja bitimlari bo‘yicha agent",
    subtitle: "Faqat reyestr ma’lumotlari bo‘yicha javob beradi: 500 000 bitim, 03.01.2022 – 30.10.2026",
    placeholder: "Savolni o‘zbek yoki rus tilida yozing…",
    send: "So‘rash",
    thinking: "Ma’lumotlardan qidiryapman",
    how: "Javob qanday olindi",
    assumptions: "Shartlar",
    noData: "Ma’lumotlarda yo‘q",
    verified: "Raqamlar so‘rov natijalari bilan tekshirildi",
    unverified: "Barcha raqamlar tekshirilmadi",
    search: "Qidiruv",
    sql: "SQL so‘rov",
    rows: "qator",
    examples: "Misollar",
    error: "Server xatosi",
    sec: "s",
  },
};

const EXAMPLES = [
  "Сколько сделок по сахару было в 2024 году?",
  "Топ-5 покупателей карбамида по сумме за 2025 год",
  "Сделка №280091: кто продавец и покупатель?",
  "2025-yilda eng ko‘p bitim tuzgan broker qaysi?",
  "Экспорт сделкалари 2023 йилда неча доллар бўлган?",
  "Сделки по золоту в 2027 году",
];

function Table({ columns, rows, max = 20 }) {
  if (!columns?.length) return null;
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? "∅" : String(v)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Step({ s, t }) {
  if (s.tool === "guard") {
    return <div className="step guard">⚠ {s.purpose}: {s.unverified?.join(", ")}</div>;
  }
  const r = s.result || {};
  if (s.tool === "search_entities") {
    const cands = r.candidates || [];
    const cols = cands.length ? Object.keys(cands[0]) : [];
    return (
      <div className="step">
        <div className="step-h">🔎 {t.search}: <b>{s.kind}</b> «{s.query ?? s.purpose}» · {cands.length}</div>
        {r.error && <div className="err">{r.error}</div>}
        <Table columns={cols} rows={cands.map((c) => cols.map((k) => c[k]))} max={8} />
      </div>
    );
  }
  return (
    <div className="step">
      <div className="step-h">🗄 {t.sql}: {s.purpose} {r.row_count !== undefined && <span className="muted">· {r.row_count} {t.rows} · {r.ms} ms</span>}</div>
      <pre>{s.query}</pre>
      {r.error ? <div className="err">{r.error}</div> : <Table columns={r.columns} rows={r.rows || []} />}
    </div>
  );
}

function AgentMsg({ m, t }) {
  const [open, setOpen] = useState(false);
  if (m.error) return <div className="msg agent error">{t.error}: {m.error}</div>;
  const d = m.data;
  return (
    <div className="msg agent">
      <div className="badges">
        {!d.answerable && <span className="badge nodata">{t.noData}</span>}
        {d.answerable && (d.verified ? <span className="badge ok">✓ {t.verified}</span> : <span className="badge warn">{t.unverified}</span>)}
        <span className="badge muted">{d.elapsed_s} {t.sec}</span>
      </div>
      <div className="answer">{d.answer}</div>
      {d.assumptions?.length > 0 && (
        <div className="assump"><b>{t.assumptions}:</b> {d.assumptions.join("; ")}</div>
      )}
      {d.steps?.length > 0 && (
        <>
          <button className="link" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} {t.how} ({d.steps.length})</button>
          {open && <div className="steps">{d.steps.map((s, i) => <Step key={i} s={s} t={t} />)}</div>}
        </>
      )}
    </div>
  );
}

export default function App() {
  const [ui, setUi] = useState(() => {
    try { return localStorage.getItem("ui") || "ru"; } catch { return "ru"; }
  });
  const t = T[ui];
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const endRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("ui", ui); } catch {} }, [ui]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    if (!busy) return;
    setTick(0);
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function ask(text) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ("");
    const history = msgs
      .filter((m) => m.role === "agent" && m.data)
      .slice(-3)
      .map((m) => ({ q: m.q, a: m.data.answer }));
    setMsgs((x) => [...x, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setMsgs((x) => [...x, { role: "agent", q: question, data }]);
    } catch (e) {
      setMsgs((x) => [...x, { role: "agent", error: String(e.message || e) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>{t.title}</h1>
          <p className="muted">{t.subtitle}</p>
        </div>
        <div className="lang">
          {["ru", "uz"].map((l) => (
            <button key={l} className={ui === l ? "on" : ""} onClick={() => setUi(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <main>
        {msgs.length === 0 && (
          <div className="examples">
            <div className="muted">{t.examples}:</div>
            {EXAMPLES.map((e) => <button key={e} onClick={() => ask(e)}>{e}</button>)}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? <div key={i} className="msg user">{m.text}</div> : <AgentMsg key={i} m={m} t={t} />
        )}
        {busy && <div className="msg agent thinking">{t.thinking}… {tick} {t.sec}</div>}
        <div ref={endRef} />
      </main>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <textarea
          value={q}
          rows={2}
          placeholder={t.placeholder}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
        />
        <button type="submit" disabled={busy || !q.trim()}>{t.send}</button>
      </form>
    </div>
  );
}
