/**
 * D15b/7a Ш8 — запись акта связывания личности с медициной в существующий `admin_audit_log`.
 *
 * Здесь нет ни своей таблицы, ни своей очереди, ни своего журнала (решение владельца,
 * `IDENTITY_AND_MERGE_SCHEME.md` §2c): единственное, что делает этот файл, — зовёт ОДНУ дверь
 * `app.record_collapsing_audit_event`. Прямого `INSERT` из приложения здесь быть не может: дверь
 * сама считает ключ схлопывания, сама проверяет содержимое записи и сама применяет правило тревоги.
 * Приложение приносит факт, а не строку журнала.
 *
 * Объём записи на каждой точке задан планом, а не вызывающим: вход — раз на сессию, открытие
 * карточки — раз на пару «врач-пациент» в сутки, список — одно событие на пакет. Поэтому у функций
 * ниже нет параметра «ключ» — его считает база.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

const RECORD_COLLAPSING_AUDIT_EVENT_ROOT =
  'app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)';

/** Четыре точки пересечения границы. Пятой здесь быть не может — список закрыт и в базе тоже. */
export const IDENTITY_BOUNDARY_ACTIONS = {
  sessionStart: 'identity_session_start',
  patientCardOpen: 'identity_patient_card_open',
  patientListView: 'identity_patient_list_view',
} as const;

export type IdentityBoundaryAction =
  (typeof IDENTITY_BOUNDARY_ACTIONS)[keyof typeof IDENTITY_BOUNDARY_ACTIONS];

export type IdentityBoundaryAuditResult = {
  /** Строка журнала создана этим вызовом (а не подняла `repeat_count` соседней). */
  insertedFirst: boolean;
  /** Пересечений этим человеком за скользящие сутки — то, что сравнивает правило тревоги. */
  crossings24h: number;
  /** Тревога сработала ПЕРВЫЙ раз в этом окне: доставлять её нужно ровно на этом ответе. */
  alarmFired: boolean;
};

/**
 * Непрозрачная метка сессии. В журнал не должно попасть ни секрета cookie, ни времени входа в
 * читаемом виде — достаточно того, что две записи одной сессии совпадают, а разных не совпадают.
 */
export function identitySessionRef(userId: string, issuedAtSeconds: number): string {
  return createHash('sha256')
    .update(`identity-session|${userId}|${issuedAtSeconds}`, 'utf8')
    .digest('hex');
}

function resultFromRow(raw: unknown): IdentityBoundaryAuditResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  const crossings = row.crossings_24h;
  return {
    insertedFirst: row.inserted_first === true,
    crossings24h:
      typeof crossings === 'number'
        ? crossings
        : typeof crossings === 'string'
          ? Number.parseInt(crossings, 10) || 0
          : 0,
    alarmFired: row.alarm_fired === true,
  };
}

/**
 * Одна поездка в дверь журнала. `details` — закрытый список ключей, который дверь проверяет по
 * содержимому: ни имени, ни телефона, ни почты, ни диагноза сюда не положить, попытка падает
 * `23514`. Свободного текста в записи нет вовсе.
 */
export async function recordIdentityBoundaryCrossing(input: {
  action: IdentityBoundaryAction;
  organizationId: string | null;
  actorId: string | null;
  subjectId: string | null;
  details: { point: string; session_ref?: string; subject_count?: number };
}): Promise<IdentityBoundaryAuditResult> {
  const detailsJson = JSON.stringify(input.details);
  const result = await runWebappNamedRoot<{ recorded: unknown }>(
    getWebappSqlDb(),
    RECORD_COLLAPSING_AUDIT_EVENT_ROOT,
    [input.action, input.organizationId, input.actorId, input.subjectId, null, detailsJson],
    sql`SELECT app.record_collapsing_audit_event(
      ${input.action}::text, ${input.organizationId}::uuid, ${input.actorId}::uuid,
      ${input.subjectId}::text, ${null}::text, ${detailsJson}::text
    ) AS recorded`,
  );
  return resultFromRow(result.rows[0]?.recorded);
}
