/**
 * Пустая аудитория никогда не является тихим успехом (design D-b) — чистое ядро.
 *
 * Июльский баг ровно этой формы: `if (targets.length === 0) return;` — ранний выход,
 * неотличимый от успешной отправки. PagerDuty документирует ту же семантику как
 * ЗАДУМАННУЮ («если по всей эскалации никто не на дежурстве, инцидент не будет создан»),
 * что и делает её ловушкой: код выглядит корректным.
 *
 * Требуемое поведение:
 *   резолвим аудиторию → если пусто И сообщение операционное, доставляем в fallback,
 *   который нельзя отключить настройкой → инкрементим счётчик → сам счётчик алертится.
 *
 * Плюс: адресат, который НЕ подтверждён или подавлен из-за bounce, считается ОТСУТСТВУЮЩИМ.
 * (SNS давит отскочивший адрес на 7 суток; в Azure одно SMS `STOP` гасит все action group разом.)
 */

export const EMPTY_AUDIENCE_JOB_FAMILY = "notifications" as const;
export const EMPTY_AUDIENCE_JOB_KEY = "notification.empty_audience" as const;

/**
 * Операционное сообщение (алерт оператору, служебное уведомление персоналу) при пустой
 * аудитории уходит в fallback. Пользовательское (пациенту/врачу лично) в fallback уйти не
 * может — его нельзя переадресовать оператору, — но обязано быть посчитано и видно.
 */
export type EmptyAudienceSeverity = "operational" | "user_facing";

export type EmptyAudienceEvent = {
  /** Короткий стабильный ключ места (`notify_doctor_program_note`), без PII. */
  topic: string;
  severity: EmptyAudienceSeverity;
  /** Каналы, по которым аудитория оказалась пуста. */
  channels: string[];
  /** Дополнительный контекст БЕЗ персональных данных (id организации, вид сущности). */
  context?: Record<string, string | number | boolean | null>;
};

export type EmptyAudienceCounterMeta = {
  total: number;
  operationalTotal: number;
  userFacingTotal: number;
  byTopic: Record<string, number>;
  lastAt: string | null;
  lastTopic: string | null;
  lastSeverity: EmptyAudienceSeverity | null;
};

export const EMPTY_EMPTY_AUDIENCE_COUNTER: EmptyAudienceCounterMeta = {
  total: 0,
  operationalTotal: 0,
  userFacingTotal: 0,
  byTopic: {},
  lastAt: null,
  lastTopic: null,
  lastSeverity: null,
};

/** Сколько тем держим в счётчике — чтобы `meta_json` не рос без границы. */
const MAX_TRACKED_TOPICS = 40;

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function parseEmptyAudienceCounter(meta: unknown): EmptyAudienceCounterMeta {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return { ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} };
  const m = meta as Record<string, unknown>;
  const byTopic: Record<string, number> = {};
  const rawByTopic = m.byTopic;
  if (rawByTopic && typeof rawByTopic === "object" && !Array.isArray(rawByTopic)) {
    for (const [k, v] of Object.entries(rawByTopic as Record<string, unknown>)) {
      const n = asNumber(v);
      if (n > 0) byTopic[k] = n;
    }
  }
  const lastSeverity = m.lastSeverity === "operational" || m.lastSeverity === "user_facing" ? m.lastSeverity : null;
  return {
    total: asNumber(m.total),
    operationalTotal: asNumber(m.operationalTotal),
    userFacingTotal: asNumber(m.userFacingTotal),
    byTopic,
    lastAt: typeof m.lastAt === "string" && m.lastAt.trim() ? m.lastAt : null,
    lastTopic: typeof m.lastTopic === "string" && m.lastTopic.trim() ? m.lastTopic : null,
    lastSeverity,
  };
}

/** Счётчик монотонный: он и есть запись события, поэтому уменьшаться не должен. */
export function mergeEmptyAudienceCounter(
  previous: EmptyAudienceCounterMeta,
  event: EmptyAudienceEvent,
  nowIso: string,
): EmptyAudienceCounterMeta {
  const byTopic = { ...previous.byTopic };
  byTopic[event.topic] = (byTopic[event.topic] ?? 0) + 1;
  const trimmed = Object.entries(byTopic)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TRACKED_TOPICS);
  return {
    total: previous.total + 1,
    operationalTotal: previous.operationalTotal + (event.severity === "operational" ? 1 : 0),
    userFacingTotal: previous.userFacingTotal + (event.severity === "user_facing" ? 1 : 0),
    byTopic: Object.fromEntries(trimmed),
    lastAt: nowIso,
    lastTopic: event.topic,
    lastSeverity: event.severity,
  };
}

/** Окно, в котором свежее событие пустой аудитории поднимает критический сигнал. */
export const EMPTY_AUDIENCE_ALERT_WINDOW_SECONDS = 60 * 60;

export type EmptyAudienceSignal = {
  /** Есть событие внутри окна — счётчик обязан прозвенеть сам по себе. */
  active: boolean;
  total: number;
  lastAt: string | null;
  lastTopic: string | null;
  topTopics: Array<{ topic: string; count: number }>;
};

export function classifyEmptyAudienceSignal(
  counter: EmptyAudienceCounterMeta,
  nowMs: number = Date.now(),
  windowSeconds: number = EMPTY_AUDIENCE_ALERT_WINDOW_SECONDS,
): EmptyAudienceSignal {
  const topTopics = Object.entries(counter.byTopic)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic, count]) => ({ topic, count }));
  let active = false;
  if (counter.lastAt) {
    const t = Date.parse(counter.lastAt);
    if (Number.isFinite(t) && nowMs - t <= windowSeconds * 1000) active = true;
  }
  return {
    active,
    total: counter.total,
    lastAt: counter.lastAt,
    lastTopic: counter.lastTopic,
    topTopics,
  };
}

export type OperatorDestination = {
  channel: string;
  address: string;
  /** `null` — адрес не подтверждён двойным opt-in, значит для проверки он ОТСУТСТВУЕТ. */
  verifiedAt?: string | null;
  /** ISO, до которого адрес подавлен после отскока (SNS давит 7 суток). */
  suppressedUntil?: string | null;
};

/** D-b: неподтверждённый или подавленный из-за bounce адрес считается ОТСУТСТВУЮЩИМ. */
export function isDestinationPresent(
  destination: OperatorDestination,
  nowMs: number = Date.now(),
): boolean {
  if (!destination.address.trim()) return false;
  if (!destination.verifiedAt) return false;
  if (destination.suppressedUntil) {
    const until = Date.parse(destination.suppressedUntil);
    if (Number.isFinite(until) && until > nowMs) return false;
  }
  return true;
}

export function selectPresentDestinations(
  destinations: readonly OperatorDestination[],
  nowMs: number = Date.now(),
): OperatorDestination[] {
  return destinations.filter((d) => isDestinationPresent(d, nowMs));
}
