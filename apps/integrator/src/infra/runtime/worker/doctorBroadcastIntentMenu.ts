/**
 * Enrich queued `doctor_broadcast_intent` message.send payloads with the same Telegram reply
 * keyboard as normal `message.send` in `delivery.ts` (per-chat only; no global BotFather menu).
 */
import type {
  ContentPort,
  DbPort,
  DomainContext,
  OutgoingIntent,
  TemplatePort,
} from '../../../kernel/contracts/index.js';
import { env } from '../../../config/env.js';
import {
  buildWebappEntryUrl,
  buildWebappEntryUrlForMax,
} from '../../../integrations/webappEntryToken.js';
import { getCanonicalPlatformUserDeliveryIdentity } from '../../db/repos/platformUserDeliveryPhone.js';
import {
  asNumber,
  asRecord,
  buildMainReplyKeyboardMarkup,
} from '../../../kernel/domain/executor/helpers.js';
import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';

export type DoctorBroadcastMenuWorkerDeps = {
  templatePort: TemplatePort;
  contentPort: ContentPort;
  isTelegramMenuOnButtonPress: () => Promise<boolean>;
};

/**
 * Track D (#987): the broadcast link no longer re-reads a retired numeric identity here. The
 * recipient is already known canonically (`payloadJson.clientUserId` = `platform_users.id`), so the
 * only thing still needed from the delivery identity is whether a confirmed phone exists.
 */
export async function resolveLinkedPhoneForPlatformUser(
  db: DbPort,
  platformUserId: string,
): Promise<{ linkedPhone: boolean }> {
  const identity = await getCanonicalPlatformUserDeliveryIdentity(db, platformUserId);
  if (!identity) return { linkedPhone: false };
  return { linkedPhone: identity.phoneNormalized !== null };
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
  /** Canonical `platform_users.id` of the broadcast recipient; never a retired numeric identity. */
  platformUserId: string;
}): Promise<Record<string, string>> {
  const appBase = env.APP_BASE_URL;
  const links: Record<string, string> = {};
  const appBaseUrl = appBase.trim().replace(/\/+$/, '');
  if (appBaseUrl.startsWith('http://') || appBaseUrl.startsWith('https://')) {
    links.remindersUrl = `${appBaseUrl}/app/patient/reminders`;
  }
  if (input.queueChannel === 'telegram') {
    const chatId = asNumber(input.recipient.chatId);
    if (chatId !== null) {
      const webappEntryUrl = buildWebappEntryUrl(
        { chatId, platformUserId: input.platformUserId },
        appBase,
      );
      if (webappEntryUrl) {
        const baseWebappUrl = webappEntryUrl;
        const enc = (p: string) => encodeURIComponent(p);
        links.webappEntryUrl = baseWebappUrl;
        links.webappHomeUrl = `${baseWebappUrl}&next=${enc('/app/patient')}`;
        links.webappCabinetUrl = `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`;
        links.webappAddressUrl = `${baseWebappUrl}&next=${enc('/app/patient/address')}`;
        links.bookingUrl = `${baseWebappUrl}&next=${enc('/app/patient/booking')}`;
      }
    }
  } else if (input.queueChannel === 'max') {
    const raw = input.recipient.chatId;
    const maxId = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
    if (maxId.length > 0) {
      const webappEntryUrl = buildWebappEntryUrlForMax(
        { maxId, platformUserId: input.platformUserId },
        appBase,
      );
      if (webappEntryUrl) {
        const baseWebappUrl = webappEntryUrl;
        const enc = (p: string) => encodeURIComponent(p);
        links.webappEntryUrl = baseWebappUrl;
        links.webappHomeUrl = `${baseWebappUrl}&next=${enc('/app/patient')}`;
        links.bookingUrl = `${baseWebappUrl}&next=${enc('/app/patient/booking')}`;
      }
    }
  }

  if (typeof links.bookingUrl !== 'string' && env.BOOKING_URL) {
    links.bookingUrl = env.BOOKING_URL;
  }
  return links;
}

/**
 * When `attachMenu` is set on the queue payload, merge reply keyboard into `message.send`
 * for Telegram only (persistent reply menu) when linked phone and `sendMenuOnButtonPress`.
 * MAX: авто-подмешивание `menus.main` (Запись/Приложение) отключено — мини-приложение из чата.
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

  const clientUserId =
    typeof row.payloadJson.clientUserId === 'string' ? row.payloadJson.clientUserId.trim() : '';
  if (!clientUserId) return intent;

  const { linkedPhone } = await resolveLinkedPhoneForPlatformUser(db, clientUserId);

  const payload = asRecord(intent.payload);
  const recipient = asRecord(payload.recipient);

  const webappFacts = await buildWebappLinkFactsForRecipient({
    db,
    queueChannel: row.channel,
    recipient,
    platformUserId: clientUserId,
  });

  const ctx = buildDoctorBroadcastMenuContext({
    intent,
    queueChannel: row.channel,
    linkedPhone,
    webappFacts,
  });

  let nextPayload: Record<string, unknown> = { ...payload };

  if (
    (await menu.isTelegramMenuOnButtonPress()) === true &&
    linkedPhone &&
    row.channel === 'telegram' &&
    !nextPayload.replyMarkup
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

  return { ...intent, payload: nextPayload };
}
