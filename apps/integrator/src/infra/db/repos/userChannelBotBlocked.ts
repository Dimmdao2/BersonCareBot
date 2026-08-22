import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { RECIPIENT_BLOCKED_BOT_REASON } from '../../delivery/recipientBotBlocked.js';
import { writeDirectPublic } from '../directPublic/writePort.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * D17 шаг 2b. Пять реляционных операторов по `public.user_channel_bindings` (upsert метки и четыре
 * UPDATE) заменены ОДНИМ именованным корнем: постановка и снятие — одна запись с параметром
 * состояния, а три формы поиска строки — параметры того же действия, а не разные действия.
 *
 * Принципал выбирает единственный chokepoint `writeDirectPublic`, и организацию корень получает ту
 * же, которую поставил вызывающий: `outgoingDeliveryWorker` обрабатывает арендаторскую строку
 * очереди внутри `runWithOrganizationPrincipal(scope.organizationId, …)`, а `app_tenant_service` —
 * единственная роль логина интегратора с записью в `bot_blocked_at`/`bot_blocked_reason`.
 * Организация не угадывается: читается ТА ЖЕ окружающая, которой пользуется `app.current_org_id()`
 * в политиках `rev10_tenant_insert_216`/`rev10_tenant_update_216`, повторённых в теле корня.
 *
 * Строка очереди оператора (`scope.kind === 'operator'`) идёт без организационного принципала —
 * там корень недостижим, ровно как сегодня недостижима запись по отношению: у
 * `app_operational_delivery_worker` прав на эту таблицу нет.
 */
const SET_USER_CHANNEL_BOT_BLOCKED_ROOT =
  'app.integrator_set_user_channel_bot_blocked(uuid,uuid,text,text,boolean,text)';

const MESSENGER_CHANNELS = new Set(['telegram', 'max']);

function normalizeChannel(channel: string): 'telegram' | 'max' | null {
  const c = channel.trim().toLowerCase();
  return MESSENGER_CHANNELS.has(c) ? (c as 'telegram' | 'max') : null;
}

function normalizeExternalId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

/** Resolve platform user id from queue row / intent (broadcast stores uuid in meta.userId). */
export function resolvePlatformUserIdForBotBlockedMarker(input: {
  metaUserId?: unknown;
  payloadJson?: Record<string, unknown>;
}): string | null {
  const fromPayload =
    typeof input.payloadJson?.clientUserId === 'string'
      ? input.payloadJson.clientUserId.trim()
      : '';
  if (fromPayload && /^[0-9a-f-]{36}$/i.test(fromPayload)) return fromPayload;
  const fromMeta = typeof input.metaUserId === 'string' ? input.metaUserId.trim() : '';
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) return fromMeta;
  return null;
}

async function setUserChannelBotBlocked(
  db: DbPort,
  input: { platformUserId?: string | null; channel: string; externalId?: string | null },
  botBlocked: boolean,
): Promise<void> {
  const channel = normalizeChannel(input.channel);
  if (!channel) return;
  const platformUserId = input.platformUserId?.trim() || null;
  const externalId = normalizeExternalId(input.externalId);
  // Ни человека, ни внешнего идентификатора — искать нечего; так же молча выходил и прежний писатель.
  if (!platformUserId && !externalId) return;
  const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
  const botBlockedReason = botBlocked ? RECIPIENT_BLOCKED_BOT_REASON : null;
  await writeDirectPublic(
    'user-channel-bot-blocked-set',
    () =>
      runIntegratorNamedRoot(
        db,
        SET_USER_CHANNEL_BOT_BLOCKED_ROOT,
        [organizationId, platformUserId, channel, externalId, botBlocked, botBlockedReason],
        sql`SELECT app.integrator_set_user_channel_bot_blocked(
          ${organizationId}::uuid, ${platformUserId}::uuid, ${channel}::text,
          ${externalId}::text, ${botBlocked}::boolean, ${botBlockedReason}::text
        )`,
      ),
    { organizationId },
  );
}

export async function markUserChannelBotBlocked(
  db: DbPort,
  input: { platformUserId?: string | null; channel: string; externalId?: string | null },
): Promise<void> {
  await setUserChannelBotBlocked(db, input, true);
}

export async function clearUserChannelBotBlocked(
  db: DbPort,
  input: { platformUserId?: string | null; channel: string; externalId?: string | null },
): Promise<void> {
  // Снятие метки строку не создаёт: у корня ветка вставки живёт только под `p_bot_blocked = true`,
  // ровно как прежний писатель, у которого «снять» было только UPDATE.
  await setUserChannelBotBlocked(db, input, false);
}
