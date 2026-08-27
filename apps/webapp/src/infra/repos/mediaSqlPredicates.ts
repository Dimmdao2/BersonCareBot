import { sql, type SQL } from 'drizzle-orm';

/** Rows visible in library / readable by GET (bare `media_files`, no alias). */
export const mediaReadableStatusPredicate = sql`(status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** Same filter with table alias `m`. */
export const mediaReadableStatusPredicateM = sql`(m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/**
 * `usage_purpose`, которые библиотека медиа врача не показывает никогда.
 *
 * Один список, не по списку на запрос: второй, набранный руками рядом, разъезжается с этим на
 * следующем добавленном значении. Сегодня в нём одно — скачанная нами обложка ролика по ссылке
 * (`hosted_video_preview`): её никто не загружал, у неё нет папки и выбрать её в пикере нельзя.
 *
 * `program_item_submission` сюда НЕ входит намеренно: присланное пациентом выполнение задания
 * лежит в дереве папок клиента, и врач открывает это дерево осознанно («Файлы клиентов»). Из
 * общего списка оно и так убрано — фильтром по папкам, а не по назначению.
 */
export const MEDIA_LIBRARY_HIDDEN_USAGE_PURPOSES = ['hosted_video_preview'] as const;

/** Библиотека медиа врача показывает только файлы, не служебные строки (alias `m`). */
export const mediaLibraryVisibleUsagePredicateM = sql`(m.usage_purpose IS NULL OR m.usage_purpose <> ALL (ARRAY[${sql.join(
  MEDIA_LIBRARY_HIDDEN_USAGE_PURPOSES.map((purpose) => sql`${purpose}`),
  sql`, `,
)}]::text[]))`;

/** Rows queued for background S3 removal (includes legacy `deleting`). */
export const mediaS3PurgeStatusPredicate = sql`status IN ('pending_delete', 'deleting')`;

/** @deprecated String form for legacy embeds — prefer `mediaReadableStatusPredicate` in new SQL. */
export const MEDIA_READABLE_STATUS_SQL = `(status IS NULL OR status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** @deprecated Prefer `mediaReadableStatusPredicateM`. */
export const MEDIA_READABLE_STATUS_SQL_M = `(m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))`;

/** @deprecated Prefer `mediaS3PurgeStatusPredicate`. */
export const MEDIA_S3_PURGE_STATUS_SQL = `status IN ('pending_delete', 'deleting')`;

export function mediaReadableWhere(alias?: 'm'): SQL {
  return alias === 'm' ? mediaReadableStatusPredicateM : mediaReadableStatusPredicate;
}
