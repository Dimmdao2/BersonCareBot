import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import type { BroadcastChannel } from "./broadcastChannels";
import type { DoctorBroadcastQueueJob } from "./ports";
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
    },
  };
}

/**
 * Плоский список заданий очереди по эффективным клиентам и каналам (как guard превью / dev_mode на webapp).
 */
export function buildDoctorBroadcastDeliveryJobs(input: {
  auditId: string;
  effectiveClients: readonly ClientListItem[];
  channels: readonly BroadcastChannel[];
  messageText: string;
}): DoctorBroadcastQueueJob[] {
  const wantsBot = input.channels.includes("bot_message");
  const wantsSms = input.channels.includes("sms");
  const jobs: DoctorBroadcastQueueJob[] = [];

  for (const client of input.effectiveClients) {
    if (wantsBot) {
      const tg = client.bindings.telegramId?.trim();
      if (tg) {
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
            intent: buildMessageSendIntent({
              eventId,
              channel: "telegram",
              clientUserId: client.userId,
              recipient: { chatId },
              text: input.messageText,
              deliveryChannels: ["telegram"],
            }),
          },
        });
      }
      const mx = client.bindings.maxId?.trim();
      if (mx) {
        const eventId = stableEventId(input.auditId, "max", client.userId, "max");
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: "max",
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            intent: buildMessageSendIntent({
              eventId,
              channel: "max",
              clientUserId: client.userId,
              recipient: { chatId: mx },
              text: input.messageText,
              deliveryChannels: ["max"],
            }),
          },
        });
      }
    }

    if (wantsSms && client.phone) {
      const normalized = normalizePhone(client.phone.trim());
      if (isValidPhoneE164(normalized)) {
        const eventId = stableEventId(input.auditId, "sms", client.userId, "sms");
        jobs.push({
          eventId,
          kind: DOCTOR_BROADCAST_QUEUE_KIND,
          channel: "sms",
          maxAttempts: DOCTOR_BROADCAST_DELIVERY_MAX_ATTEMPTS,
          payloadJson: {
            broadcastAuditId: input.auditId,
            clientUserId: client.userId,
            intent: buildMessageSendIntent({
              eventId,
              channel: "sms",
              clientUserId: client.userId,
              recipient: { phoneNormalized: normalized },
              text: input.messageText,
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
