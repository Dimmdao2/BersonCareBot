/**
 * ONE application action for «входящие в брендированный бот — прямая пересылка».
 *
 * Owner 20.08, дословно: «сообщения от клиентов (чисто в бота - просто прямая пересылка, а не как
 * сейчас сохранять в базу…)» + «надо будет добавить настройки - делать ли пересылку сообщений в
 * боте админу или игнорировать их - и указывать в настройках ид чата кому пересылать. Это …
 * настройки клиники с доступным брендированием».
 *
 * Shape of the rule, identical for both platforms (owner 20.08: «И бота - это не телеграм, а и
 * макс тоже… по апи одинаково с обоими платформами»; ⛔ «ветка „а для MAX сделаем иначе“ на
 * прикладной стороне запрещена»):
 *
 *  1. DEDICATED clinic bot only. The platform/common webhook never forwards anything — it has no
 *     clinic destination and the common Therapysto bot is not a clinic support channel (§30.1:
 *     «двусторонняя поддержка через Telegram/MAX работают только через собственного бота»).
 *  2. Free-form text only: a `/start`, a menu action, a shared contact or a callback is product
 *     traffic the pipeline already owns, not a message to the clinic.
 *  3. Default is IGNORE. Forwarding happens only when the clinic explicitly enabled it AND named
 *     an exact destination chat id.
 *  4. NOTHING about the body is written to the database. Only technical dedup/delivery-attempt
 *     facts are stored. A failed delivery stays retryable; it is never converted into success and
 *     never copied into a queue row that would persist the text.
 *
 * The platform difference lives ONLY in `recipientForChannel` (Telegram addresses a chat id, MAX
 * addresses a user id) — supplied by the adapter, never by a product-side branch.
 */
import type {
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import type { ClinicBotInboundForwarding } from '../../infra/db/clinicBotPublicConfig.js';
import { logger } from '../../infra/observability/logger.js';

export type DedicatedBotChannel = 'telegram' | 'max';

/** 24h: same window the relay routes use for inbound dedup. */
const FORWARD_DEDUP_TTL_SEC = 24 * 60 * 60;

export type DedicatedBotInboundForwardDeps = {
  dispatchPort: DispatchPort;
  /** Same per-org clinic settings read the credential resolver uses; org principal already active. */
  resolveInboundForwarding: (
    channel: DedicatedBotChannel,
  ) => Promise<ClinicBotInboundForwarding | null>;
  /** Existing event dedup. Absent only in tests that already dedup upstream. */
  idempotencyPort?: IdempotencyPort;
};

/** Adapter-owned addressing: the only place the two platforms differ. */
function recipientForChannel(
  channel: DedicatedBotChannel,
  destinationChatId: string,
): Record<string, unknown> {
  const numeric = Number(destinationChatId);
  if (!Number.isSafeInteger(numeric) || (channel === 'max' && numeric <= 0)) {
    throw new Error('DEDICATED_BOT_FORWARD_DESTINATION_INVALID');
  }
  return channel === 'telegram' ? { chatId: numeric } : { userId: numeric };
}

/** True only for a plain free-form text message a person typed into the clinic's bot. */
function isForwardableInbound(incoming: IncomingUpdate): incoming is Extract<
  IncomingUpdate,
  { kind: 'message' }
> {
  if (incoming.kind !== 'message') return false;
  const text = (incoming.text ?? '').replace(/^\uFEFF+/, '').trim();
  if (!text || text.startsWith('/')) return false;
  if (incoming.action) return false;
  if (incoming.linkSecret) return false;
  if (incoming.phone || incoming.contactPhone) return false;
  return true;
}

function forwardDedupKey(
  channel: DedicatedBotChannel,
  organizationId: string,
  incoming: Extract<IncomingUpdate, { kind: 'message' }>,
  eventId: string,
): string {
  const messageRef =
    incoming.messageId !== undefined && String(incoming.messageId).trim()
      ? String(incoming.messageId).trim()
      : eventId;
  return `dedicated-bot-forward:${channel}:${organizationId}:${incoming.channelId}:${messageRef}`;
}

/**
 * Forwards one inbound message from a clinic's dedicated bot to the chat the clinic named.
 * A provider/configuration failure rejects so the webhook returns a retryable non-2xx response.
 */
export async function forwardDedicatedBotInbound(
  input: {
    channel: DedicatedBotChannel;
    organizationId: string;
    incoming: IncomingUpdate;
    eventId: string;
    correlationId: string;
  },
  deps: DedicatedBotInboundForwardDeps,
): Promise<'forwarded' | 'ignored' | 'duplicate'> {
  if (!isForwardableInbound(input.incoming)) return 'ignored';
  const incoming = input.incoming;

  const forwarding = await deps.resolveInboundForwarding(input.channel);
  if (!forwarding) return 'ignored';

  const dedupKey = deps.idempotencyPort
    ? forwardDedupKey(input.channel, input.organizationId, incoming, input.eventId)
    : null;
  if (dedupKey && deps.idempotencyPort) {
    const acquired = await deps.idempotencyPort.tryAcquire(dedupKey, FORWARD_DEDUP_TTL_SEC);
    if (!acquired) return 'duplicate';
  }

  // The clinic's own bot is the sender by construction: `clinic_required` never falls back to the
  // platform sender, so an unconfigured/broken clinic channel drops the forward instead of
  // relaying a patient's private message through the platform bot.
  const intent: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `${input.eventId}:clinic-inbound-forward`,
      occurredAt: new Date().toISOString(),
      source: input.channel,
      correlationId: input.correlationId,
      outboundMessageClass: 'broadcast_event',
      outboundCapability: 'clinic_delivery',
    },
    payload: {
      recipient: recipientForChannel(input.channel, forwarding.destinationChatId),
      message: { text: incoming.text },
      delivery: {
        channels: [input.channel],
        maxAttempts: 1,
        senderScope: 'clinic_required',
      },
    },
  };

  try {
    await deps.dispatchPort.dispatchOutgoing(intent);
    return 'forwarded';
  } catch (err) {
    if (dedupKey && deps.idempotencyPort?.release) {
      try {
        await deps.idempotencyPort.release(dedupKey);
      } catch (releaseError) {
        logger.error(
          { releaseError, channel: input.channel, organizationId: input.organizationId, eventId: input.eventId },
          'dedicated bot inbound forward dedup release failed',
        );
      }
    }
    // Log technical identifiers only: no body and no chat text.
    logger.warn(
      {
        err,
        channel: input.channel,
        organizationId: input.organizationId,
        eventId: input.eventId,
      },
      'dedicated bot inbound forward failed',
    );
    throw err;
  }
}
