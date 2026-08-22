import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * D17 финал. Раньше здесь жили четыре реляционных чтения `public.platform_users` /
 * `public.user_contacts` / `public.user_channel_bindings` / `public.org_enrollments`, и открывала их
 * роль ВЕБАППА `app_tenant_service` — вместе со всем её арендаторским столом, включая ПДн. Теперь
 * читает база: два именованных корня отдают ровно то, что нужно вызывающему.
 *
 * Цепочка слияний (`merged_into_id`) и стена арендатора живут в телах корней, а не здесь: обе
 * обязаны быть неотделимы от чтения.
 */

const CHANNEL_BINDING_IDENTITY_ROOT =
  'app.integrator_read_channel_binding_identity(text,text,text)';
const CHANNEL_ORGANIZATION_ROOT = 'app.resolve_active_organization_for_channel_binding(text,text)';

export type ChannelBindingLinkData = {
  /** Canonical public platform user UUID. */
  userId: string;
  channelId: string;
  chatId: number;
  username: string | null;
  phoneNormalized: string | null;
};

type ChannelBindingIdentityRow = {
  platform_user_id: string | null;
  external_id: string | null;
  display_handle: string | null;
  phone_normalized: string | null;
};

/**
 * One door, two search forms: by channel external id OR by the confirmed phone.
 *
 * Два класса контекста, обе двери — порта интегратора: организационный принципал открывает дверь
 * класса `tenant_service`, интеграторский — класса `integrator`, и гейт корня ветвится по двери
 * (`20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal.sql`).
 *
 * Без арендатора чтения нет и быть не может, поэтому оно и не начинается. Стена корня — «человек
 * виден клинике, только если он её активный сотрудник либо активный зачисленный», и клинику она
 * берёт из принятого контекста. Bootstrap-принципал организации не несёт по контракту
 * (`app.install_port_context` требует `organization_id IS NULL` у обоих классов, которые рантайм
 * порта подбирает под bootstrap), значит третьей двери здесь нет: дверь без стены читала бы чужого
 * арендатора. Ответ «получатель не опознан» — это ПРАВИЛЬНЫЙ ответ для маршрута без клиники;
 * прежде вместо него улетал бросок, который не ловил никто до `eventGateway`, и человек не получал
 * НИ ОДНОГО ответа на своё сообщение.
 */
async function readChannelBindingIdentity(
  db: DbPort,
  input: { channelCode: string; externalId: string | null; phoneNormalized: string | null },
): Promise<ChannelBindingIdentityRow | null> {
  if (!getCurrentOrganizationPrincipalId()) return null;
  const res = await runIntegratorNamedRoot<ChannelBindingIdentityRow>(
    db,
    CHANNEL_BINDING_IDENTITY_ROOT,
    [input.channelCode, input.externalId, input.phoneNormalized],
    sql`SELECT platform_user_id, external_id, display_handle, phone_normalized
        FROM app.integrator_read_channel_binding_identity(
          ${input.channelCode}::text, ${input.externalId}::text, ${input.phoneNormalized}::text
        )`,
  );
  const row = res.rows[0];
  return row && typeof row.platform_user_id === 'string' && row.platform_user_id.trim()
    ? row
    : null;
}

function toLinkData(row: ChannelBindingIdentityRow, channelId: string): ChannelBindingLinkData {
  const chatId = Number(channelId);
  return {
    userId: row.platform_user_id!,
    channelId,
    chatId: Number.isFinite(chatId) ? chatId : 0,
    username: row.display_handle ?? null,
    phoneNormalized: row.phone_normalized?.trim() || null,
  };
}

/**
 * Канонический `platform_users.id` по привязке мессенджера (public.user_channel_bindings).
 */
export async function resolveCanonicalPlatformUserIdByChannel(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<string | null> {
  const row = await readChannelBindingIdentity(db, {
    channelCode: input.channelCode,
    externalId: input.externalId,
    phoneNormalized: null,
  });
  const canonical = row?.platform_user_id?.trim();
  return canonical ? canonical : null;
}

/** Canonical replacement for the former identities/telegram_state link-data read. */
export async function getChannelBindingLinkData(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<ChannelBindingLinkData | null> {
  const row = await readChannelBindingIdentity(db, {
    channelCode: input.channelCode,
    externalId: input.externalId,
    phoneNormalized: null,
  });
  return row ? toLinkData(row, input.externalId) : null;
}

/** Resolve a channel recipient from the canonical confirmed phone, never from integrator contacts. */
export async function findChannelBindingByPhone(
  db: DbPort,
  input: { channelCode: string; phoneNormalized: string },
): Promise<ChannelBindingLinkData | null> {
  const channelCode = input.channelCode === 'channel' ? 'telegram' : input.channelCode;
  const row = await readChannelBindingIdentity(db, {
    channelCode,
    externalId: null,
    phoneNormalized: input.phoneNormalized,
  });
  if (!row) return null;
  const channelId = row.external_id ?? '';
  return toLinkData(row, channelId);
}

/**
 * Exact active organization for a channel binding; zero or ambiguity fails closed.
 *
 * Дверь bootstrap-класса: пред-маршрутизация зовёт её ДО того, как клиника известна, поэтому
 * организационного принципала здесь нет и быть не может.
 */
export async function resolveActiveOrganizationIdForChannel(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<string | null> {
  const res = await runIntegratorNamedRoot<{ organization_id: string | null }>(
    db,
    CHANNEL_ORGANIZATION_ROOT,
    [input.channelCode, input.externalId],
    sql`SELECT app.resolve_active_organization_for_channel_binding(
          ${input.channelCode}::text, ${input.externalId}::text
        )::text AS organization_id`,
  );
  const organizationId = res.rows[0]?.organization_id;
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId.trim()
    : null;
}
