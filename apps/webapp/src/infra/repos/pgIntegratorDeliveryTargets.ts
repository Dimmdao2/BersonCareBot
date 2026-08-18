import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  IntegratorDeliveryTargetSelector,
  IntegratorDeliveryTargetSnapshot,
  IntegratorDeliveryTargetsPort,
} from '@/modules/integrator/integratorDeliveryTargetsPort';

type JsonResultRow = { result: unknown };

function requireObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Отказ резолвера и честно пустая аудитория — разные вещи (D-b). Отказ бросает и доходит до
 * инцидента; «нет такого адресата» / «адресат вне организации» возвращаются НАЗВАННЫМ кодом,
 * а не `null` без причины.
 */
function parseSnapshot(value: unknown): IntegratorDeliveryTargetSnapshot {
  const payload = requireObject(value, 'integrator_delivery_target_snapshot_invalid');
  if (payload.ok !== true) {
    const code = typeof payload.code === 'string' ? payload.code : 'delivery_target_not_found';
    return { ok: false, code };
  }
  const bindings = requireObject(payload.bindings, 'integrator_delivery_target_snapshot_invalid');
  if (
    typeof payload.platformUserId !== 'string' ||
    !Array.isArray(payload.channelPreferences) ||
    !Array.isArray(payload.topicChannelRows)
  ) {
    throw new Error('integrator_delivery_target_snapshot_invalid');
  }
  return {
    ok: true,
    platformUserId: payload.platformUserId,
    ...(typeof bindings.telegram === 'string' ? { telegramId: bindings.telegram } : {}),
    ...(typeof bindings.max === 'string' ? { maxId: bindings.max } : {}),
    channelPreferences:
      payload.channelPreferences as Extract<
        IntegratorDeliveryTargetSnapshot,
        { ok: true }
      >['channelPreferences'],
    topicChannelRows: payload.topicChannelRows as Extract<
      IntegratorDeliveryTargetSnapshot,
      { ok: true }
    >['topicChannelRows'],
    ...(typeof payload.emailRecipient === 'string'
      ? { emailRecipient: payload.emailRecipient }
      : {}),
    emailVerified: payload.emailVerified === true,
    muted: payload.muted === true,
    topicMasterEnabled: payload.topicMasterEnabled === true,
    hasWebPushSubscription: payload.hasWebPushSubscription === true,
    vapidConfigured: payload.vapidConfigured === true,
    smtpConfigured: payload.smtpConfigured === true,
  };
}

/**
 * Единственный путь к аудитории доставки интегратора на порту вебаппа. Ровно один объявленный
 * корень вместо девяти сырых чтений отношений: под `tenant_service` relation-возможности нет и по
 * замыслу не будет, а расширять гранты ради этого маршрута владелец запретил.
 */
export function createPgIntegratorDeliveryTargetsPort(): IntegratorDeliveryTargetsPort {
  return {
    async readSnapshot(selector: IntegratorDeliveryTargetSelector) {
      const nowIso = selector.nowIso ?? new Date().toISOString();
      const args = [
        selector.organizationId,
        nonEmpty(selector.phoneNormalized),
        nonEmpty(selector.telegramId),
        nonEmpty(selector.maxId),
        nonEmpty(selector.platformUserId),
        nonEmpty(selector.integratorUserId),
        nonEmpty(selector.topicCode),
        nowIso,
      ] as const;
      const result = await runWebappNamedRoot<JsonResultRow>(
        getWebappSqlDb(),
        'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)',
        args,
        sql`SELECT app.read_integrator_delivery_target_snapshot(
          ${args[0]}::uuid, ${args[1]}::text, ${args[2]}::text, ${args[3]}::text,
          ${args[4]}::uuid, ${args[5]}::bigint, ${args[6]}::text, ${args[7]}::timestamptz
        ) AS result`,
      );
      return parseSnapshot(result.rows[0]?.result);
    },
  };
}
