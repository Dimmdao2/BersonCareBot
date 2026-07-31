/**
 * D35 (docs/_TODO/runs/integrator-cleanup/D35_DELIVERY_FAILURE_POLICY_BRIEF.md), п.3-5: провал
 * отправки ответа человеку больше не остаётся ТОЛЬКО строкой в логе (тот пробел закрывает
 * `processAcceptedIncomingEvent.test.ts`, «дано: единственный intent … упал» — см. обновлённый
 * комментарий там). Здесь доказывается ИМЕННО добавленное поведение:
 *
 *   - провал НЕ-ack intent (`message.send`/`message.edit`/…) на мессенджер-канале ставится в
 *     `outgoing_delivery_queue` видом `inbound_reply` (короткая лестница — см.
 *     deliveryContract.d35.test.ts) — дальше судьбу строки решает воркер;
 *   - провал `callback.answer` (подтверждение нажатия) НЕ ставится в очередь вовсе — дедлайн
 *     истёк в момент отказа (бриф, п.4);
 *   - без `db` в зависимостях (старые вызовы/тесты) поведение не меняется — постановка в очередь
 *     тихо пропускается, log остаётся единственным способом узнать о провале, как раньше.
 *
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../infra/observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { ...(actual.logger as object), warn: vi.fn(), error: vi.fn() },
  };
});

const enqueueMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../../infra/db/repos/outgoingDeliveryQueue.js', () => ({
  enqueueOutgoingDeliveryIfAbsent: enqueueMock,
}));

import type {
  Action,
  ActionResult,
  DbPort,
  DbReadPort,
  DomainContext,
  IncomingEvent,
  Orchestrator,
  OutgoingIntent,
  Step,
} from '../../contracts/index.js';
import { processAcceptedIncomingEvent } from './processAcceptedIncomingEvent.js';

const readPort: DbReadPort = { readDb: async () => null as never };
const fakeDb: DbPort = {
  query: async () => ({ rows: [] }),
  tx: async (fn) => fn(fakeDb),
};

function event(eventId: string): IncomingEvent {
  return {
    type: 'message.received',
    meta: { eventId, occurredAt: '2026-07-31T10:00:00.000Z', source: 'telegram' },
    payload: {},
  };
}

function orchestratorFor(steps: Step[]): Orchestrator {
  return { buildPlan: async () => steps };
}

function step(id: string): Step {
  return { id, kind: 'noop', mode: 'sync', payload: {} };
}

function intent(type: OutgoingIntent['type'], eventId: string): OutgoingIntent {
  return {
    type,
    meta: { eventId, occurredAt: '2026-07-31T10:00:00.000Z', source: 'telegram' },
    payload: {},
  };
}

function executeActionReturning(byStepId: Record<string, OutgoingIntent>) {
  return async (action: Action, _context: DomainContext): Promise<ActionResult> => ({
    actionId: action.id,
    status: 'success',
    intents: [byStepId[action.id]!],
  });
}

const alwaysFailingDispatch = async () => {
  throw new Error('provider unreachable');
};

describe('processAcceptedIncomingEvent — D35: провал ответа ставится в очередь, провал ack — нет', () => {
  it('дано: провалился message.send (служебный ответ человеку) и db передан → когда обработка → тогда enqueueOutgoingDeliveryIfAbsent вызван с kind=inbound_reply и коротким maxAttempts', async () => {
    // АРБИТР: обернуть вызов enqueueFailedReplyForRetry() условием `intent.type === '__never__'`
    // (эффективно отключить постановку в очередь для message.send) — enqueueMock перестанет
    // вызываться, тест покраснеет.
    enqueueMock.mockClear();
    const failing = intent('message.send', 'evt-d35-1');

    await processAcceptedIncomingEvent(event('evt-d35-1'), {
      readPort,
      db: fakeDb,
      executeAction: executeActionReturning({ s1: failing }),
      dispatchIntent: alwaysFailingDispatch,
      orchestrator: orchestratorFor([step('s1')]),
    });

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        eventId: 'evt-d35-1:queued:0',
        kind: 'inbound_reply',
        channel: 'telegram',
        maxAttempts: 4,
      }),
    );
  });

  it('дано: провалился callback.answer (подтверждение нажатия) → когда обработка → тогда enqueueOutgoingDeliveryIfAbsent НЕ вызывается вовсе', async () => {
    // Ровно бриф п.4: дедлайн истёк в момент отказа, ставить в очередь нечего.
    // АРБИТР: убрать `!ACK_INTENT_TYPES.has(intent.type)` из условия постановки в очередь —
    // callback.answer начнёт ставиться в очередь, enqueueMock окажется вызван, тест покраснеет.
    enqueueMock.mockClear();
    const failingAck = intent('callback.answer', 'evt-d35-2');

    await processAcceptedIncomingEvent(event('evt-d35-2'), {
      readPort,
      db: fakeDb,
      executeAction: executeActionReturning({ s1: failingAck }),
      dispatchIntent: alwaysFailingDispatch,
      orchestrator: orchestratorFor([step('s1')]),
    });

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('дано: провалился message.send, но db в зависимостях НЕ передан → когда обработка → тогда enqueueOutgoingDeliveryIfAbsent не вызывается и обработка не падает (обратная совместимость)', async () => {
    // Без db постановка в очередь тихо пропускается — как раньше D35 (только log). Это защищает
    // существующие вызовы/тесты, которые ещё не научены передавать db.
    enqueueMock.mockClear();
    const failing = intent('message.send', 'evt-d35-3');

    await expect(
      processAcceptedIncomingEvent(event('evt-d35-3'), {
        readPort,
        executeAction: executeActionReturning({ s1: failing }),
        dispatchIntent: alwaysFailingDispatch,
        orchestrator: orchestratorFor([step('s1')]),
      }),
    ).resolves.toBeUndefined();

    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
