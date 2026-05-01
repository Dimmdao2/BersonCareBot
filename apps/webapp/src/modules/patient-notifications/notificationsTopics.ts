/**
 * Темы рассылок для экрана пациента `/notifications` (`system_settings.notifications_topics`, scope admin).
 * Поле `id` совпадает с `mailing_topics_webapp.code`.
 */

export const NOTIFICATIONS_TOPICS_MAX = 20;

export const NOTIFICATION_TOPIC_ID_MAX_LEN = 64;

export const NOTIFICATION_TOPIC_TITLE_MAX_LEN = 200;

const TOPIC_CODE_RE = /^[a-z0-9_]+$/;

/** Совпадает с правилами {@link parseNotificationsTopics} / PATCH (для клиентской проверки перед сохранением). */
export function isValidNotificationTopicId(raw: string): boolean {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || id.length > NOTIFICATION_TOPIC_ID_MAX_LEN) return false;
  return TOPIC_CODE_RE.test(id);
}

/** Непустая подпись после trim и в пределах лимита. */
export function isValidNotificationTopicTitle(raw: string): boolean {
  const title = typeof raw === "string" ? raw.trim() : "";
  return title.length > 0 && title.length <= NOTIFICATION_TOPIC_TITLE_MAX_LEN;
}

/** Единственный источник дефолта для парсера, SQL-миграций и админ-формы до первого сохранения. */
export const DEFAULT_NOTIFICATION_TOPICS: readonly Readonly<{ id: string; title: string }>[] = [
  { id: "exercise_reminders", title: "Напоминания об упражнениях" },
  { id: "symptom_reminders", title: "Напоминания о симптомах" },
  { id: "appointment_reminders", title: "Напоминания о записях" },
  { id: "news", title: "Новости и обновления" },
];

/** JSON для колонки `value_json` при дефолтном INSERT (совпадает с {@link DEFAULT_NOTIFICATION_TOPICS}). */
export function notificationsTopicsDefaultValueJsonString(): string {
  return JSON.stringify({
    value: DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ id: r.id, title: r.title })),
  });
}

function unwrapValueJson(valueJson: unknown): unknown {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as { value: unknown }).value;
  }
  return valueJson;
}

export type NotificationTopicRow = { id: string; title: string };

/**
 * Чтение для пациента и админ-формы: при битых данных возвращает {@link DEFAULT_NOTIFICATION_TOPICS}.
 */
export function parseNotificationsTopics(valueJson: unknown): NotificationTopicRow[] {
  const raw = unwrapValueJson(valueJson);
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > NOTIFICATIONS_TOPICS_MAX) {
    return [...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))];
  }
  const seen = new Set<string>();
  const out: NotificationTopicRow[] = [];
  for (const row of raw) {
    if (row === null || typeof row !== "object") {
      return [...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))];
    }
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (
      !id ||
      !title ||
      id.length > NOTIFICATION_TOPIC_ID_MAX_LEN ||
      title.length > NOTIFICATION_TOPIC_TITLE_MAX_LEN ||
      !TOPIC_CODE_RE.test(id)
    ) {
      return [...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))];
    }
    if (seen.has(id)) {
      return [...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))];
    }
    seen.add(id);
    out.push({ id, title });
  }
  return out;
}

export type NormalizeNotificationsTopicsForAdminPatchOptions = {
  /** Коды из `subscriptionMailingProjection.listTopics()` (`topic.code`). Пустое множество → только структурная проверка. */
  knownTopicCodes: Set<string>;
};

/**
 * Валидация PATCH `/api/admin/settings`: неизвестный `id` при непустой проекции → ok: false.
 */
export function normalizeNotificationsTopicsForAdminPatch(
  inner: unknown,
  options: NormalizeNotificationsTopicsForAdminPatchOptions,
): { ok: true; value: NotificationTopicRow[] } | { ok: false } {
  if (!Array.isArray(inner) || inner.length === 0 || inner.length > NOTIFICATIONS_TOPICS_MAX) {
    return { ok: false };
  }
  const seen = new Set<string>();
  const out: NotificationTopicRow[] = [];
  for (const row of inner) {
    if (row === null || typeof row !== "object") return { ok: false };
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (
      !id ||
      !title ||
      id.length > NOTIFICATION_TOPIC_ID_MAX_LEN ||
      title.length > NOTIFICATION_TOPIC_TITLE_MAX_LEN ||
      !TOPIC_CODE_RE.test(id)
    ) {
      return { ok: false };
    }
    if (seen.has(id)) return { ok: false };
    seen.add(id);
    out.push({ id, title });
  }
  const codes = options.knownTopicCodes;
  if (codes.size > 0) {
    for (const r of out) {
      if (!codes.has(r.id)) return { ok: false };
    }
  }
  return { ok: true, value: out };
}
