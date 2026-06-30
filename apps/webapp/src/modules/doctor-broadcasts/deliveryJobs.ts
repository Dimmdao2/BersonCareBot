import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import { escapeHtml } from "@/shared/lib/escapeHtml";
import type { BroadcastChannel } from "./broadcastChannels";
import type { BroadcastAudienceFilter, BroadcastNotificationPrefsFlags, DoctorBroadcastQueueJob } from "./ports";
import {
  broadcastIncludeMaxJob,
  broadcastIncludeSmsJob,
  broadcastIncludeTelegramJob,
  resolveBroadcastNotificationPrefsFromBatch,
} from "./broadcastEligible";
import {
  BROADCAST_DELIVERY_CAP_EXCEEDED_CODE,
  DOCTOR_BROADCAST_QUEUE_KIND,
  DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
  MAX_BROADCAST_DELIVERY_JOBS,
} from "./deliveryQueueKind";

const MESSAGE_TEXT_MAX = 3500;

export function buildBroadcastMessageText(title: string, body: string): string {
  const raw = `${title.trim()}\n\n${body.trim()}`;
  if (raw.length <= MESSAGE_TEXT_MAX) return raw;
  return `${raw.slice(0, MESSAGE_TEXT_MAX - 1)}…`;
}

/** Split combined plain text (`title\\n\\nbody`, possibly truncated) for messenger HTML. */
export function splitBroadcastPlainCombined(combined: string): { title: string; body: string } {
  const sep = "\n\n";
  const idx = combined.indexOf(sep);
  if (idx < 0) return { title: combined.trim(), body: "" };
  return {
    title: combined.slice(0, idx).trim(),
    body: combined.slice(idx + sep.length),
  };
}

/**
 * Convert simple Markdown to Telegram HTML parse_mode text.
 * Supported: **bold**, _italic_, ~~strikethrough~~, `code`, - / * bullet lists.
 * Text is HTML-escaped first; formatting tags are injected after escaping
 * so user content can never inject raw HTML.
 */
export function markdownToTelegramHtml(md: string): string {
  // HTML-escape the raw text so user-supplied < > & are safe.
  let t = escapeHtml(md.trim());

  // Bold: **text** (no newlines inside)
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");

  // Italic: _text_ (no underscores or newlines inside; not inside a word like snake_case)
  t = t.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  t = t.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");

  // Inline code: `code` (no newlines inside)
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Unordered list: "- item" or "* item" at start of line → "• item"
  t = t.replace(/^[*-] (.+)$/gm, "• $1");

  return t;
}

/**
 * Strip simple Markdown to clean plain text for channels that have no markup
 * (SMS, in-app chat copy, email): removes bold/italic/strike/code markers, keeps
 * the text, bulletises "- item" / "* item" into "• item", preserves line breaks.
 * Mirrors the patterns of markdownToTelegramHtml so the renditions stay in sync.
 */
export function stripMarkdownToPlain(md: string): string {
  let t = md;
  // Bullet list first (uses *) before bold strips **: "- item" / "* item" → "• item"
  t = t.replace(/^[*-] (.+)$/gm, "• $1");
  // Bold **text** → text
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  // Italic _text_ → text (not snake_case)
  t = t.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, "$1");
  // Strikethrough ~~text~~ → text
  t = t.replace(/~~([^~\n]+)~~/g, "$1");
  // Inline code `code` → code
  t = t.replace(/`([^`\n]+)`/g, "$1");
  return t;
}

/** Telegram/MAX HTML: bold title, Markdown body converted to Telegram HTML. */
export function buildBroadcastMessengerHtml(title: string, body: string): string {
  const t = title.trim();
  const b = markdownToTelegramHtml(body);
  const head = t ? `<b>${escapeHtml(t)}</b>` : "";
  if (!b) return head || "";
  return head ? `${head}\n\n${b}` : b;
}

function stableEventId(auditId: string, channel: string, clientUserId: string, suffix: string): string {
  const base = `broadcast:${auditId}:${channel}:${clientUserId}:${suffix}`;
  return base.length > 240 ? base.slice(0, 240) : base;
}

function buildMessageSendIntent(input: {
  eventId: string;
  channel: "telegram" | "max" | "sms";
  clientUserId: string;
  recipient: Record<string, unknown>;
  text: string;
  deliveryChannels: string[];
  parseMode?: "HTML";
  imageUrl?: string;
}): Record<string, unknown> {
  const occurredAt = new Date().toISOString();
  const source = input.channel === "sms" ? "sms" : input.channel;
  return {
    type: "message.send",
    meta: {
      eventId: input.eventId.slice(0, 200),
      occurredAt,
      source,
      userId: input.clientUserId,
      correlationId: `doctor-broadcast:${input.eventId.slice(0, 80)}`,
    },
    payload: {
      recipient: input.recipient,
      message: { text: input.text },
      delivery: { channels: input.deliveryChannels, maxAttempts: 1 },
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
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
  /** URL картинки рассылки — пробрасывается ТОЛЬКО в telegram-intent (sendPhoto). */
  imageUrl?: string | null;
};

/**
 * Плоский список заданий очереди по **eligible**-клиентам (совпадает с превью) и выбранным каналам.
 * Правило prefs / изоляции совпадает с filterEligibleBroadcastClients для превью.
 */
export function buildDoctorBroadcastDeliveryJobs(input: DoctorBroadcastDeliveryJobsParams): DoctorBroadcastQueueJob[] {
  const audienceFilter = input.audienceFilter ?? "all";
  const prefsMap = input.notificationPrefsByUserId ?? new Map<string, BroadcastNotificationPrefsFlags>();

  // Legacy bot_message → telegram + max (обратная совместимость).
  const legacyBotMessage = input.channels.includes("bot_message");
  const wantsTelegram = input.channels.includes("telegram") || legacyBotMessage;
  const wantsMax = input.channels.includes("max") || legacyBotMessage;
  const wantsSms = input.channels.includes("sms");
  const jobs: DoctorBroadcastQueueJob[] = [];
  const attachMenu = input.attachMenu === true;
  const plainCombined = buildBroadcastMessageText(input.messageTitle, input.messageBodyPlain);
  const { title: truncatedTitle, body: truncatedBody } = splitBroadcastPlainCombined(plainCombined);
  const messengerText = buildBroadcastMessengerHtml(truncatedTitle, truncatedBody);
  // SMS has no markup → strip markdown markers (keep bullets/line breaks).
  const smsText = stripMarkdownToPlain(plainCombined);

  for (const client of input.eligibleClients) {
    const prefs = resolveBroadcastNotificationPrefsFromBatch(prefsMap, client.userId);
    const tg = client.bindings.telegramId?.trim();
    const mx = client.bindings.maxId?.trim();

    if (wantsTelegram) {
      if (tg && broadcastIncludeTelegramJob(audienceFilter, prefs, true)) {
        const chatId = /^\d+$/.test(tg) ? Number(tg) : tg;
        const eventId = stableEventId(input.auditId, "telegram", client.userId, "tg");
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: "telegram",
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            attachMenu,
            intent: buildMessageSendIntent({
              eventId,
              channel: "telegram",
              clientUserId: client.userId,
              recipient: { chatId },
              text: messengerText,
              deliveryChannels: ["telegram"],
              parseMode: "HTML",
              imageUrl: input.imageUrl ?? undefined,
            }),
          },
        });
      }
    }
    if (wantsMax) {
      if (mx && broadcastIncludeMaxJob(audienceFilter, prefs, true)) {
        const eventId = stableEventId(input.auditId, "max", client.userId, "max");
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: "max",
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            attachMenu,
            intent: buildMessageSendIntent({
              eventId,
              channel: "max",
              clientUserId: client.userId,
              recipient: { userId: mx },
              text: messengerText,
              deliveryChannels: ["max"],
              parseMode: "HTML",
            }),
          },
        });
      }
    }

    if (wantsSms && client.phone) {
      const normalized = normalizePhone(client.phone.trim());
      if (broadcastIncludeSmsJob(audienceFilter, prefs, isValidPhoneE164(normalized))) {
        const eventId = stableEventId(input.auditId, "sms", client.userId, "sms");
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: "sms",
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            attachMenu,
            intent: buildMessageSendIntent({
              eventId,
              channel: "sms",
              clientUserId: client.userId,
              recipient: { phoneNormalized: normalized },
              text: smsText,
              deliveryChannels: ["smsc"],
            }),
          },
        });
      }
    }
  }

  if (jobs.length > MAX_BROADCAST_DELIVERY_JOBS) {
    throw new Error(BROADCAST_DELIVERY_CAP_EXCEEDED_CODE);
  }

  return jobs;
}
