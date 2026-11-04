/* =========================================================
   UZEX AI — чат-помощник · демо (без бэкенда)
   Один rAF-цикл на всё: курсор, края, сборка ответа из пикселей.
   Цикл засыпает, когда нечего рисовать, и стоит на скрытой вкладке.
   ========================================================= */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ||
            !!(navigator.connection && navigator.connection.saveData);
const rnd = Math.random;

/* ---------- общий цикл анимации ---------- */
const tasks = new Set();
let raf = 0;
function tick(t) {
  raf = 0;
  for (const f of tasks) if (!f(t)) tasks.delete(f);
  if (tasks.size) wake();
}
function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }
function run(f) { tasks.add(f); wake(); }
document.addEventListener('visibilitychange', wake);

/* ---------- пиксельные иконки: битмапы → SVG ---------- */
const BM = {
  panel: ['##########','#..#.....#','#..#.....#','#..#.....#','#..#.....#','#..#.....#','#..#.....#','#..#.....#','#..#.....#','##########'],
  plus:  ['....##....','....##....','....##....','....##....','##########','##########','....##....','....##....','....##....','....##....'],
  close: ['##......##','###....###','.###..###.','..######..','...####...','...####...','..######..','.###..###.','###....###','##......##'],
  arrow: ['....##....','.....##...','......##..','.......##.','##########','##########','.......##.','......##..','.....##...','....##....'],
  stop:  ['..........','..........','..######..','..######..','..######..','..######..','..######..','..######..','..........','..........'],
  copy:  ['..########','..#......#','..#......#','######...#','#....#...#','#....#...#','#....#####','#....#....','#....#....','######....'],
  retry: ['...####...','..#....#.#','.#......##','#......###','#.........','#.........','#........#','.#......#.','..#....#..','...####...'],
  check: ['..........','.........#','........##','.......##.','#.....##..','##...##...','.##.##....','..###.....','...#......','..........'],
  heart: ['.##.##.','#######','#######','.#####.','..###..','...#...'],
  back:  ['....##....','...##.....','..##......','.##.......','##########','##########','.##.......','..##......','...##.....','....##....'],
  chev:  ['..##....','...##...','....##..','.....##.','.....##.','....##..','...##...','..##....'],
  doc:   ['######..','#....##.','#.....##','#.##...#','#......#','#.####.#','#......#','#.####.#','#......#','########'],
};
function svg(name) {
  const m = BM[name]; if (!m) return '';
  let d = '';
  m.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] === '#') { let l = 0; while (row[x + l] === '#') l++; d += `M${x} ${y}h${l}v1h-${l}z`; x += l; }
      else x++;
    }
  });
  return `<svg viewBox="0 0 ${m[0].length} ${m.length}" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}
function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon); }); }

/* ---------- тексты ---------- */
const I18N = {
  ru: {
    t1: 'Спросите', t2: 'про {w}', rw: ['биржу', 'торги', 'госзакупки', 'аукционы', 'тарифы', 'задаток', 'комиссии'],
    history: 'История', newChat: 'Новый чат', close: 'Закрыть', lang: 'Язык интерфейса',
    ask: 'Ваш вопрос', send: 'Отправить', stop: 'Остановить ответ',
    tabHint: 'подставить вопрос', follow: 'Задайте уточняющий вопрос',
    today: 'Сегодня', yday: 'Вчера', earlier: 'Ранее', histEmpty: 'Здесь появятся ваши чаты. Начните с любого вопроса о бирже.',
    copy: 'Скопировать', copied: 'Скопировано', retry: 'Ответить заново',
    errT: 'Ответ не получен', errP: 'Не удалось связаться с сервером. Проверьте соединение и повторите запрос.', errBtn: 'Повторить',
    phases: ['Читаю вопрос', 'Ищу в документах биржи', 'Собираю ответ'],
    q1: 'Как участвовать в госзакупках через биржу?', q2: 'А какие комиссии на биржевых торгах?',
    sugg: [
      'Как зарегистрироваться на бирже?',
      'Как участвовать в госзакупках?',
      'Какие комиссии на биржевых торгах?',
      'Как вернуть задаток после торгов?',
      'Что такое электронный магазин?',
      'Как подать заявку на аукцион?',
    ],
    aboutNav: 'О проекте', aboutT: 'О решении', teamT: 'О нас', toChat: 'К чату', demoTag: 'Демо-текст',
    about: {
      h: 'Помощник по вопросам биржи',
      p: ['UZEX AI отвечает на вопросы клиентов о биржевых торгах, госзакупках и регистрации простым языком и со ссылками на документы.',
          'Ответы строятся на регламентах и тарифах биржи, поэтому каждый можно проверить по источнику.'],
      listH: 'Что умеет',
      list: ['Ответ со ссылками на документы', 'Русский и узбекский языки', 'Удобно на телефоне и компьютере', 'История чатов всегда под рукой'],
    },
    team: {
      h: 'Команда devtones',
      p: 'Мы команда из трёх человек: AI/ML-инженер, frontend-разработчик и продуктовый дизайнер. Вместе закрываем весь цикл от модели и бэкенда до интерфейса и UX. Двое из нас работают в одной продуктовой компании (BILLZ), поэтому привыкли быстро доводить идеи до рабочего релиза.',
      stackL: 'Стек', eduL: 'Образование', photo: 'Фото',
      members: [
        { n: 'Аброрхон Озодходжаев', img: 'abror', role: 'Product Design', exp: 'с сентября 2022',
          pts: [
            'Middle Product Designer в BILLZ, retail SaaS/POS-платформе для стран СНГ. Единственный продуктовый дизайнер в компании.',
            'Ведёт дизайн нескольких продуктов: BILLZ 2.0, BILLZ Grocery и BILLZ Lite. Проектирует сложные B2B-флоу: интеграции с оборудованием (весы), подписки и тарифы, онбординг и product tour, финансовые операции, платёжные решения.',
            'Строит и развивает дизайн-систему (цветовые и семантические токены), делает UX-исследования, прототипы и спецификации для разработки.',
          ],
          stack: ['Figma', 'Дизайн-системы', 'Прототипирование', 'UX-research', 'Handoff разработчикам'],
          edu: 'BSc Computer Science and Software Engineering, Inha University in Tashkent, выпуск 2026. Языки: узбекский, русский, английский (IELTS 7.0).' },
        { n: 'Бобохон Абдурахмонов', img: 'bobokhon', role: 'AI/ML', exp: 'около 3 лет практического опыта',
          pts: [
            'ТН ВЭД / HS-классификация для Государственного таможенного комитета РУз: end-to-end система на векторном поиске и LLM, точность 83%, ~60 млн записей, самообучение на обратной связи экспертов. По теме опубликована статья на TechRxiv.',
            'AI-сервис для выявления запрещённых товаров (LLM + экспертные правила), который используется в таможенной инфраструктуре.',
            'Newo.ai: Lead Solution Engineer на крупнейшем production-проекте, мультиагентный голосовой AI, ~1 млн сессий в месяц.',
            'RAG-системы: чатбот для образовательной платформы Menta (FastAPI, Qdrant, LangGraph); юридический RAG-бот Lexora (40 000+ документов, 400+ пользователей).',
            'Twistly (Lincoln Labs): LLM-пайплайны для AI-аддина PowerPoint с 500 000+ пользователей, ускорение генерации до 2 раз.',
          ],
          stack: ['Python', 'PyTorch', 'LangChain / LangGraph', 'RAG: Qdrant, FAISS, reranking', 'Voice AI: STT/TTS, voice-to-voice, SIP/IVR', 'Мультиагентные системы', 'FastAPI', 'PostgreSQL', 'Redis', 'Docker', 'GCP / AWS', 'Telegram-боты'] },
        { n: 'Асилбек Низамов', img: 'asilbek', role: 'Frontend', exp: '2+ года коммерческого опыта',
          pts: [
            'BILLZ (B2B SaaS), с июля 2024: разрабатывает веб-приложение для розничного бизнеса на React и TypeScript: новые фичи, клиентские запросы, хотфиксы, рефакторинг легаси. Участвует почти во всех релизах.',
            'Сделал frontend отчёта по эффективности промо-акций, который раскатили на всех клиентов. Интеграция оплаты тарифов через Rahmat, поддержка нескольких штрихкодов у товара, модуль плановых показателей продаж.',
            'Работает с большими таблицами и формами: AG Grid, TanStack Table/Virtual/Query, react-hook-form + zod. Пишет тесты (Vitest, Jest, React Testing Library). Промо-сайт на Next.js: новые страницы, SEO, маркетинговые интеграции.',
            'Ежедневно использует ИИ-инструменты в разработке: делегирует рутину и ускоряет прототипирование, поэтому собирает рабочий прототип за 48 часов.',
          ],
          stack: ['React', 'TypeScript', 'Next.js', 'Zustand', 'TanStack Query', 'REST API', 'WebSocket', 'Git', 'Agile / Scrum'],
          edu: 'Inha University in Tashkent (SOCIE), выпуск 2026, грант; семестр по обмену в Корее.' },
      ],
      foot: 'Ташкент · U-ENTER · 7–8 ноября 2026',
    },
    hist: ['Участие в госзакупках', 'Комиссии на торгах', 'Возврат задатка после торгов', 'Регистрация брокера', 'Электронный магазин: с чего начать', 'Аукцион по хлопку-сырцу', 'Документы для аккредитации'],
    histT: ['14:32', '10:05', '19:47', '09:18', '3 нояб.', '1 нояб.', '28 окт.'],
    a1: {
      blocks: [
        { p: 'Чтобы участвовать в государственных закупках через биржу, нужно пройти несколько шагов:' },
        { ol: [
          '**Получите ЭЦП** — электронную цифровую подпись организации.',
          '**Зарегистрируйтесь** на портале госзакупок и заполните профиль компании.',
          '**Пополните лицевой счёт** — при подаче предложения блокируется задаток.',
          '**Выберите лот** и подайте предложение до окончания приёма заявок.',
        ] },
        { p: 'После подведения итогов задаток участников, которые не победили, разблокируется.' },
      ],
      src: ['Регламент госзакупок · пример', 'Порядок задатков · пример'],
    },
    a2: {
      blocks: [
        { p: 'Размер **биржевого сбора** зависит от вида торгов и категории товара.' },
        { p: 'Точные ставки указаны в тарифах биржи — их можно уточнить в личном кабинете или у вашего брокера.' },
      ],
      src: ['Тарифы биржи · пример'],
    },
  },
  uz: {
    t1: '{w} haqida', t2: 'soʻrang', rw: ['Birja', 'Savdolar', 'Xaridlar', 'Auksionlar', 'Tariflar', 'Zakalat', 'Komissiya'],
    history: 'Tarix', newChat: 'Yangi chat', close: 'Yopish', lang: 'Interfeys tili',
    ask: 'Savolingiz', send: 'Yuborish', stop: 'Javobni toʻxtatish',
    tabHint: 'savolni qoʻyish', follow: 'Aniqlashtiruvchi savol bering',
    today: 'Bugun', yday: 'Kecha', earlier: 'Avvalroq', histEmpty: 'Bu yerda suhbatlaringiz paydo boʻladi. Birja haqida istalgan savoldan boshlang.',
    copy: 'Nusxa olish', copied: 'Nusxa olindi', retry: 'Qayta javob berish',
    errT: 'Javob olinmadi', errP: 'Server bilan bogʻlanib boʻlmadi. Internet aloqasini tekshirib, soʻrovni takrorlang.', errBtn: 'Takrorlash',
    phases: ['Savolni oʻqiyapman', 'Birja hujjatlaridan qidiryapman', 'Javobni yigʻyapman'],
    q1: 'Birja orqali davlat xaridlarida qanday ishtirok etiladi?', q2: 'Birja savdolarida komissiyalar qancha?',
    sugg: [
      'Birjada qanday roʻyxatdan oʻtiladi?',
      'Davlat xaridlarida qanday ishtirok etish mumkin?',
      'Birja savdolarida komissiya qancha?',
      'Savdodan keyin zakalat qanday qaytariladi?',
      'Elektron doʻkon nima?',
      'Auksionga qanday ariza beriladi?',
    ],
    aboutNav: 'Loyiha haqida', aboutT: 'Yechim haqida', teamT: 'Biz haqimizda', toChat: 'Chatga', demoTag: 'Demo matn',
    about: {
      h: 'Birja savollari boʻyicha yordamchi',
      p: ['UZEX AI mijozlarning birja savdolari, davlat xaridlari va roʻyxatdan oʻtish haqidagi savollariga oddiy tilda va hujjatlarga havolalar bilan javob beradi.',
          'Javoblar birja reglamentlari va tariflariga asoslanadi, shuning uchun har birini manba orqali tekshirish mumkin.'],
      listH: 'Nimalar qila oladi',
      list: ['Hujjatlarga havolali javoblar', 'Rus va oʻzbek tillari', 'Telefon va kompyuterda qulay', 'Suhbatlar tarixi doim yoningizda'],
    },
    team: {
      h: 'devtones jamoasi',
      p: 'Biz uch kishilik jamoamiz: AI/ML muhandisi, frontend-dasturchi va mahsulot dizayneri. Birgalikda modeldan va backenddan tortib interfeys va UXgacha boʻlgan butun siklni qamrab olamiz. Ikkimiz bitta mahsulot kompaniyasida (BILLZ) ishlaymiz, shuning uchun gʻoyalarni tezda ishlaydigan relizgacha yetkazishga odatlanganmiz.',
      stackL: 'Stek', eduL: 'Taʼlim', photo: 'Surat',
      members: [
        { n: 'Abrorkhon Ozodkhujaev', img: 'abror', role: 'Product Design', exp: '2022-yil sentyabridan',
          pts: [
            'BILLZda Middle Product Designer: MDH mamlakatlari uchun retail SaaS/POS platforma. Kompaniyadagi yagona mahsulot dizayneri.',
            'Bir nechta mahsulot dizaynini olib boradi: BILLZ 2.0, BILLZ Grocery va BILLZ Lite. Murakkab B2B-flowlarni loyihalaydi: uskunalar (tarozi) bilan integratsiya, obunalar va tariflar, onboarding va product tour, moliyaviy operatsiyalar, toʻlov yechimlari.',
            'Dizayn-tizimni quradi va rivojlantiradi (rang va semantik tokenlar), UX-tadqiqotlar, prototiplar va ishlab chiqish uchun spetsifikatsiyalar tayyorlaydi.',
          ],
          stack: ['Figma', 'Dizayn-tizimlar', 'Prototiplash', 'UX-research', 'Dasturchilarga handoff'],
          edu: 'BSc Computer Science and Software Engineering, Inha University in Tashkent, 2026-yil bitiruvchisi. Tillar: oʻzbek, rus, ingliz (IELTS 7.0).' },
        { n: 'Boboxon Abduraxmonov', img: 'bobokhon', role: 'AI/ML', exp: 'qariyb 3 yillik amaliy tajriba',
          pts: [
            'OʻzR Davlat bojxona qoʻmitasi uchun TIF TN / HS-tasniflash: vektor qidiruv va LLMga asoslangan end-to-end tizim, aniqlik 83%, ~60 mln yozuv, ekspertlar fikri asosida oʻz-oʻzini oʻqitish. Mavzu boʻyicha TechRxivda maqola chop etilgan.',
            'Taqiqlangan tovarlarni aniqlash uchun AI-servis (LLM + ekspert qoidalari), bojxona infratuzilmasida qoʻllaniladi.',
            'Newo.ai: eng yirik production-loyihada Lead Solution Engineer, multiagentli ovozli AI, oyiga ~1 mln sessiya.',
            'RAG-tizimlar: Menta taʼlim platformasi uchun chatbot (FastAPI, Qdrant, LangGraph); Lexora yuridik RAG-boti (40 000+ hujjat, 400+ foydalanuvchi).',
            'Twistly (Lincoln Labs): 500 000+ foydalanuvchili PowerPoint AI-qoʻshimchasi uchun LLM-paypleynlar, generatsiyani 2 baravargacha tezlashtirish.',
          ],
          stack: ['Python', 'PyTorch', 'LangChain / LangGraph', 'RAG: Qdrant, FAISS, reranking', 'Voice AI: STT/TTS, voice-to-voice, SIP/IVR', 'Multiagent tizimlar', 'FastAPI', 'PostgreSQL', 'Redis', 'Docker', 'GCP / AWS', 'Telegram-botlar'] },
        { n: 'Asilbek Nizamov', img: 'asilbek', role: 'Frontend', exp: '2+ yillik tijoriy tajriba',
          pts: [
            'BILLZ (B2B SaaS), 2024-yil iyulidan: chakana savdo uchun React va TypeScriptda veb-ilova ishlab chiqadi: yangi funksiyalar, mijozlar soʻrovlari, hotfikslar, legacy-kodni refaktoring qilish. Deyarli barcha relizlarda ishtirok etadi.',
            'Promo-aksiyalar samaradorligi hisobotining frontendini yaratdi, u barcha mijozlarga joriy etildi. Tariflar uchun Rahmat orqali toʻlov integratsiyasi, tovarda bir nechta shtrix-kod, rejali savdo koʻrsatkichlari moduli.',
            'Katta jadvallar va formalar bilan ishlaydi: AG Grid, TanStack Table/Virtual/Query, react-hook-form + zod. Testlar yozadi (Vitest, Jest, React Testing Library). Next.jsdagi promo-sayt: yangi sahifalar, SEO, marketing integratsiyalari.',
            'Ishlab chiqishda har kuni AI-vositalardan foydalanadi: rutinani topshiradi va prototiplashni tezlashtiradi, shuning uchun ishlaydigan prototipni 48 soatda yigʻadi.',
          ],
          stack: ['React', 'TypeScript', 'Next.js', 'Zustand', 'TanStack Query', 'REST API', 'WebSocket', 'Git', 'Agile / Scrum'],
          edu: 'Inha University in Tashkent (SOCIE), 2026-yil bitiruvchisi, grant; Koreyada almashinuv semestri.' },
      ],
      foot: 'Toshkent · U-ENTER · 7–8-noyabr 2026',
    },
    hist: ['Davlat xaridlarida ishtirok', 'Savdo komissiyalari', 'Savdodan keyin zakalatni qaytarish', 'Brokerni roʻyxatdan oʻtkazish', 'Elektron doʻkon: nimadan boshlash', 'Paxta xomashyosi auksioni', 'Akkreditatsiya uchun hujjatlar'],
    histT: ['14:32', '10:05', '19:47', '09:18', '3-noy', '1-noy', '28-okt'],
    a1: {
      blocks: [
        { p: 'Birja orqali davlat xaridlarida ishtirok etish uchun bir necha qadamni bajarish kerak:' },
        { ol: [
          '**ERI oling** — tashkilotning elektron raqamli imzosi.',
          '**Roʻyxatdan oʻting** — davlat xaridlari portalida kompaniya profilini toʻldiring.',
          '**Shaxsiy hisobni toʻldiring** — taklif berishda zakalat bloklanadi.',
          '**Lotni tanlang** va arizalar qabuli tugagunga qadar taklif yuboring.',
        ] },
        { p: 'Natijalar eʼlon qilingach, gʻolib boʻlmagan ishtirokchilarning zakalati blokdan chiqariladi.' },
      ],
      src: ['Davlat xaridlari reglamenti · namuna', 'Zakalat tartibi · namuna'],
    },
    a2: {
      blocks: [
        { p: '**Birja yigʻimi** miqdori savdo turi va tovar toifasiga bogʻliq.' },
        { p: 'Aniq stavkalar birja tariflarida koʻrsatilgan — ularni shaxsiy kabinetda yoki brokeringizdan aniqlashingiz mumkin.' },
      ],
      src: ['Birja tariflari · namuna'],
    },
  },
};
const HIST_GROUPS = [['today', [0, 1]], ['yday', [2, 3]], ['earlier', [4, 5, 6]]];

/* ---------- состояние ---------- */
const S = { lang: 'ru', view: 'landing', msgs: [], busy: false, histEmpty: false, chat: null };
const T = () => I18N[S.lang];

const app = $('#app'), hero = $('#hero'), thread = $('#thread'), threadIn = $('#threadIn');
const dock = $('#dock'), form = $('#ask'), q = $('#q'), phT = $('#phT'), phC = $('.ph-c'), sendBtn = $('#send');
const hist = $('#hist'), histList = $('#histList'), scrim = $('#scrim');
const histBtns = [$('#histBtn'), $('#histBtnM')];
const demo = $('#demo'), demoBtn = $('#demoBtn');

function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rich(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
function plain(a) { return a.blocks.map(b => b.p || b.ol.map((x, i) => `${i + 1}. ${x}`).join('\n')).join('\n\n').replace(/\*\*/g, ''); }

/* =========================================================
   Края: зеркальный «стакан заявок» из пикселей
   Слева покупка (неон), справа продажа (синий). Шаги дискретные,
   ~11 кадров в секунду: пиксельно и почти бесплатно для CPU.
   ========================================================= */
const E = { cv: $('#edges') };
E.ctx = E.cv.getContext('2d');
function sizeEdges() {
  const w = innerWidth, h = innerHeight;
  const dpr = Math.min(LOW ? 1.5 : 2, devicePixelRatio || 1);
  E.cv.width = Math.round(w * dpr); E.cv.height = Math.round(h * dpr);
  E.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mob = w <= 760;
  const rail = mob ? 0 : 64;
  E.cell = mob ? 5 : (LOW ? 11 : 9);
  E.step = E.cell + (mob ? 2 : 3);
  const free = (w - rail - 736) / 2 - 32;                 // место по бокам от колонки
  const zone = w >= 1024 ? Math.max(72, Math.min(free, 360)) : w * (mob ? .12 : .15);
  E.cols = Math.max(3, Math.floor(zone / E.step));
  const padT = mob ? 60 : 64;                              // под верхней панелью не рисуем
  E.rows = Math.floor((h - padT - 12) / E.step);
  E.top = padT;
  E.xl = rail; E.xr = w;
  E.w = w; E.h = h;
  const n = E.rows;
  E.tl = new Float32Array(n); E.tr = new Float32Array(n);
  E.cl = E.cl && E.cl.length === n ? E.cl : new Int16Array(n);
  E.cr = E.cr && E.cr.length === n ? E.cr : new Int16Array(n);
  E.fl = []; E.lt = 0; E.rt = 0;
  retarget(performance.now());
  if (RM) { E.cl.set(Array.from(E.tl, Math.round)); E.cr.set(Array.from(E.tr, Math.round)); drawEdges(0); }
}
function retarget(t) {
  const mid = (E.rows - 1) / 2;
  for (let r = 0; r < E.rows; r++) {
    const d = Math.abs(r - mid) / mid;                     // 0 в центре, 1 у краёв
    const base = .1 + .9 * Math.pow(d, 1.35);
    const wob = .8 + .2 * Math.sin(t / 1900 + r * .5);
    const v = E.cols * base * wob;
    E.tl[r] = Math.max(0, Math.min(E.cols, v + (rnd() - .5) * 1.8));
    E.tr[r] = Math.max(0, Math.min(E.cols, v + (rnd() - .5) * 1.8));
  }
}
const PT = { x: -1, y: -1 };
function bump(r, left) {
  if (PT.y < 0) return 0;
  const zoneEdge = left ? E.xl + E.cols * E.step + 140 : E.xr - E.cols * E.step - 140;
  if (left ? PT.x > zoneEdge : PT.x < zoneEdge) return 0;
  const pr = (PT.y - E.top) / E.step, dy = Math.abs(r - pr);
  return dy < 5 ? Math.round(3 * (1 - dy / 5)) : 0;
}
function stepEdges() {
  let ch = false;
  for (let r = 0; r < E.rows; r++) {
    const gl = Math.min(E.cols, Math.round(E.tl[r]) + bump(r, true));
    const gr = Math.min(E.cols, Math.round(E.tr[r]) + bump(r, false));
    if (E.cl[r] !== gl) { E.cl[r] += Math.sign(gl - E.cl[r]); ch = true; }
    if (E.cr[r] !== gr) { E.cr[r] += Math.sign(gr - E.cr[r]); ch = true; }
  }
  return ch;
}
const EC = {
  ln: '#3DF08A', lm: 'rgba(61,240,138,.42)',
  rn: '#5E79E8', rm: 'rgba(94,121,232,.5)',
  body: 'rgba(201,211,255,.085)',
};
function drawEdges(t) {
  const c = E.ctx, s = E.step, k = E.cell;
  c.clearRect(0, 0, E.w, E.h);
  const pass = (left, kind) => {
    c.beginPath();
    for (let r = 0; r < E.rows; r++) {
      const n = left ? E.cl[r] : E.cr[r];
      const y = E.top + r * s;
      for (let i = 0; i < n; i++) {
        const isTip = i === n - 1, isMid = i === n - 2;
        if ((kind === 0 && !isTip && !isMid) || (kind === 1 && isMid) || (kind === 2 && isTip)) {
          const x = left ? E.xl + 8 + i * s : E.xr - 8 - k - i * s;
          c.rect(x, y, k, k);
        }
      }
    }
    c.fillStyle = kind === 0 ? EC.body : kind === 1 ? (left ? EC.lm : EC.rm) : (left ? EC.ln : EC.rn);
    c.fill();
  };
  for (const left of [true, false]) { pass(left, 0); pass(left, 1); pass(left, 2); }
  // вспышки сделок — как мигание пикселей на сайте хакатона
  for (let i = E.fl.length - 1; i >= 0; i--) {
    const f = E.fl[i], a = 1 - (t - f.t) / 650;
    if (a <= 0) { E.fl.splice(i, 1); continue; }
    const n = f.left ? E.cl[f.r] : E.cr[f.r];
    if (f.i >= n) continue;
    const x = f.left ? E.xl + 8 + f.i * s : E.xr - 8 - k - f.i * s;
    c.globalAlpha = a; c.fillStyle = '#CEFBE2'; c.fillRect(x, E.top + f.r * s, k, k);
  }
  c.globalAlpha = 1;
}
function edgesFrame(t) {
  const iv = LOW ? 110 : 90;
  if (t - E.lt < iv) return true;
  E.lt = t;
  if (t - E.rt > 1150) { E.rt = t; retarget(t); }
  const ch = stepEdges();
  if (rnd() < (LOW ? .25 : .45) && E.fl.length < 8) {
    const left = rnd() < .5, r = (rnd() * E.rows) | 0, n = left ? E.cl[r] : E.cr[r];
    if (n > 1) E.fl.push({ left, r, i: (rnd() * (n - 1)) | 0, t });
  }
  if (ch || E.fl.length) drawEdges(t);
  return true;
}
let rsT = 0;
addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(sizeEdges, 150); });
sizeEdges();
if (!RM) run(edgesFrame);

/* =========================================================
   Курсор: пиксельная стрелка, клетки догоняют мышь на пружинке
   ========================================================= */
const CUR = (() => {
  if (!FINE) return null;
  const cv = $('#cur'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = 64, H = 72, O = 10;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S_ = Math.max(2, Math.round(2.6 * dpr) / dpr);   // клетка кратна пикселю экрана
  const MAP = [
    'W.........',
    'WW........',
    'WNW.......',
    'WNNW......',
    'WNNNW.....',
    'WNNBNW....',
    'WNNBBNW...',
    'WNNBBBNW..',
    'WNNBBBBNW.',
    'WNNBBNWWWW',
    'WNNWNNW...',
    'WNW.WNNW..',
    'WW..WNNW..',
    'W....WNNW.',
    '......WW..',
  ];
  const COL = { W: '#FFFFFF', N: '#3DF08A', B: '#5E79E8' };
  const HOT = { W: '#FFFFFF', N: '#3DF08A', B: '#3DF08A' };
  const cells = [];
  MAP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') cells.push({ rx: x * S_, ry: y * S_, x: 0, y: 0, bx: 0, by: 0, k: RM ? 1 : .32 + rnd() * .38, ch });
  }));
  let mx = -100, my = -100, hot = false, lt = 0, init = false, vis = false;
  document.documentElement.classList.add('cur-on');

  function frame(t) {
    const dt = Math.min(48, t - (lt || t)) || 16.7; lt = t;
    const dec = Math.pow(.82, dt / 16.7);
    cv.style.transform = `translate3d(${mx - O}px,${my - O}px,0)`;
    ctx.clearRect(0, 0, W, H);
    let moving = false;
    const pal = hot ? HOT : COL;
    for (const ch of ['B', 'N', 'W']) {
      ctx.fillStyle = pal[ch];
      for (const c of cells) {
        if (c.ch !== ch) continue;
        const k = 1 - Math.pow(1 - c.k, dt / 16.7);
        c.x += (mx + c.rx - c.x) * k; c.y += (my + c.ry - c.y) * k;
        c.bx *= dec; c.by *= dec;
        if (Math.abs(mx + c.rx - c.x) > .15 || Math.abs(my + c.ry - c.y) > .15 || Math.abs(c.bx) > .1 || Math.abs(c.by) > .1) moving = true;
        const px = Math.max(0, Math.min(W - S_, c.x + c.bx - mx + O));
        const py = Math.max(0, Math.min(H - S_, c.y + c.by - my + O));
        ctx.fillRect(Math.round(px * dpr) / dpr, Math.round(py * dpr) / dpr, S_, S_);
      }
    }
    if (!moving) lt = 0;
    return moving;
  }
  function kick(f) { for (const c of cells) { c.bx += (rnd() - .5) * f; c.by += (rnd() - .5) * f; } }
  function show(v) { if (v !== vis) { vis = v; cv.classList.toggle('vis', v); } }

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY; PT.x = mx; PT.y = my;
    if (!init) { init = true; for (const c of cells) { c.x = mx + c.rx; c.y = my + c.ry; } }
    const tg = e.target;
    show(!(tg.closest && tg.closest('textarea, input')));
    const h = !!(tg.closest && tg.closest('a, button, summary, [role="radio"], label'));
    if (h !== hot) { hot = h; if (!RM) kick(4); }
    run(frame);
  }, { passive: true });
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && !RM) { kick(9); run(frame); } }, { passive: true });
  document.addEventListener('mouseout', e => { if (!e.relatedTarget) { show(false); PT.x = PT.y = -1; } });
  return { show };
})();

/* =========================================================
   Сборка ответа из пикселей
   Каждое новое слово: облако клеток слетается в его рамку,
   слово проявляется, клетки гаснут. Холст живёт внутри сообщения,
   поэтому прокрутка ничего не пересчитывает.
   ========================================================= */
const PCOL = ['#3DF08A', '#3DF08A', '#5E79E8', '#C9D3FF', '#FFFFFF'];
class Assembler {
  constructor(body) {
    this.b = body;
    this.cv = document.createElement('canvas'); this.cv.className = 'm-fx'; this.cv.setAttribute('aria-hidden', 'true');
    body.prepend(this.cv);
    this.c = this.cv.getContext('2d');
    this.dpr = Math.min(LOW ? 1.5 : 2, devicePixelRatio || 1);
    this.cell = LOW ? 4 : 3;
    this.ps = []; this.rv = []; this.w = 0; this.h = 0;
    this.f = this.frame.bind(this);
  }
  fit() {
    // высоту берём от текста, а не от body: иначе холст сам себя растягивает
    const t = this.b.querySelector('.m-txt');
    const w = this.b.clientWidth, need = t.offsetTop + t.offsetHeight + 24;
    if (w !== this.w || need > this.h) {
      this.w = w; this.h = need + 48;
      this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
      this.cv.style.height = this.h + 'px';
      this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }
  add(el, now) {
    this.fit();
    const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight, c = this.cell;
    let n = Math.round(w * h / (LOW ? 150 : 75));
    n = Math.max(4, Math.min(LOW ? 10 : 28, n));
    if (this.ps.length > 700) n = Math.min(n, 5);
    for (let i = 0; i < n; i++) {
      const tx = x + Math.floor(rnd() * Math.max(1, w / c)) * c;
      const ty = y + Math.floor((.18 + rnd() * .64) * h / c) * c;
      const a = rnd() * 6.283, r = 14 + rnd() * 42;
      this.ps.push({ sx: tx + Math.cos(a) * r, sy: ty + Math.sin(a) * r * .7, tx, ty, t0: now + rnd() * 80, d: 320 + rnd() * 200, k: (rnd() * PCOL.length) | 0 });
    }
    this.rv.push({ el, t: now + 230 });
    run(this.f);
  }
  frame(now) {
    const c = this.c, s = this.cell;
    c.clearRect(0, 0, this.w, this.h);
    for (let i = this.rv.length - 1; i >= 0; i--) if (now >= this.rv[i].t) { this.rv[i].el.classList.add('on'); this.rv.splice(i, 1); }
    let j = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i], e = now - p.t0;
      let X, Y, A;
      if (e < 0) { this.ps[j++] = p; continue; }
      if (e < p.d) {
        const q = e / p.d, k = 1 - Math.pow(1 - q, 4);
        X = p.sx + (p.tx - p.sx) * k; Y = p.sy + (p.ty - p.sy) * k; A = Math.min(1, q * 3);
      } else {
        const f = (e - p.d) / 180;
        if (f >= 1) continue;
        X = p.tx; Y = p.ty; A = 1 - f;
      }
      this.ps[j++] = p;
      c.globalAlpha = A; c.fillStyle = PCOL[p.k];
      c.fillRect(Math.round(X), Math.round(Y), s, s);
    }
    this.ps.length = j;
    c.globalAlpha = 1;
    const alive = this.ps.length > 0 || this.rv.length > 0;
    if (!alive) c.clearRect(0, 0, this.w, this.h);
    return alive;
  }
  flush() { this.rv.forEach(r => r.el.classList.add('on')); this.rv = []; this.ps = []; this.c.clearRect(0, 0, this.w, this.h); }
}

/* =========================================================
   Сообщения
   ========================================================= */
const AV = '<div class="pix m-av" aria-hidden="true"><i class="n"></i><i></i><i class="n"></i><i></i><i class="n"></i><i class="b"></i><i class="n"></i><i class="b"></i><i></i></div>';
function elUser(text) { const d = document.createElement('div'); d.className = 'm m-u'; d.textContent = text; return d; }
function elAsst() {
  const d = document.createElement('div'); d.className = 'm m-a';
  d.innerHTML = `${AV}<div class="m-body"><div class="m-name mono">UZEX AI</div><div class="m-txt"></div></div>`;
  return d;
}
function blocksHTML(a) {
  return a.blocks.map(b => b.p ? `<p>${rich(b.p)}</p>` : `<ol>${b.ol.map(x => `<li><span>${rich(x)}</span></li>`).join('')}</ol>`).join('');
}
function addTail(m, key, instant) {
  const a = T()[key], t = T();
  const tail = document.createElement('div'); tail.className = 'm-tail' + (instant ? ' on' : '');
  tail.innerHTML =
    `<div class="m-src">${a.src.map(s => `<span class="tag tag-o"><span data-icon="doc"></span>${esc(s)}</span>`).join('')}</div>` +
    `<div class="m-act"><button class="ib" type="button" data-act="copy" data-key="${key}" aria-label="${t.copy}" title="${t.copy}"><span data-icon="copy"></span></button>` +
    `<button class="ib" type="button" data-act="retry" data-key="${key}" aria-label="${t.retry}" title="${t.retry}"><span data-icon="retry"></span></button></div>`;
  paintIcons(tail);
  m.querySelector('.m-body').append(tail);
  if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => tail.classList.add('on')));
}
function elAnswer(key) { const m = elAsst(); m.querySelector('.m-txt').innerHTML = blocksHTML(T()[key]); addTail(m, key, true); return m; }
function elError() {
  const m = elAsst(), t = T();
  m.querySelector('.m-txt').innerHTML = `<div class="m-err"><span class="mono">${t.errT}</span><p>${t.errP}</p><button class="btn btn-g btn-s" type="button" data-act="again">${t.errBtn}</button></div>`;
  return m;
}

/* ---------- задачи с таймерами (отменяемые) ---------- */
let job = null;
function newJob() {
  const ids = [], ivs = [];
  return {
    t(f, ms) { ids.push(setTimeout(f, ms)); },
    iv(f, ms) { const i = setInterval(f, ms); ivs.push(i); return i; },
    stopIv() { ivs.forEach(clearInterval); ivs.length = 0; },
    cancel() { ids.forEach(clearTimeout); this.stopIv(); if (this.asm) this.asm.flush(); if (this.onCancel) this.onCancel(); },
  };
}
function clearJob() { if (job) { job.cancel(); job = null; } setBusy(false); }
function setBusy(b) {
  S.busy = b; app.classList.toggle('is-busy', b);
  const l = T()[b ? 'stop' : 'send']; sendBtn.setAttribute('aria-label', l); sendBtn.title = l;
}

function nearBottom() { return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 140; }
function toBottom(force) { if (force || nearBottom()) thread.scrollTop = thread.scrollHeight; }

function think(txt, hold) {
  let cells = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells += `<i style="--d:${r + c}"></i>`;
  txt.innerHTML = `<div class="think"><div class="think-g" aria-hidden="true">${cells}</div><span class="think-t mono"></span></div>`;
  const el = txt.querySelector('.think-t');
  let i = 0; el.textContent = T().phases[0];
  job.iv(() => {
    const ph = T().phases;
    if (!hold && i === ph.length - 1) return;
    el.classList.add('out');
    setTimeout(() => { i = (i + 1) % ph.length; el.textContent = T().phases[i]; el.classList.remove('out'); }, 180);
  }, 950);
}

/* Ответ: «бэкенд» думает, затем стримит слова */
function respond(key, hold, now) {
  const rec = { role: 'a', key, st: 'think' };
  S.msgs.push(rec);
  const m = elAsst(); threadIn.append(m); toBottom(true);
  job = newJob(); setBusy(true);
  if (now) { stream(m, rec); return; }
  think(m.querySelector('.m-txt'), hold);
  if (hold) return;
  job.t(() => stream(m, rec), 1500 + rnd() * 600);
}
function stream(m, rec) {
  job.stopIv();
  rec.st = 'stream';
  const a = T()[rec.key], txt = m.querySelector('.m-txt');
  txt.innerHTML = '';
  const asm = RM ? null : new Assembler(m.querySelector('.m-body'));
  job.asm = asm;
  job.onCancel = () => { rec.st = 'done'; txt.querySelectorAll('.w').forEach(w => w.classList.add('on')); };
  // плоский список: открыть блок / слово
  const toks = [];
  const words = (s) => s.split(/(\*\*.+?\*\*)/).filter(Boolean).forEach(seg => {
    const b = seg.startsWith('**'); seg.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).forEach(w => toks.push({ w, b }));
  });
  a.blocks.forEach(b => {
    if (b.p) { toks.push({ open: 'p' }); words(b.p); }
    else { toks.push({ open: 'ol' }); b.ol.forEach(x => { toks.push({ open: 'li' }); words(x); }); }
  });
  let i = 0, cur = null, ol = null;
  const step = () => {
    if (!job) return;
    const tk = toks[i++];
    if (!tk) {
      rec.st = 'done'; job.asm = null; job = null; setBusy(false);
      addTail(m, rec.key, false); toBottom();
      return;
    }
    if (tk.open === 'p') { cur = document.createElement('p'); txt.append(cur); return step(); }
    if (tk.open === 'ol') { ol = document.createElement('ol'); txt.append(ol); return step(); }
    if (tk.open === 'li') { const li = document.createElement('li'); cur = document.createElement('span'); li.append(cur); ol.append(li); return step(); }
    if (cur.childNodes.length) cur.append(' ');
    const sp = document.createElement('span'); sp.className = 'w' + (tk.b ? ' b' : ''); sp.textContent = tk.w;
    cur.append(sp);
    if (asm) asm.add(sp, performance.now()); else sp.classList.add('on');
    toBottom();
    const pause = /[.:;!?]$/.test(tk.w) ? 160 : /[,—]$/.test(tk.w) ? 90 : 0;
    job.t(step, 34 + rnd() * 34 + pause);
  };
  step();
}

/* ---------- лента целиком (без анимации) ---------- */
function renderThread() {
  threadIn.innerHTML = '';
  S.msgs = S.msgs.filter(r => !(r.role === 'a' && r.st !== 'done' && !r.hold));
  for (const r of S.msgs) {
    if (r.role === 'u') threadIn.append(elUser(r.key ? T()[r.key] : r.text));
    else if (r.role === 'err') threadIn.append(elError());
    else if (r.role === 'a' && r.st === 'done') threadIn.append(elAnswer(r.key));
  }
  const held = S.msgs.find(r => r.role === 'a' && r.hold);
  if (held) { S.msgs.splice(S.msgs.indexOf(held), 1); respond(held.key, true); S.msgs[S.msgs.length - 1].hold = true; }
  toBottom(true);
}

/* =========================================================
   Переходы: стартовый экран ⇄ чат
   ========================================================= */
const IO = 'cubic-bezier(.77,0,.175,1)', OUT = 'cubic-bezier(.23,1,.32,1)';
function flipDock(fn) {
  const f = dock.getBoundingClientRect();
  fn();
  if (RM) return;
  const l = dock.getBoundingClientRect();
  const dy = f.top - l.top;
  if (Math.abs(dy) > 2) dock.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 480, easing: IO });
}
function goChat(anim, after) {
  pxCancel(); clearTimeout(enterT);
  const doIt = () => flipDock(() => {
    app.classList.add('is-chat'); S.view = 'chat'; renderThread(); phRestart();
    if (anim && !RM) threadIn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 200, easing: 'ease-out', fill: 'backwards' });
    if (after) after();
  });
  if (!anim || RM) { app.classList.add('is-chat'); S.view = 'chat'; renderThread(); phRestart(); if (after) after(); return; }
  const a = hero.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.75rem)' }], { duration: 200, easing: OUT, fill: 'forwards' });
  a.onfinish = () => { doIt(); a.cancel(); };
}
/* =========================================================
   Сборка стартового экрана из пикселей
   Фон плашек и рамка поля режутся на клетки, клетки слетаются слева
   направо, в момент сборки копию подменяет настоящий элемент.
   Один общий холст и один цикл: сборки можно запускать независимо
   (поле — сразу, заголовок — когда готов шрифт). Отрисовка fillRect
   пачками по корзинам «цвет × прозрачность».
   ========================================================= */
const PX = { cv: $('#px'), gen: 0, pending: [], groups: [], running: false, colors: [], cix: new Map(), W: 0, H: 0, dpr: 1 };
PX.ctx = PX.cv.getContext('2d');
const pxCi = c => { if (!PX.cix.has(c)) { PX.cix.set(c, PX.colors.length); PX.colors.push(c); } return PX.cix.get(c); };
const PX_ACC = ['#3DF08A', '#5E79E8', '#C9D3FF', '#FFFFFF'].map(pxCi);
function pxCancel() {
  PX.gen++; PX.groups = [];
  const p = PX.pending; PX.pending = [];
  p.forEach(f => f());                       // недособранное показываем сразу
  PX.ctx.clearRect(0, 0, PX.W, PX.H);
}
function pxSize() {
  const W = innerWidth, H = innerHeight, dpr = Math.min(LOW ? 1.5 : 2, devicePixelRatio || 1);
  if (W === PX.W && H === PX.H && dpr === PX.dpr) return;
  PX.W = W; PX.H = H; PX.dpr = dpr;
  PX.cv.width = Math.round(W * dpr); PX.cv.height = Math.round(H * dpr);
  PX.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function assemble(targets) {
  pxSize();
  const t0 = performance.now();
  for (const t of targets) {
    const r = t.el.getBoundingClientRect();
    const x0 = Math.round(r.left), y0 = Math.round(r.top), w = Math.round(r.width), h = Math.round(r.height);
    if (w < 2 || h < 2) { t.done(); continue; }
    const c = t.cell, cols = Math.ceil(w / c), rows = Math.ceil(h / c);
    const cells = [];
    const add = (i, j, col) => {
      const tx = x0 + i * c, ty = y0 + j * c;
      const a = rnd() * 6.283, rad = t.spread[0] + rnd() * t.spread[1];
      const acc = rnd() < .14 ? PX_ACC[(rnd() * PX_ACC.length) | 0] : -1;
      cells.push({ tx, ty, sx: tx + Math.cos(a) * rad, sy: ty + Math.sin(a) * rad * .75,
        t0: t0 + t.delay + (i / cols) * t.sweep + rnd() * 40, d: t.dur[0] + rnd() * t.dur[1], c: col, acc,
        w: Math.min(c, x0 + w - tx), h: Math.min(c, y0 + h - ty) });
    };
    if (t.kind === 'pl') {
      // плашка: из клеток собирается только фон, текст потом проявляется сам
      const cBg = pxCi(getComputedStyle(t.el).backgroundColor);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) add(i, j, cBg);
    } else {
      // поле вопроса: фон, обводка по краю, неоновая кнопка
      const cBg = pxCi(getComputedStyle(t.el).backgroundColor), cLn = pxCi('rgba(201,211,255,.32)'), cN = pxCi('#3DF08A');
      const b = t.el.querySelector('.send').getBoundingClientRect();
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const cx = x0 + i * c + c / 2, cy = y0 + j * c + c / 2;
        const inBtn = cx > b.left && cx < b.right && cy > b.top && cy < b.bottom;
        const edge = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
        add(i, j, inBtn ? cN : edge ? cLn : cBg);
      }
    }
    const g = { cells, end: 0, doneAt: 0, fn: t.done, swap: t.kind === 'pl' };
    // к 80% полёта клетке осталось < 1px (ease-out cubic): подменяем здесь, без «мёртвой» паузы
    for (const p of cells) g.end = Math.max(g.end, p.t0 + p.d * .8);
    PX.groups.push(g);
    PX.pending.push(t.done);
  }
  if (!PX.running) { PX.running = true; run(pxFrame); }
}
// 5 ступеней прозрачности: появление клетки и угасание копии без «ступенек»
const PX_A = [.2, .4, .6, .8, 1], PX_L = PX_A.length;
function pxFrame(now) {
  const ctx = PX.ctx, L = PX_L, dpr = PX.dpr;
  const snap = v => Math.round(v * dpr) / dpr;     // полпикселя на ретине — без дрожи на подлёте
  ctx.clearRect(0, 0, PX.W, PX.H);
  const bins = new Map();
  const put = (key, p, X, Y) => {
    let b = bins.get(key); if (!b) { b = []; bins.set(key, b); }
    b.push(snap(X), snap(Y), p.w, p.h);
  };
  let live = false;
  for (const g of PX.groups) {
    if (!g.doneAt && now >= g.end) {               // собралось → показываем настоящий элемент
      g.doneAt = now; g.fn(); PX.pending = PX.pending.filter(f => f !== g.fn);
    }
    // плашка подменяется в тот же кадр: фон DOM совпадает с копией; рамка поля гаснет за 240 мс
    if (g.doneAt && (g.swap || now - g.doneAt > 240)) continue;
    live = true;
    const fade = g.doneAt ? (now - g.doneAt) / 240 : 0;
    const fb = L - 1 - Math.min(L - 1, (fade * L) | 0);
    for (const p of g.cells) {
      const e = now - p.t0;
      if (e < 0) continue;
      if (e < p.d) {
        const q = e / p.d, k = 1 - Math.pow(1 - q, 3);
        const ab = Math.min(L - 1, (q * 14) | 0);
        put((q < .7 && p.acc >= 0 ? p.acc : p.c) * L + ab, p, p.sx + (p.tx - p.sx) * k, p.sy + (p.ty - p.sy) * k);
      } else put(p.c * L + fb, p, p.tx, p.ty);
    }
  }
  for (const [key, b] of bins) {
    ctx.globalAlpha = PX_A[key % L]; ctx.fillStyle = PX.colors[(key / L) | 0];
    for (let i = 0; i < b.length; i += 4) ctx.fillRect(b[i], b[i + 1], b[i + 2], b[i + 3]);
  }
  ctx.globalAlpha = 1;
  if (!live) { PX.groups = []; PX.running = false; ctx.clearRect(0, 0, PX.W, PX.H); return false; }
  return true;
}

/* Появление: мгновенный сброс, затем сборка.
   Поле — первым и сразу (его размер от шрифта не зависит), заголовок —
   следом, как только загрузился шрифт (иначе плашки поменяют ширину).
   withDock: поле и подпись тоже (на старте и при «Новом чате», не при смене языка). */
let enterT = 0;
// ждём именно Onest (стили шрифтов грузятся неблокирующе), но не дольше 450 мс
function fontsReady() {
  const F = document.fonts, face = '600 16px Onest';
  if (!F) return Promise.resolve();   // check() до загрузки стилей вернёт true, поэтому сначала ждём стили
  const link = document.getElementById('gf');
  const sheet = new Promise(r => { if (!link || link.media === 'all') r(); else link.addEventListener('load', r, { once: true }); });
  return Promise.race([sheet.then(() => F.load(face)), new Promise(r => setTimeout(r, 450))]).catch(() => {});
}
function replayHero(withDock = false) {
  pxCancel();
  const gen = PX.gen;
  const pls = [...hero.querySelectorAll('.pl')];
  hero.classList.add('rs'); pls.forEach(p => p.classList.remove('on'));
  if (withDock) { dock.classList.add('rs'); dock.classList.remove('in'); phStop(); phT.textContent = ''; clearTimeout(enterT); }
  void hero.offsetWidth;
  hero.classList.remove('rs'); dock.classList.remove('rs');
  const showDock = () => {
    dock.classList.add('in');
    enterT = setTimeout(() => { if (S.view === 'landing') phRestart(); }, RM ? 0 : 120);
  };
  if (RM) { pls.forEach(p => p.classList.add('on')); if (withDock) showDock(); return; }
  const go = (targets) => { if (gen !== PX.gen) return; try { assemble(targets); } catch (err) { targets.forEach(t => t.done()); } };
  if (withDock) requestAnimationFrame(() => go([{ el: form, kind: 'ask', cell: LOW ? 14 : 10, delay: 0, sweep: 140, dur: [220, 110], spread: [14, 50], done: showDock }]));
  fontsReady().then(() => requestAnimationFrame(() => {
    const fs = parseFloat(getComputedStyle(hero.querySelector('.q-title')).fontSize) || 64;
    const cell = Math.max(6, Math.round(fs / 7 * (LOW ? 1.4 : 1)));   // крупная клетка: ~10–12 px
    go(pls.map((el, i) => ({
      el, kind: 'pl', cell, delay: (withDock ? 60 : 0) + i * 70, sweep: 160, dur: [270, 90], spread: [20, 70],
      done: () => el.classList.add('on'),
    })));
  }));
}
function goLanding(anim) {
  clearJob(); S.msgs = []; S.chat = null;
  const apply = () => { app.classList.remove('is-chat'); S.view = 'landing'; threadIn.innerHTML = ''; };
  apply();   // поле не едет вверх: стартовый экран заново проигрывает своё появление
  replayHero(true); renderHist();
}

/* =========================================================
   Поле вопроса и анимированные подсказки
   ========================================================= */
function autosize() {
  q.style.height = 'auto';
  q.style.height = Math.min(q.scrollHeight, innerHeight * .38) + 'px';
  form.classList.toggle('has-text', q.value.length > 0);
}
q.addEventListener('input', autosize);

let phI = 0, phTm = 0, phAnim = [];
function phStop() { clearTimeout(phTm); phAnim.forEach(a => a.cancel()); phAnim = []; }
function phRestart() { phStop(); phShow(); }
function curSugg() { return S.view === 'landing' ? T().sugg[phI % T().sugg.length] : ''; }
function phShow() {
  if (S.view === 'chat') { phT.textContent = T().follow; return; }
  phT.textContent = curSugg();
  if (!RM && !document.hidden) {
    const tm = { duration: 620, easing: 'steps(20, end)' };
    phAnim = [
      phT.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], tm),
      phC.animate([{ transform: `translateX(${-phT.offsetWidth}px)` }, { transform: 'none' }], tm),
    ];
  }
  phTm = setTimeout(phHide, 3400);
}
function phHide() {
  if (RM || document.hidden || form.classList.contains('has-text')) { phI++; phShow(); return; }
  const a = phT.parentElement.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.375em)' }], { duration: 200, easing: OUT });
  phAnim = [a];
  a.onfinish = () => { phI++; phShow(); };
}

function submit(text) {
  if (S.busy) { clearJob(); return; }
  text = (text || '').trim() || curSugg();
  if (!text) return;
  q.value = ''; autosize();
  S.msgs.push({ role: 'u', text });
  const key = /комис|сбор|тариф|komis|yigʻ|tarif/i.test(text) ? 'a2' : 'a1';
  setDemoMark(null);
  if (S.view === 'landing') goChat(true, () => setTimeout(() => respond(key, false), RM ? 0 : 380));
  else { threadIn.append(elUser(text)); toBottom(true); respond(key, false); }
}
form.addEventListener('submit', e => { e.preventDefault(); submit(q.value); });
q.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(q.value); }
  else if (e.key === 'Tab' && !e.shiftKey && !q.value && curSugg()) { e.preventDefault(); q.value = curSugg(); autosize(); phStop(); }
});
q.addEventListener('blur', () => { if (!q.value && S.view === 'landing' && !phAnim.length) phRestart(); });

/* действия в ленте */
threadIn.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'copy') {
    const txt = plain(T()[b.dataset.key]);
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => {}).finally(() => {
      b.innerHTML = `<span data-icon="check">${svg('check')}</span>`; b.classList.add('copied'); b.setAttribute('aria-label', T().copied);
      setTimeout(() => { b.innerHTML = `<span data-icon="copy">${svg('copy')}</span>`; b.classList.remove('copied'); b.setAttribute('aria-label', T().copy); }, 1400);
    });
  } else if (b.dataset.act === 'retry' || b.dataset.act === 'again') {
    if (S.busy) return;
    const m = b.closest('.m');
    const idx = [...threadIn.children].indexOf(m);
    const key = b.dataset.key || 'a1';
    // убрать это сообщение и всё, что после него
    while (threadIn.children.length > idx) threadIn.lastElementChild.remove();
    S.msgs.length = Math.min(S.msgs.length, idx);
    respond(key, false);
  }
});

/* =========================================================
   История чатов
   ========================================================= */
function renderHist() {
  const t = T();
  if (S.histEmpty) {
    histList.innerHTML = `<div class="hist-empty"><div class="pix" aria-hidden="true"><i></i><i class="n"></i><i></i><i class="n"></i><i></i><i></i><i></i><i></i><i></i><i></i><i class="b"></i><i></i><i></i><i></i><i class="b"></i><i></i><i class="b"></i><i class="b"></i><i class="b"></i><i></i></div><p>${t.histEmpty}</p></div>`;
    return;
  }
  histList.innerHTML = HIST_GROUPS.map(([g, ids]) =>
    `<h3 class="hist-g mono">${t[g]}</h3>` +
    ids.map(i => `<button class="hist-i" type="button" data-h="${i}" aria-current="${S.chat === i}"><span>${esc(t.hist[i])}</span><time class="hist-t mono">${esc(t.histT[i])}</time></button>`).join('')
  ).join('');
}
let histReturn = null;
function openHist() {
  histReturn = document.activeElement;
  scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('on'));
  hist.classList.add('open'); hist.style.transform = '';
  histBtns.forEach(b => b.setAttribute('aria-expanded', 'true'));
  setTimeout(() => $('#histClose').focus({ preventScroll: true }), 60);
}
function closeHist(focusBack = true) {
  if (!hist.classList.contains('open')) return;
  hist.classList.remove('open', 'drag'); hist.style.transform = '';
  scrim.classList.remove('on'); setTimeout(() => { if (!hist.classList.contains('open')) scrim.hidden = true; }, 300);
  histBtns.forEach(b => b.setAttribute('aria-expanded', 'false'));
  if (focusBack && histReturn && histReturn.focus) histReturn.focus({ preventScroll: true });
}
histBtns.forEach(b => b.addEventListener('click', () => hist.classList.contains('open') ? closeHist() : openHist()));
$('#histClose').addEventListener('click', () => closeHist());

/* ---------- Страницы «О решении» / «О нас» (#about, #team) ---------- */
const page = $('#page'), pageBody = $('#pageBody'), pageT = $('#pageT');
const PAGES = ['about', 'team'], BASE_TITLE = document.title;
const AVA = [ // пиксельные «аватары» 4×4
  ['n', '', 'n', '', '', 'n', 'n', '', 'b', '', '', 'b', '', 'b', 'b', ''],
  ['b', 'b', '', '', 'b', 'n', 'n', '', '', 'n', 'n', 'b', '', '', 'b', 'b'],
  ['p', '', '', 'p', '', 'n', 'n', '', '', 'n', 'n', '', 'p', '', '', 'p'],
];
let route = '';
// пиксельный шрифт 5×7 для «DEVTONES» на странице команды
const PXF = {
  D: ['####.','#...#','#...#','#...#','#...#','#...#','####.'],
  E: ['#####','#....','#....','####.','#....','#....','#####'],
  V: ['#...#','#...#','#...#','#...#','#...#','.#.#.','..#..'],
  T: ['#####','..#..','..#..','..#..','..#..','..#..','..#..'],
  O: ['.###.','#...#','#...#','#...#','#...#','#...#','.###.'],
  N: ['#...#','##..#','#.#.#','#.#.#','#..##','#...#','#...#'],
  S: ['.####','#....','#....','.###.','....#','....#','####.'],
};
function pxWord(w) {
  const cols = w.length * 6 - 1; let h = '';
  for (let y = 0; y < 7; y++) for (let x = 0; x < cols; x++) {
    const ch = PXF[w[Math.floor(x / 6)]], cx = x % 6;
    const on = cx < 5 && ch[y][cx] === '#';
    h += on ? `<i class="on" style="--x:${x};--y:${y}"></i>` : '<i></i>';
  }
  return `<span class="px-grid" aria-hidden="true" style="--cols:${cols}">${h}</span>`;
}
function fitPx() {
  const w = document.querySelector('.page-row .px-word'), pl = pageTitle.querySelector('.pl');
  if (w && pl) w.style.setProperty('--h', pl.getBoundingClientRect().height + 'px');
}
addEventListener('resize', fitPx);
function renderPage() {
  if (!route) return;
  const t = T(), a = t[route];
  pageT.textContent = t[route === 'about' ? 'aboutT' : 'teamT'];
  const tag = `<span class="tag tag-o">${t.demoTag}</span>`;
  pageBody.innerHTML = route === 'about'
    ? `${tag}<p class="page-lead">${esc(a.h)}</p>${a.p.map(x => `<p>${esc(x)}</p>`).join('')}<h2 class="page-h">${esc(a.listH)}</h2><ul class="page-list">${a.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : ``+
      `<div class="team-grid">` + a.members.map(m => `<article class="mem">
        <div class="mem-ph"><img src="img/${m.img}.webp" width="800" height="800" alt="${a.photo}: ${esc(m.n)}" decoding="async"></div>
        <div class="mem-b">
          <h2 class="mem-n">${esc(m.n)}</h2>
          <p class="mem-r"><span class="tag bg-n">${esc(m.role)}</span><span class="mono">${esc(m.exp)}</span></p>
          <ul class="mem-pts">${m.pts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="mem-k"><span class="mono">${a.stackL}</span><div class="chips">${m.stack.map(x => `<span class="tag tag-f">${esc(x)}</span>`).join('')}</div></div>
          ${m.edu ? `<div class="mem-k"><span class="mono">${a.eduL}</span><p>${esc(m.edu)}</p></div>` : ''}
        </div>
      </article>`).join('') + `</div>` +
      `<p class="page-foot made mono">Made with <a class="egg" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer" aria-label="love"><span class="heart">${svg('heart')}</span></a></p>`;
  page.querySelector('.page-in').classList.toggle('wide', route === 'team');
  // DEVTONES стоит в одном ряду с заголовком страницы
  let row = pageTitle.parentElement;
  if (!row.classList.contains('page-row')) { row = document.createElement('div'); row.className = 'page-row'; pageTitle.before(row); row.append(pageTitle); }
  row.querySelector('.px-word')?.remove();
  if (route === 'team') { row.insertAdjacentHTML('beforeend', `<h2 class="px-word" aria-label="devtones">${pxWord('DEVTONES')}</h2>`); fitPx(); }
  document.querySelectorAll('[data-page]').forEach(l => l.setAttribute('aria-current', l.dataset.page === route ? 'page' : 'false'));
}
function enterPage() {
  const pl = page.querySelector('.pl');
  page.classList.add('rs'); pl.classList.remove('on'); void page.offsetWidth; page.classList.remove('rs');
  if (RM) { pl.classList.add('on'); return; }
  requestAnimationFrame(() => {
    const fs = parseFloat(getComputedStyle(pageT.closest('.q-title')).fontSize) || 56;
    try { assemble([{ el: pl, kind: 'pl', cell: Math.max(6, Math.round(fs / 7 * (LOW ? 1.4 : 1))), delay: 0, sweep: 160, dur: [270, 90], spread: [20, 70], done: () => pl.classList.add('on') }]); }
    catch (err) { pl.classList.add('on'); }
    [...pageBody.children].forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(.5rem)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, delay: 140 + i * 45, easing: OUT, fill: 'backwards' }));
    pageBody.querySelectorAll('.mem-ph').forEach((ph, i) => pixelReveal(ph, 220 + i * 120));
  });
}
/* Фото проявляется из крупных пикселей: 6 → 10 → 18 → 32 → 56 клеток, затем чёткое */
function pixelReveal(ph, delay) {
  const img = ph.querySelector('img'), my = PX.gen;
  if (RM) { ph.classList.add('on'); return; }
  const go = () => {
    if (my !== PX.gen || !img.isConnected) return;
    const w = ph.clientWidth, h = ph.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (!w || !h) { ph.classList.add('on'); return; }
    const cv = document.createElement('canvas'); cv.className = 'mem-px'; cv.setAttribute('aria-hidden', 'true');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ph.append(cv);
    const c = cv.getContext('2d'), off = document.createElement('canvas'), o = off.getContext('2d');
    c.imageSmoothingEnabled = false;
    const steps = [6, 10, 18, 32, 56];
    let k = 0;
    const draw = () => {
      if (!cv.isConnected) return;
      if (k >= steps.length) { ph.classList.add('on'); setTimeout(() => cv.remove(), 160); return; }
      const n = steps[k++];
      off.width = n; off.height = n; o.drawImage(img, 0, 0, n, n);
      c.drawImage(off, 0, 0, n, n, 0, 0, cv.width, cv.height);
      setTimeout(draw, 75);
    };
    draw();
  };
  const start = () => setTimeout(go, delay);
  (img.decode ? img.decode() : Promise.resolve()).then(start, () => ph.classList.add('on'));
}
function applyRoute() {
  const r = location.hash.slice(1);
  const next = PAGES.includes(r) ? r : '';
  if (next === route) return;
  route = next;
  closeHist(false);
  if (route) {
    pxCancel(); clearTimeout(enterT); phStop();
    app.classList.add('is-page'); page.scrollTop = 0;
    renderPage(); enterPage();
    document.title = `${T()[route === 'about' ? 'aboutT' : 'teamT']} · UZEX AI`;
  } else {
    app.classList.remove('is-page');
    document.querySelectorAll('[data-page]').forEach(l => l.setAttribute('aria-current', 'false'));
    document.title = BASE_TITLE;
    if (S.view === 'landing') replayHero(true);
  }
}
function leavePage() { if (route) { location.hash = ''; applyRoute(); } }
addEventListener('hashchange', applyRoute);
scrim.addEventListener('click', () => closeHist());
const newChat = () => { leavePage(); closeHist(false); setDemoMark('start'); goLanding(true); q.focus({ preventScroll: true }); };
$('#newBtn').addEventListener('click', newChat);
$('#histNew').addEventListener('click', newChat);
$('#home').addEventListener('click', e => { e.preventDefault(); newChat(); });
histList.addEventListener('click', e => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  S.chat = +b.dataset.h; closeHist(false);
  clearJob();
  S.msgs = [{ role: 'u', key: 'q1' }, { role: 'a', key: 'a1', st: 'done' }];
  if (S.chat === 1) S.msgs = [{ role: 'u', key: 'q2' }, { role: 'a', key: 'a2', st: 'done' }];
  setDemoMark(null);
  if (S.view === 'landing') goChat(true); else renderThread();
  renderHist();
});

/* свайп влево закрывает историю (тач) */
(() => {
  let x0 = 0, t0 = 0, dx = 0, on = false;
  hist.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || on) return;
    on = true; x0 = e.clientX; t0 = performance.now(); dx = 0;
  });
  hist.addEventListener('pointermove', e => {
    if (!on) return;
    dx = Math.min(0, e.clientX - x0);
    if (dx < -6) { hist.classList.add('drag'); hist.style.transform = `translateX(${dx}px)`; }
  });
  const end = () => {
    if (!on) return; on = false;
    const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
    hist.classList.remove('drag');
    if (dx < -80 || (dx < -12 && v > .11)) closeHist(); else hist.style.transform = '';
  };
  hist.addEventListener('pointerup', end); hist.addEventListener('pointercancel', end);
})();

/* =========================================================
   Сменяемое слово в заголовке: «Спросите про {биржу / торги / …}»
   Слово рассыпается в пиксели цвета плашки, плашка меняет ширину, новое слово проявляется из пикселей.
   ========================================================= */
let rotI = 0, rotBusy = false;
function rotTick() {
  const el = hero.querySelector('.rot');
  if (!el || rotBusy || S.view !== 'landing' || document.hidden) return;
  if ([...hero.querySelectorAll('.pl')].some(p => !p.classList.contains('on'))) return;
  const ws = T().rw; rotI = (rotI + 1) % ws.length;
  swapWord(el, ws[rotI]);
}
setInterval(rotTick, 2800);
// самое длинное слово из списка должно влезать в строку: при нехватке места заголовок чуть уменьшается
function fitHero() {
  const qt = hero.querySelector('.q-title'), el = hero.querySelector('.rot');
  if (!qt || !el) return;
  qt.style.fontSize = '';
  const avail = hero.clientWidth; if (!avail) return;
  const probe = el.cloneNode(false); probe.style.cssText = 'position:absolute;visibility:hidden;width:auto';
  el.parentNode.append(probe);
  let wMax = 0; for (const w of T().rw) { probe.textContent = w; wMax = Math.max(wMax, probe.offsetWidth); }
  probe.textContent = el.firstChild ? el.firstChild.textContent : ''; const wCur = probe.offsetWidth;
  probe.remove();
  const ln = el.closest('.ln'), need = ln.getBoundingClientRect().left - hero.getBoundingClientRect().left + ln.scrollWidth - wCur + wMax;
  if (need > avail) qt.style.fontSize = (parseFloat(getComputedStyle(qt).fontSize) * avail / need * .98) + 'px';
}
addEventListener('resize', () => { if (!rotBusy) fitHero(); });
fontsReady().then(fitHero);
function swapWord(el, next) {
  if (RM) { el.textContent = next; return; }
  rotBusy = true;
  const plate = el.closest('.pl'), bg = getComputedStyle(plate).backgroundColor;
  const lightPlate = plate.classList.contains('bg-w');
  const accents = lightPlate ? ['#C9D3FF', '#AEBCF3'] : ['#00C46A', '#9EF7C4'];
  const fs = parseFloat(getComputedStyle(el).fontSize) || 64, cell = Math.max(6, Math.round(fs / 7));
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.className = 'rot-cv'; cv.setAttribute('aria-hidden', 'true');
  el.append(cv);
  const ctx = cv.getContext('2d');
  let cells = [], W = 0, H = 0;
  const fit = () => {
    const w = el.offsetWidth, h = el.offsetHeight + Math.round(fs * .14);   // запас под выносные элементы (у, р)
    if (w === W && h === H) return;
    W = w; H = h; cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const old = new Map(cells.map(c => [c.x + ',' + c.y, c.t]));
    cells = [];
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) cells.push({ x, y, t: old.get(x + ',' + y) ?? Math.random(), a: accents[Math.random() * 2 | 0] });
  };
  const draw = (p, inPhase) => {
    ctx.clearRect(0, 0, W, H);
    for (const c of cells) {
      const k = inPhase ? 1 - p : p;            // доля закрытых клеток
      if (c.t >= k) continue;
      const fresh = k - c.t < .14;
      ctx.fillStyle = fresh ? c.a : bg;
      ctx.fillRect(c.x, c.y, cell + .5, cell + .5);
    }
  };
  const phase = (dur, fn) => new Promise(res => {
    const t0 = performance.now();
    const f = now => { const p = Math.min(1, (now - t0) / dur); fn(p); p < 1 ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  });
  fit();
  phase(320, p => draw(p, false)).then(() => {
    const w0 = el.offsetWidth; el.textContent = next; el.append(cv);
    const w1 = el.offsetWidth;
    el.style.width = w0 + 'px'; void el.offsetWidth;
    el.style.transition = 'width .32s cubic-bezier(.77,0,.175,1)'; el.style.width = w1 + 'px';
    return phase(340, () => { fit(); draw(1, false); });
  }).then(() => {
    el.style.transition = ''; el.style.width = '';
    fit();
    return phase(380, p => draw(p, true));
  }).finally(() => { cv.remove(); rotBusy = false; });
}

/* =========================================================
   Язык
   ========================================================= */
function applyLang(l, anim) {
  const was = S.lang; S.lang = l;
  document.documentElement.lang = l;
  const t = T();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t[el.dataset.i18n];
    if (v.includes('{w}')) { rotI = 0; el.innerHTML = v.split('{w}').map(esc).join(`<span class="rot">${esc(t.rw[0])}</span>`); }
    else el.textContent = v;
  });
  fitHero();
  document.querySelectorAll('[data-i18n-label]').forEach(el => { const v = t[el.dataset.i18nLabel]; el.setAttribute('aria-label', v); if (el.tagName === 'BUTTON') el.title = v; });
  const lg = $('.lang'); lg.dataset.l = l;
  lg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
  setBusy(S.busy);
  renderHist(); renderPage();
  if (route) document.title = `${t[route === 'about' ? 'aboutT' : 'teamT']} · UZEX AI`;
  if (was !== l || !anim) {
    if (S.view === 'chat') {
      const held = S.msgs.some(r => r.hold);
      if (job && !held) { job.cancel(); job = null; setBusy(false); S.msgs.forEach(r => { if (r.role === 'a') r.st = 'done'; }); }
      if (held) clearJob();
      renderThread();
    } else if (anim) replayHero();
    if (S.view === 'landing' && q.value && demoState === 'typing') { q.value = t.q1; autosize(); }
    phRestart();
  }
}
$('.lang').addEventListener('click', e => { const b = e.target.closest('button[data-l]'); if (b && b.dataset.l !== S.lang) applyLang(b.dataset.l, true); });

/* =========================================================
   Демо-панель: состояния для бэкенда
   ========================================================= */
const DEMO = [
  ['start', 'Старт', 'GET /api/suggestions?lang=ru\n→ 200 { "items": ["Как участвовать…", "…"] }\n\n// подсказки крутятся в поле вопроса;\n// Enter на пустом поле отправляет текущую'],
  ['typing', 'Ввод вопроса', '// только клиент\n// Enter — отправить, Shift+Enter — перенос\n// Tab — подставить подсказку'],
  ['thinking', 'Думает', 'POST /api/chat\n{ "chat_id": "c_42" | null,\n  "message": "Как участвовать…",\n  "lang": "ru" | "uz" }\n\n→ 200 text/event-stream\nevent: status\ndata: { "stage": "read" | "search" | "compose" }'],
  ['stream', 'Ответ собирается', 'event: token\ndata: { "text": "Чтобы " }\n…\nevent: done\ndata: { "message_id": "m_7",\n  "chat_id": "c_42",\n  "sources": [{ "title": "…", "url": "…" }] }\n\n// стоп: клиент закрывает поток\n// (или POST /api/chat/c_42/stop)\n// text — markdown: **жирный**, 1. списки'],
  ['dialog', 'Диалог', 'GET /api/chats/c_42/messages\n→ [{ "role": "user", "text": "…" },\n   { "role": "assistant", "text": "…",\n     "sources": [ … ] }]'],
  ['error', 'Ошибка', 'event: error\ndata: { "code": "timeout" | "rate_limit"\n        | "server",\n  "retryable": true }\n\n// или HTTP 5xx до начала потока'],
  ['hist', 'История', 'GET /api/chats\n→ [{ "id": "c_42",\n     "title": "Участие в госзакупках",\n     "updated_at": "2026-11-07T10:24:00Z" }]\n\n// группы «Сегодня / Вчера / Ранее»\n// клиент строит по updated_at'],
  ['histEmpty', 'История пуста', 'GET /api/chats\n→ 200 []'],
  ['about', 'Страница «О решении»', '// отдельная страница: адрес #about\n// статичный контент, бэкенд не нужен\n// тексты — I18N.ru/uz → about'],
  ['team', 'Страница «О нас»', '// отдельная страница: адрес #team\n// тексты — I18N.ru/uz → team'],
];
let demoState = 'start';
const demoList = $('#demoList'), apiPre = $('#api');
demoList.innerHTML = DEMO.map(([id, label], i) => `<button type="button" role="radio" aria-checked="false" data-s="${id}"><kbd>${(i + 1) % 10}</kbd>${label}</button>`).join('');
function setDemoMark(id) {
  demoState = id;
  demoList.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.s === id)));
  const d = DEMO.find(x => x[0] === id);
  apiPre.textContent = d ? d[2] : '// свободный режим: задайте вопрос сами';
}
function demoGo(id) {
  if (id !== 'about' && id !== 'team') leavePage();
  setDemoMark(id);
  clearJob(); closeHist(false);
  S.histEmpty = id === 'histEmpty';
  S.chat = null;
  const chat = (msgs, after) => {
    S.msgs = msgs;
    if (S.view === 'landing') { app.classList.add('is-chat'); S.view = 'chat'; phRestart(); }
    renderThread(); if (after) after();
  };
  q.value = ''; autosize();
  switch (id) {
    case 'start': goLanding(false); break;
    case 'typing': goLanding(false); q.value = T().q1; autosize(); phStop(); if (FINE) q.focus({ preventScroll: true }); break;
    case 'thinking': chat([{ role: 'u', key: 'q1' }], () => { respond('a1', true); S.msgs[S.msgs.length - 1].hold = true; }); break;
    case 'stream': chat([{ role: 'u', key: 'q1' }], () => respond('a1', false, true)); break;
    case 'dialog': chat([{ role: 'u', key: 'q1' }, { role: 'a', key: 'a1', st: 'done' }, { role: 'u', key: 'q2' }, { role: 'a', key: 'a2', st: 'done' }]); break;
    case 'error': chat([{ role: 'u', key: 'q1' }, { role: 'err' }]); break;
    case 'hist': case 'histEmpty': goLanding(false); S.histEmpty = id === 'histEmpty'; renderHist(); openHist(); break;
    case 'about': location.hash = 'about'; return;
    case 'team': location.hash = 'team'; return;
  }
}

demoList.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) demoGo(b.dataset.s); });
function toggleDemo(open) {
  const o = open ?? !demo.classList.contains('open');
  demo.classList.toggle('open', o); demoBtn.setAttribute('aria-expanded', String(o));
}
demoBtn.addEventListener('click', () => toggleDemo());
$('#demoClose').addEventListener('click', () => { toggleDemo(false); demoBtn.focus(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (hist.classList.contains('open')) { closeHist(); return; }
    if (demo.classList.contains('open') && innerWidth < 1100) { toggleDemo(false); demoBtn.focus(); return; }
    if (S.busy) clearJob();
    return;
  }
  const tg = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (tg.closest && tg.closest('textarea, input'))) return;
  const n = e.key === "0" ? 10 : +e.key;
  if (n >= 1 && n <= DEMO.length) demoGo(DEMO[n - 1][0]);
});

/* =========================================================
   Старт
   ========================================================= */
paintIcons();
applyLang('ru', false);
setDemoMark('start');
if (innerWidth >= 1100) toggleDemo(true);
// поле собирается сразу, не дожидаясь шрифтов; заголовок ждёт шрифт внутри replayHero
if (PAGES.includes(location.hash.slice(1))) applyRoute(); else replayHero(true);
})();
