import type {
  DbWritePort,
  DispatchPort,
  EventGateway,
  GatewayResult,
  IdempotencyPort,
  IncomingEvent,
  Orchestrator,
} from '../contracts/index.js';
import { incomingEventSchema } from '../contracts/index.js';
import { buildDedupKey } from './dedup.js';
import { checkGatewayRateLimit } from './rateLimit.js';

type DebugEventStatus = 'processed' | 'duplicate' | 'failed';

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable payload]';
  }
}

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function buildDebugMessage(input: {
  status: DebugEventStatus;
  event: IncomingEvent;
  dedupKey: string;
  writesApplied?: number;
  outgoingDispatched?: number;
  error?: string;
  writes?: unknown[];
  outgoing?: unknown[];
}): string {
  const correlationId = input.event.meta.correlationId ?? '-';
  const payload = truncateText(safeJson(input.event.payload), 1800);
  const writesPreview = truncateText(safeJson(input.writes ?? []), 1000);
  const outgoingPreview = truncateText(safeJson(input.outgoing ?? []), 1500);
  const details = [
    'DEBUG EVENT',
    `status: ${input.status}`,
    `source: ${input.event.meta.source}`,
    `type: ${input.event.type}`,
    `eventId: ${input.event.meta.eventId}`,
    `correlationId: ${correlationId}`,
    `dedupKey: ${input.dedupKey}`,
    `writesApplied: ${input.writesApplied ?? 0}`,
    `outgoingDispatched: ${input.outgoingDispatched ?? 0}`,
    `writesPlanned: ${(input.writes ?? []).length}`,
    `outgoingPlanned: ${(input.outgoing ?? []).length}`,
    ...(input.error ? [`error: ${input.error}`] : []),
    'writes:',
    writesPreview,
    'outgoing:',
    outgoingPreview,
    'payload:',
    payload,
  ];
  return truncateText(details.join('\n'), 3500);
}

function readTelegramIncomingChatId(event: IncomingEvent): number | null {
  if (event.meta.source !== 'telegram') return null;
  const payload = event.payload as { incoming?: unknown };
  const incoming = payload.incoming as { chatId?: unknown } | undefined;
  return typeof incoming?.chatId === 'number' ? incoming.chatId : null;
}

/**
 * Зависимости eventGateway.
 * Gateway не содержит бизнес-логики: только envelope-проверки, dedup и запуск orchestrator.
 */
type EventGatewayDeps = {
  orchestrator: Orchestrator;
  writePort?: DbWritePort;
  dispatchPort?: DispatchPort;
  idempotencyPort?: IdempotencyPort;
  dedupTtlSec?: number;
  debugAdminChatId?: number;
  debugForwardAllEvents?: boolean;
};

/**
 * Создает единую входную точку обработки нормализованных событий.
 * Поток: validate -> rateLimit -> dedup -> orchestrate -> apply writes -> dispatch outgoing.
 */
export function createEventGateway(deps: EventGatewayDeps): EventGateway {
  const {
    orchestrator,
    writePort,
    dispatchPort,
    idempotencyPort,
    dedupTtlSec = 900,
    debugAdminChatId,
    debugForwardAllEvents = false,
  } = deps;

  const sendDebugEventToAdmin = async (input: {
    status: DebugEventStatus;
    event: IncomingEvent;
    dedupKey: string;
    writesApplied?: number;
    outgoingDispatched?: number;
    error?: string;
    writes?: unknown[];
    outgoing?: unknown[];
  }): Promise<void> => {
    if (!debugForwardAllEvents) return;
    if (!dispatchPort) return;
    if (typeof debugAdminChatId !== 'number' || !Number.isFinite(debugAdminChatId)) return;
    const incomingChatId = readTelegramIncomingChatId(input.event);
    if (incomingChatId === debugAdminChatId) return;

    const text = buildDebugMessage(input);
    try {
      await dispatchPort.dispatchOutgoing({
        type: 'message.send',
        meta: {
          eventId: `${input.event.meta.eventId}:debug:admin`,
          occurredAt: new Date().toISOString(),
          source: 'eventGateway',
          ...(input.event.meta.correlationId ? { correlationId: input.event.meta.correlationId } : {}),
        },
        payload: {
          recipient: { chatId: debugAdminChatId },
          message: { text },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      });
    } catch {
      // Debug forwarding must never break main event processing.
    }
  };

  return {
    /** Принимает event-конверт, выполняет dedup и запускает оркестрацию. */
    async handleIncomingEvent(event: IncomingEvent): Promise<GatewayResult> {
      incomingEventSchema.parse(event);

      const rate = await checkGatewayRateLimit(event);
      if (!rate.allowed) {
        const dedupKey = `${event.meta.source}:${event.type}:rate_limited`;
        await sendDebugEventToAdmin({
          status: 'failed',
          event,
          dedupKey,
          error: rate.reason ?? 'RATE_LIMITED',
        });
        return {
          status: 'failed',
          dedupKey,
          error: rate.reason ?? 'RATE_LIMITED',
        };
      }

      const dedupKey = buildDedupKey(event);
      if (idempotencyPort) {
        const acquired = await idempotencyPort.tryAcquire(dedupKey, dedupTtlSec);
        if (!acquired) {
          await sendDebugEventToAdmin({ status: 'duplicate', event, dedupKey });
          return { status: 'duplicate', dedupKey };
        }
      }

      try {
        const result = await orchestrator.orchestrate(event);

        let writesApplied = 0;
        if (writePort) {
          for (const mutation of result.writes) {
            await writePort.writeDb(mutation);
            writesApplied += 1;
          }
        }

        let outgoingDispatched = 0;
        if (dispatchPort) {
          for (const intent of result.outgoing) {
            await dispatchPort.dispatchOutgoing(intent);
            outgoingDispatched += 1;
          }
        }

        await sendDebugEventToAdmin({
          status: 'processed',
          event,
          dedupKey,
          writesApplied,
          outgoingDispatched,
          writes: result.writes,
          outgoing: result.outgoing,
        });
        return { status: 'processed', dedupKey, writesApplied, outgoingDispatched };
      } catch (err) {
        await sendDebugEventToAdmin({
          status: 'failed',
          event,
          dedupKey,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
