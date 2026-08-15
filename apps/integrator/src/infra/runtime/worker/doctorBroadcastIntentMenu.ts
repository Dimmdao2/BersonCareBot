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

export async function resolveLinkedPhoneForPlatformUser(
  db: DbPort,
  platformUserId: string,
): Promise<{ linkedPhone: boolean; integratorUserId: string | null }> {
  const identity = await getCanonicalPlatformUserDeliveryIdentity(db, platformUserId);
  if (!identity) return { linkedPhone: false, integratorUserId: null };
  return {
    linkedPhone: identity.phoneNormalized !== null,
    integratorUserId: identity.integratorUserId,
  };
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
  const appBase = env.APP_BASE_URL;
  const links: Record<string, string> = {};
  const appBaseUrl = appBase.trim().replace(/\/+$/, '');
  if (appBaseUrl.startsWith('http://') || appBaseUrl.startsWith('https://')) {
    links.remindersUrl = `${appBaseUrl}/app/patient/reminders`;
  }
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

  const { linkedPhone, integratorUserId } = await resolveLinkedPhoneForPlatformUser(db, clientUserId);

  const payload = asRecord(intent.payload);
  const recipient = asRecord(payload.recipient);

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
