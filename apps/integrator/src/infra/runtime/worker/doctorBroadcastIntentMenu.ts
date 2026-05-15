/**
 * Enrich queued `doctor_broadcast_intent` message.send payloads with the same reply / inline
 * menu markup as normal `message.send` in `delivery.ts` (per-chat only; no global BotFather menu).
 */
import { sql } from 'drizzle-orm';
import type {
  ContentPort,
  DbPort,
  DomainContext,
  OutgoingIntent,
  TemplatePort,
} from '../../../kernel/contracts/index.js';
import { env } from '../../../config/env.js';
import { getAppBaseUrl } from '../../../config/appBaseUrl.js';
import { buildWebappEntryUrl, buildWebappEntryUrlForMax } from '../../../integrations/webappEntryToken.js';
import { runIntegratorSql } from '../../db/runIntegratorSql.js';
import {
  getIntegratorLinkedPhoneSource,
  resolveLinkedPhoneNormalized,
} from '../../db/repos/linkedPhoneSource.js';
import {
  asNumber,
  asRecord,
  asStringArray,
  buildMainReplyKeyboardMarkup,
} from '../../../kernel/domain/executor/helpers.js';
import { enrichMessageSendPayloadWithMaxMainInlineIfApplicable } from '../../../kernel/domain/executor/handlers/delivery.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';

export type DoctorBroadcastMenuWorkerDeps = {
  templatePort: TemplatePort;
  contentPort: ContentPort;
  sendMenuOnButtonPress: boolean;
};

async function resolveLinkedPhoneForPlatformUser(
  db: DbPort,
  platformUserId: string,
  messengerLabel: 'telegram' | 'max',
): Promise<{ linkedPhone: boolean; integratorUserId: string | null }> {
  const strategy = await getIntegratorLinkedPhoneSource(db);
  try {
    const res = await runIntegratorSql<{
      pub_phone: string | null;
      legacy_contact_phone: string | null;
      integrator_user_id: string | null;
    }>(
      db,
      sql`
      WITH RECURSIVE pu_chain AS (
        SELECT pu.id, pu.phone_normalized, pu.merged_into_id, pu.integrator_user_id
        FROM public.platform_users pu
        WHERE pu.id = ${platformUserId}::uuid
        UNION ALL
        SELECT p.id, p.phone_normalized, p.merged_into_id, p.integrator_user_id
        FROM public.platform_users p
        INNER JOIN pu_chain c ON p.id = c.merged_into_id
      )
      SELECT NULLIF(TRIM(terminal.phone_normalized), '') AS pub_phone,
             cp.phone AS legacy_contact_phone,
             terminal.integrator_user_id::text AS integrator_user_id
      FROM pu_chain terminal
      LEFT JOIN LATERAL (
        SELECT c.value_normalized AS phone
        FROM contacts c
        WHERE c.user_id = terminal.integrator_user_id
          AND c.type = 'phone'
          AND c.label = ${messengerLabel}
        ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
        LIMIT 1
      ) cp ON true
      WHERE terminal.merged_into_id IS NULL
      LIMIT 1
    `,
    );
    const row = res.rows[0];
    if (!row) return { linkedPhone: false, integratorUserId: null };
    const phone = resolveLinkedPhoneNormalized(strategy, row.pub_phone, row.legacy_contact_phone);
    const linkedPhone = typeof phone === 'string' && phone.trim().length > 0;
    const integratorUserId =
      typeof row.integrator_user_id === 'string' && row.integrator_user_id.trim().length > 0
        ? row.integrator_user_id.trim()
        : null;
    return { linkedPhone, integratorUserId };
  } catch {
    return { linkedPhone: false, integratorUserId: null };
  }
}

function deliveryTargetsMax(delivery: Record<string, unknown>, eventSource: string): boolean {
  const channels = asStringArray(delivery.channels);
  if (channels.includes('max')) return true;
  return channels.length === 0 && eventSource === 'max';
}

function buildDoctorBroadcastMenuContext(input: {
  intent: OutgoingIntent;
  queueChannel: string;
  linkedPhone: boolean;
  webappFacts: Record<string, unknown>;
}): DomainContext {
  const source = input.queueChannel === 'max' ? 'max' : 'telegram';
  const meta = input.intent.meta;
  return {
    event: {
      type: 'webhook.received',
      meta: {
        eventId: meta.eventId,
        occurredAt: meta.occurredAt,
        source,
        ...(meta.correlationId ? { correlationId: meta.correlationId } : {}),
        ...(meta.userId ? { userId: meta.userId } : {}),
      },
      payload: {},
    },
    nowIso: new Date().toISOString(),
    values: {},
    base: {
      actor: { isAdmin: false },
      identityLinks: [],
      linkedPhone: input.linkedPhone,
      facts: { links: input.webappFacts },
    },
  };
}

async function buildWebappLinkFactsForRecipient(input: {
  db: DbPort;
  queueChannel: string;
  recipient: Record<string, unknown>;
  integratorUserId: string | null;
}): Promise<Record<string, string>> {
  const appBase = await getAppBaseUrl(input.db);
  const links: Record<string, string> = {};
  const intId = input.integratorUserId ?? undefined;

  if (input.queueChannel === 'telegram') {
    const chatId = asNumber(input.recipient.chatId);
    if (chatId !== null) {
      const webappEntryUrl = buildWebappEntryUrl(
        intId !== undefined ? { chatId, integratorUserId: intId } : { chatId },
        appBase,
      );
      if (webappEntryUrl) {
        const baseWebappUrl = webappEntryUrl;
        const enc = (p: string) => encodeURIComponent(p);
        links.webappEntryUrl = baseWebappUrl;
        links.webappHomeUrl = `${baseWebappUrl}&next=${enc('/app/patient')}`;
        links.webappRemindersUrl = `${baseWebappUrl}&next=${enc('/app/patient/reminders')}`;
        links.webappDiaryUrl = `${baseWebappUrl}&next=${enc('/app/patient/diary?tab=symptoms')}`;
        links.webappCabinetUrl = `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`;
        links.webappAddressUrl = `${baseWebappUrl}&next=${enc('/app/patient/address')}`;
        links.bookingUrl = links.webappCabinetUrl;
      }
    }
  } else if (input.queueChannel === 'max') {
    const raw = input.recipient.chatId;
    const maxId = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
    if (maxId.length > 0) {
      const webappEntryUrl = buildWebappEntryUrlForMax(
        intId !== undefined ? { maxId, integratorUserId: intId } : { maxId },
        appBase,
      );
      if (webappEntryUrl) {
        const baseWebappUrl = webappEntryUrl;
        const enc = (p: string) => encodeURIComponent(p);
        links.webappEntryUrl = baseWebappUrl;
        links.webappHomeUrl = `${baseWebappUrl}&next=${enc('/app/patient')}`;
        links.bookingUrl = `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`;
      }
    }
  }

  if (typeof links.bookingUrl !== 'string' && env.BOOKING_URL) {
    links.bookingUrl = env.BOOKING_URL;
  }
  return links;
}

/**
 * When `attachMenu` is set on the queue payload, merge reply / inline keyboard into `message.send`
 * (Telegram persistent reply keyboard; MAX `menus.main` inline) if the patient has linked phone
 * and the product flag `sendMenuOnButtonPress` is on for Telegram reply keyboard.
 */
export async function enrichDoctorBroadcastIntentIfNeeded(input: {
  db: DbPort;
  row: OutgoingDeliveryQueueRow;
  intent: OutgoingIntent;
  menu: DoctorBroadcastMenuWorkerDeps;
}): Promise<OutgoingIntent> {
  const { row, intent, menu, db } = input;
  if (intent.type !== 'message.send') return intent;

  const attachMenu = row.payloadJson.attachMenu === true;
  if (!attachMenu) return intent;

  if (row.channel === 'sms') return intent;

  const clientUserId = typeof row.payloadJson.clientUserId === 'string' ? row.payloadJson.clientUserId.trim() : '';
  if (!clientUserId) return intent;

  const messengerLabel = row.channel === 'max' ? 'max' : 'telegram';
  const { linkedPhone, integratorUserId } = await resolveLinkedPhoneForPlatformUser(db, clientUserId, messengerLabel);

  const payload = asRecord(intent.payload);
  const recipient = asRecord(payload.recipient);
  const delivery = asRecord(payload.delivery);

  const webappFacts = await buildWebappLinkFactsForRecipient({
    db,
    queueChannel: row.channel,
    recipient,
    integratorUserId,
  });

  const ctx = buildDoctorBroadcastMenuContext({
    intent,
    queueChannel: row.channel,
    linkedPhone,
    webappFacts,
  });

  let nextPayload: Record<string, unknown> = { ...payload };

  if (
    menu.sendMenuOnButtonPress === true
    && linkedPhone
    && row.channel === 'telegram'
    && !nextPayload.replyMarkup
  ) {
    const chatId = asNumber(recipient.chatId);
    if (chatId !== null) {
      const replyMarkup = await buildMainReplyKeyboardMarkup({
        ctx,
        templatePort: menu.templatePort,
        contentPort: menu.contentPort,
      });
      if (replyMarkup) {
        nextPayload = { ...nextPayload, replyMarkup };
      }
    }
  }

  if (linkedPhone && deliveryTargetsMax(delivery, ctx.event.meta.source) && row.channel === 'max') {
    nextPayload = await enrichMessageSendPayloadWithMaxMainInlineIfApplicable(nextPayload, ctx, {
      templatePort: menu.templatePort,
      contentPort: menu.contentPort,
    });
  }

  return { ...intent, payload: nextPayload };
}
