import type { ClientListItem } from '@/modules/doctor-clients/ports';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import { escapeHtml } from '@/shared/lib/escapeHtml';
import { richTextToMessengerHtml, richTextToPlainText } from '@/shared/lib/richText';
import type { BroadcastChannel } from './broadcastChannels';
import type {
  BroadcastAudienceFilter,
  BroadcastNotificationPrefsFlags,
  DoctorBroadcastQueueJob,
} from './ports';
import {
  broadcastIncludeMaxJob,
  broadcastIncludeSmsJob,
  broadcastIncludeTelegramJob,
  resolveBroadcastNotificationPrefsFromBatch,
} from './broadcastEligible';
import {
  BROADCAST_DELIVERY_CAP_EXCEEDED_CODE,
  DOCTOR_BROADCAST_QUEUE_KIND,
  DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
  MAX_BROADCAST_DELIVERY_JOBS,
} from './deliveryQueueKind';
import { buildBroadcastEmailHtml } from './emailDelivery';

const MESSAGE_TEXT_MAX = 3500;

export function buildBroadcastMessageText(title: string, body: string): string {
  const raw = `${title.trim()}\n\n${richTextToPlainText(body).trim()}`;
  if (raw.length <= MESSAGE_TEXT_MAX) return raw;
  return `${raw.slice(0, MESSAGE_TEXT_MAX - 1)}…`;
}

/** Split combined plain text (`title\\n\\nbody`, possibly truncated) for messenger HTML. */
export function splitBroadcastPlainCombined(combined: string): { title: string; body: string } {
  const sep = '\n\n';
  const idx = combined.indexOf(sep);
  if (idx < 0) return { title: combined.trim(), body: '' };
  return {
    title: combined.slice(0, idx).trim(),
    body: combined.slice(idx + sep.length),
  };
}

/** Tiptap JSON converted to the safe HTML subset of Telegram/MAX. */
export function richTextToTelegramHtml(value: string): string {
  const richHtml = richTextToMessengerHtml(value);
  if (richHtml !== null) return richHtml;
  return escapeHtml(value.trim());
}

/** Tiptap JSON converted to plain text for channels without markup. */
export function broadcastTextToPlain(value: string): string {
  return richTextToPlainText(value);
}

/** Telegram/MAX HTML: bold title and a safely converted rich body. */
export function buildBroadcastMessengerHtml(title: string, body: string): string {
  const t = title.trim();
  const b = richTextToTelegramHtml(body);
  const head = t ? `<b>${escapeHtml(t)}</b>` : '';
  if (!b) return head || '';
  return head ? `${head}\n\n${b}` : b;
}

function stableEventId(
  auditId: string,
  channel: string,
  clientUserId: string,
  suffix: string,
): string {
  const base = `broadcast:${auditId}:${channel}:${clientUserId}:${suffix}`;
  return base.length > 240 ? base.slice(0, 240) : base;
}

function buildMessageSendIntent(input: {
  eventId: string;
  channel: 'telegram' | 'max' | 'sms';
  clientUserId: string;
  recipient: Record<string, unknown>;
  text: string;
  deliveryChannels: string[];
  parseMode?: 'HTML';
  imageUrl?: string;
  unsubscribeUrl?: string;
  unsubscribeTopicTitle?: string;
}): Record<string, unknown> {
  const occurredAt = new Date().toISOString();
  const source = input.channel === 'sms' ? 'sms' : input.channel;
  return {
    type: 'message.send',
    meta: {
      eventId: input.eventId.slice(0, 200),
      occurredAt,
      source,
      userId: input.clientUserId,
      correlationId: `doctor-broadcast:${input.eventId.slice(0, 80)}`,
      // This queue producer is the trusted clinic-owned broadcast path. The central egress
      // policy accepts this marker only together with clinic_required below.
      outboundMessageClass: 'broadcast_event',
      outboundCapability: 'clinic_delivery',
    },
    payload: {
      recipient: input.recipient,
      message: { text: input.text },
      // Mailings never borrow a platform sender. The integrator resolves an exact-org,
      // tariff-allowed credential at dispatch time and fails closed if it is absent.
      delivery: {
        channels: input.deliveryChannels,
        maxAttempts: 1,
        senderScope: 'clinic_required',
      },
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.unsubscribeUrl
        ? {
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: input.unsubscribeTopicTitle
                      ? `Отписаться от «${input.unsubscribeTopicTitle}»`
                      : 'Отписаться от темы',
                    url: input.unsubscribeUrl,
                  },
                ],
              ],
            },
          }
        : {}),
    },
  };
}

function buildEmailMessageSendIntent(input: {
  eventId: string;
  clientUserId: string;
  email: string;
  title: string;
  body: string;
  html: string;
  inlineImage?: { url: string; mimeType: string; filename: string; cid: string };
}): Record<string, unknown> {
  return {
    type: 'message.send',
    meta: {
      eventId: input.eventId.slice(0, 200),
      occurredAt: new Date().toISOString(),
      source: 'email',
      userId: input.clientUserId,
      correlationId: `doctor-broadcast:${input.eventId.slice(0, 80)}`,
      outboundMessageClass: 'broadcast_event',
      outboundCapability: 'clinic_delivery',
    },
    payload: {
      recipient: { email: input.email },
      subject: input.title,
      message: { text: input.body },
      html: input.html,
      ...(input.inlineImage ? { inlineImage: input.inlineImage } : {}),
      delivery: {
        channels: ['email'],
        maxAttempts: 1,
        senderScope: 'clinic_required',
      },
    },
  };
}

export type DoctorBroadcastDeliveryJobsParams = {
  auditId: string;
  /** Тот же состав, что в превью «получатели» (**`eligibleClients`** из резолвера аудитории). */
  eligibleClients: readonly ClientListItem[];
  channels: readonly BroadcastChannel[];
  messageTitle: string;
  messageBodyPlain: string;
  audienceFilter?: BroadcastAudienceFilter;
  notificationPrefsByUserId?: ReadonlyMap<string, BroadcastNotificationPrefsFlags>;
  /** Копия на момент постановки в очередь; воркер читает из `payload_json`. */
  attachMenu?: boolean;
  /** Provider-readable URL encoder rendition: Telegram photo and email CID attachment source. */
  imageUrl?: string | null;
  /** MIME of the provider-readable encoder rendition behind `imageUrl`. */
  imageMimeType?: string | null;
  /** Signed, recipient-specific topic-unsubscribe URL. Messenger channels only. */
  unsubscribeUrlByUserId?: ReadonlyMap<string, string>;
  /** Human title of the one notification topic covered by every unsubscribe URL. */
  unsubscribeTopicTitle?: string;
  /** Confirmed primary email targets, resolved before the audit+queue transaction. */
  verifiedEmailByUserId?: ReadonlyMap<string, string>;
};

/**
 * Плоский список заданий очереди по **eligible**-клиентам (совпадает с превью) и выбранным каналам.
 * Правило prefs / изоляции совпадает с filterEligibleBroadcastClients для превью.
 */
export function buildDoctorBroadcastDeliveryJobs(
  input: DoctorBroadcastDeliveryJobsParams,
): DoctorBroadcastQueueJob[] {
  const audienceFilter = input.audienceFilter ?? 'all';
  const prefsMap =
    input.notificationPrefsByUserId ?? new Map<string, BroadcastNotificationPrefsFlags>();

  // Legacy bot_message → telegram + max (обратная совместимость).
  const legacyBotMessage = input.channels.includes('bot_message');
  const wantsTelegram = input.channels.includes('telegram') || legacyBotMessage;
  const wantsMax = input.channels.includes('max') || legacyBotMessage;
  const wantsSms = input.channels.includes('sms');
  const wantsEmail = input.channels.includes('email');
  const jobs: DoctorBroadcastQueueJob[] = [];
  const attachMenu = input.attachMenu === true;
  const plainCombined = buildBroadcastMessageText(input.messageTitle, input.messageBodyPlain);
  const { title: truncatedTitle, body: truncatedBody } = splitBroadcastPlainCombined(plainCombined);
  const richMessengerBody = richTextToMessengerHtml(input.messageBodyPlain);
  const richMessengerText = richMessengerBody
    ? `${truncatedTitle ? `<b>${escapeHtml(truncatedTitle)}</b>\n\n` : ''}${richMessengerBody}`
    : null;
  const messengerText =
    richMessengerText && richMessengerText.length <= MESSAGE_TEXT_MAX
      ? richMessengerText
      : buildBroadcastMessengerHtml(truncatedTitle, truncatedBody);
  const smsText = broadcastTextToPlain(plainCombined);

  for (const client of input.eligibleClients) {
    const prefs = resolveBroadcastNotificationPrefsFromBatch(prefsMap, client.userId);
    const tg = client.bindings.telegramId?.trim();
    const mx = client.bindings.maxId?.trim();
    const unsubscribeUrl = input.unsubscribeUrlByUserId?.get(client.userId);

    if (wantsTelegram) {
      if (tg && broadcastIncludeTelegramJob(audienceFilter, prefs, true)) {
        const chatId = /^\d+$/.test(tg) ? Number(tg) : tg;
        const eventId = stableEventId(input.auditId, 'telegram', client.userId, 'tg');
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: 'telegram',
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            attachMenu,
            intent: buildMessageSendIntent({
              eventId,
              channel: 'telegram',
              clientUserId: client.userId,
              recipient: { chatId },
              text: messengerText,
              deliveryChannels: ['telegram'],
              parseMode: 'HTML',
              imageUrl: input.imageUrl ?? undefined,
              unsubscribeUrl,
              unsubscribeTopicTitle: input.unsubscribeTopicTitle,
            }),
          },
        });
      }
    }
    if (wantsMax) {
      if (mx && broadcastIncludeMaxJob(audienceFilter, prefs, true)) {
        const eventId = stableEventId(input.auditId, 'max', client.userId, 'max');
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: 'max',
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            attachMenu,
            intent: buildMessageSendIntent({
              eventId,
              channel: 'max',
              clientUserId: client.userId,
              recipient: { userId: mx },
              text: messengerText,
              deliveryChannels: ['max'],
              parseMode: 'HTML',
              unsubscribeUrl,
              unsubscribeTopicTitle: input.unsubscribeTopicTitle,
            }),
          },
        });
      }
    }

    if (wantsSms && client.phone) {
      const normalized = normalizePhone(client.phone.trim());
      if (broadcastIncludeSmsJob(audienceFilter, prefs, isValidPhoneE164(normalized))) {
        const eventId = stableEventId(input.auditId, 'sms', client.userId, 'sms');
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: 'sms',
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            attachMenu,
            intent: buildMessageSendIntent({
              eventId,
              channel: 'sms',
              clientUserId: client.userId,
              recipient: { phoneNormalized: normalized },
              text: smsText,
              deliveryChannels: ['smsc'],
            }),
          },
        });
      }
    }

    const email = input.verifiedEmailByUserId?.get(client.userId)?.trim();
    if (wantsEmail && email && unsubscribeUrl && input.unsubscribeTopicTitle) {
      const eventId = stableEventId(input.auditId, 'email', client.userId, 'email');
      const emailBody = `${broadcastTextToPlain(input.messageTitle)}\n\n${broadcastTextToPlain(input.messageBodyPlain)}\n\nОтписаться от «${input.unsubscribeTopicTitle}»: ${unsubscribeUrl}`;
      const imageCid = input.imageUrl && input.imageMimeType ? 'broadcast-image' : null;
      jobs.push({
        eventId,
        kind: DOCTOR_BROADCAST_QUEUE_KIND,
        channel: 'email',
        maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
        payloadJson: {
          broadcastAuditId: input.auditId,
          clientUserId: client.userId,
          attachMenu: false,
          intent: buildEmailMessageSendIntent({
            eventId,
            clientUserId: client.userId,
            email,
            title: input.messageTitle.trim(),
            body: emailBody,
            html: buildBroadcastEmailHtml({
              title: input.messageTitle,
              body: broadcastTextToPlain(input.messageBodyPlain),
              mediaCid: imageCid,
              unsubscribeUrl,
              unsubscribeTopicTitle: input.unsubscribeTopicTitle,
            }),
            ...(imageCid && input.imageUrl && input.imageMimeType
              ? {
                  inlineImage: {
                    url: input.imageUrl,
                    mimeType: input.imageMimeType,
                    filename: 'broadcast-image.webp',
                    cid: imageCid,
                  },
                }
              : {}),
          }),
        },
      });
    }
  }

  if (jobs.length > MAX_BROADCAST_DELIVERY_JOBS) {
    throw new Error(BROADCAST_DELIVERY_CAP_EXCEEDED_CODE);
  }

  return jobs;
}
