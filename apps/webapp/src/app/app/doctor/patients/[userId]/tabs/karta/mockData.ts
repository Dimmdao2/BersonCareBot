// TODO(backend): all data in this file is MOCK. Replace with real clinical-core
// reads (complaints / diagnoses / comorbidities / anamnesis / visits) once the
// backend data model (visit/complaint/complaint_update/diagnosis/file) lands.

export type Complaint = {
  id: string;
  priority: boolean;
  text: string;
  severity: number; // 0-10
  trend: number[]; // severity history for sparkline
  since: string;
};

export type Diagnosis = {
  id: string;
  priority: boolean;
  text: string;
  tone: "active" | "calm";
  meta: string; // «уточнён 22.01» / «поставлен 05.01»
};

export type Comorbidity = {
  id: string;
  text: string;
  since: string;
};

export type AnamnesisTraumaRow = {
  id: string;
  year: string;
  what: string;
  type: string;
  immobilization: string;
};

export type AnamnesisIllnessRow = {
  id: string;
  period: string;
  what: string;
  comment: string;
};

export type AnamnesisLifestyleEntry = {
  id: string;
  date: string;
  text: string;
};

export type VisitSection = {
  title: string;
  body: string;
};

export type VisitDynamicsRow = {
  id: string;
  priority: boolean;
  label: string;
  from: number;
  to: number;
  note: string;
};

export type VisitFile = {
  id: string;
  icon: string;
  name: string;
};

export type Visit = {
  id: string;
  date: string;
  type: "first" | "repeat";
  location: string;
  duration: string;
  filesCount?: number;
  dynamics?: VisitDynamicsRow[];
  sections?: VisitSection[];
  files?: VisitFile[];
};

// -- Mock complaints ----------------------------------------------------------

export const MOCK_COMPLAINTS: Complaint[] = [
  {
    id: "c1",
    priority: true,
    text: "Бедро / правое / боль ноющая / лёжа на правом боку более 30 мин",
    severity: 2,
    trend: [5, 4, 2],
    since: "с 05.01",
  },
  {
    id: "c2",
    priority: false,
    text: "Поясница (низ) / слева / боль тянущая, мышечная / при нагрузках, ходьбе, наклонах",
    severity: 4,
    trend: [6, 5, 4],
    since: "с 05.01",
  },
];

export const MOCK_DIAGNOSES: Diagnosis[] = [
  {
    id: "d1",
    priority: true,
    text: "Тендинопатия сухожилия большой ягодичной мышцы",
    tone: "active",
    meta: "уточнён 22.01",
  },
  {
    id: "d2",
    priority: false,
    text: "Миофасциальный болевой синдром поясничного отдела, хронический (обострение)",
    tone: "calm",
    meta: "поставлен 05.01",
  },
];

export const MOCK_COMORBIDITIES: Comorbidity[] = [
  { id: "co1", text: "Диабет 2 типа, скомпенсированный", since: "с 2017" },
];

export const MOCK_ANAMNESIS_TRAUMA: AnamnesisTraumaRow[] = [
  {
    id: "t1",
    year: "1991 (15 лет)",
    what: "Падение с лошади, перелом копчика",
    type: "Травма",
    immobilization: "4 нед лёжа",
  },
  { id: "t2", year: "1993 (18 лет)", what: "Варикоцеле", type: "Операция", immobilization: "—" },
  {
    id: "t3",
    year: "2003 (28 лет)",
    what: "Аппендэктомия, полостная",
    type: "Операция",
    immobilization: "без осложнений",
  },
];

export const MOCK_ANAMNESIS_ILLNESS: AnamnesisIllnessRow[] = [
  {
    id: "i1",
    period: "1999–2000",
    what: "Стресс · 8 мес",
    comment: "Начались панические атаки",
  },
  { id: "i2", period: "2020", what: "Ковид", comment: "Госпитализация" },
];

export const MOCK_ANAMNESIS_LIFESTYLE: AnamnesisLifestyleEntry[] = [
  {
    id: "l1",
    date: "18.01.2026",
    text: "Работа сидячая, 8–10 часов. В выходные летом прогулки, зимой лыжи. Тренажёры — занятия с тренером последние полгода.",
  },
  {
    id: "l2",
    date: "22.02.2026",
    text: "Последний месяц без тренажёров, плавание в бассейне 3 раза в неделю.",
  },
];

export const MOCK_VISITS: Visit[] = [
  {
    id: "v1",
    date: "22 января 2026",
    type: "repeat",
    location: "Москва · Точка здоровья · Очный приём",
    duration: "60 мин",
    dynamics: [
      {
        id: "vd1",
        priority: true,
        label: "Бедро / правое / боль ноющая",
        from: 5,
        to: 2,
        note: "Боли реже и меньше — после 2 часов ходьбы. Онемение в бедре лёжа на правом боку (ближе к утру).",
      },
      {
        id: "vd2",
        priority: false,
        label: "Поясница (низ) / слева / боль тянущая",
        from: 6,
        to: 4,
        note: "При сидении и после ходьбы почти не беспокоит, осталось в наклоне — при удержании положения.",
      },
    ],
    sections: [
      {
        title: "Осмотр",
        body: "Наклон вперёд болезненный на 30 град (на 2 балла). Прогиб без боли. Тест Тренделенбурга — динамика положительная (50%). Боль при пальпации локализовалась в области проксимального сухожилия БЯМ (медиально — крестец/КПС).",
      },
      {
        title: "Уточнение диагноза",
        body: "Тендинопатия большой ягодичной. МФС квадратной мышцы поясницы справа.",
      },
      {
        title: "Проведённые манипуляции",
        body: "Сухая игла на область сух прав БЯМ. ФМ по ФУ бедра и поясницы.",
      },
      {
        title: "Рекомендации / Назначения — коррекция",
        body: "Продолжаем программу ЛФК для ТБС, акцент больше на ягодичный мост и отведение. Добавляем подъём на ступени с весом.",
      },
    ],
    files: [{ id: "f1", icon: "📷", name: "тест_наклона_22-01.jpg" }],
  },
  {
    id: "v2",
    date: "15 января 2026",
    type: "repeat",
    location: "Москва · Точка здоровья",
    duration: "60 мин",
    dynamics: [
      {
        id: "vd3",
        priority: true,
        label: "Бедро / правое / боль ноющая",
        from: 6,
        to: 5,
        note: "Незначительное улучшение, боль сохраняется при длительной нагрузке.",
      },
    ],
    sections: [
      {
        title: "Осмотр",
        body: "Наклон вперёд болезненный. Тест Тренделенбурга положительный.",
      },
      {
        title: "Проведённые манипуляции",
        body: "ФМ по ФУ бедра и поясницы.",
      },
    ],
  },
  {
    id: "v3",
    date: "5 января 2026",
    type: "first",
    location: "Москва · Точка здоровья",
    duration: "90 мин",
    filesCount: 2,
    sections: [
      {
        title: "Жалобы",
        body: "Бедро правое: боль ноющая после часа ходьбы (5/10). Поясница (низ) слева: боль тянущая при нагрузках, ходьбе, наклонах (6/10).",
      },
      {
        title: "Осмотр",
        body: "РДН ~1 см пр>лев, тест Адамса отрицательный. Наклон вперёд ограничен болью.",
      },
      {
        title: "Предварительный диагноз",
        body: "Трохантерит, тендинопатия средней ягодичной. МФС квадратной мышцы поясницы справа.",
      },
      {
        title: "Проведённые манипуляции",
        body: "ФМ на область поясницы, трохантера, ягодицы.",
      },
      {
        title: "Рекомендации / Назначения",
        body: "ЛФК, курс 3 сеанса фасциальных манипуляций.",
      },
    ],
    files: [
      { id: "f2", icon: "📷", name: "осанка_05-01.jpg" },
      { id: "f3", icon: "📄", name: "первичный_осмотр.pdf" },
    ],
  },
];

// New-visit form options. TODO(backend): pull from booking / catalogs.
export const VISIT_DATE_OPTIONS = ["11.06.2026", "12.06.2026", "13.06.2026"];
export const VISIT_LOCATION_OPTIONS = ["СПб · Скандинавия", "Москва · Точка здоровья"];
export const VISIT_SERVICE_OPTIONS = ["Очный приём", "Онлайн-консультация"];
export const VISIT_DURATION_OPTIONS = ["90 мин", "60 мин", "45 мин"];

export const DIAGNOSIS_SUGGESTIONS = [
  { text: "Неспецифическая боль в нижней части спины", meta: "справочник · исп. 12 раз" },
  { text: "Неспецифическая боль в шейном отделе", meta: "справочник · исп. 7 раз" },
];
