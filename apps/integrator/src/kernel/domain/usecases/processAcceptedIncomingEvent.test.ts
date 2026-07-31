/**
 * УРОВЕНЬ 2, пункт 10 (D20_INTEGRATOR_MAP.md, «Домен: вход, исполнение плана»,
 * `usecases/processAcceptedIncomingEvent.ts`) — карта дословно: «Исполняет план и рассылает
 * intents best-effort: падение одного intent НЕ блокирует следующие, только `logger.warn`».
 * Развилка №1 карты: «политика "упало — только в лог" — это и есть тихая потеря сообщения».
 *
 * Что здесь ДОКАЗАНО (зелёные тесты): падение единственного ответа человеку остаётся
 * наблюдаемым структурированным `logger.warn` с полным диагностическим контекстом
 * (intentIndex/intentType/eventId/correlationId, затем сводка по всему событию), и это не мешает
 * остальным intents (best-effort по цепочке).
 *
 * ОБНОВЛЕНО D35 (docs/_TODO/runs/integrator-cleanup/D35_DELIVERY_FAILURE_POLICY_BRIEF.md):
 * «развилка №1» карты закрыта — падение больше не остаётся ТОЛЬКО строкой в логе. Провал
 * НЕ-ack intent (`message.send`/`message.edit`/…) теперь дополнительно ставится в
 * `outgoing_delivery_queue` (вид `inbound_reply`, короткая лестница), откуда воркер либо доставит
 * повторно, либо — на исчерпании — заведёт видимый инцидент оператора. Это доказывают тесты в
 * `processAcceptedIncomingEvent.d35.test.ts`, а не здесь: файл ниже фиксирует только сам факт и
 * форму `logger.warn`, которая была и остаётся единственным способом узнать о провале, когда `db`
 * в зависимостях не передан (обратная совместимость).
 *
 * У каждого `it` — свой арбитр, прогнан руками; вывод — в отчёте.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn() }));

vi.mock('../../../infra/observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { ...(actual.logger as object), warn: loggerWarn } };
});

import type {
  Action,
  ActionResult,
  DbReadPort,
  DomainContext,
  IncomingEvent,
  Orchestrator,
  OutgoingIntent,
  Step,
} from '../../contracts/index.js';
import { processAcceptedIncomingEvent } from './processAcceptedIncomingEvent.js';

function event(eventId: string, correlationId?: string): IncomingEvent {
  return {
    type: 'message.received',
    meta: {
      eventId,
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: 'telegram',
      ...(correlationId ? { correlationId } : {}),
    },
    payload: {},
  };
}

const readPort: DbReadPort = { readDb: async () => null as never };

/** Один шаг плана на каждый заготовленный intent — реальный executeAction не участвует. */
function orchestratorFor(steps: Step[]): Orchestrator {
  return { buildPlan: async () => steps };
}

function step(id: string): Step {
  return { id, kind: 'noop', mode: 'sync', payload: {} };
}

function intent(type: OutgoingIntent['type'], eventId: string, correlationId?: string): OutgoingIntent {
  return {
    type,
    meta: {
      eventId,
      occurredAt: '2026-07-31T10:00:00.000Z',
      source: 'telegram',
      ...(correlationId ? { correlationId } : {}),
    },
    payload: {},
  };
}

/** executeAction для теста: по id шага отдаёт заранее заготовленный intent, без реального executor. */
function executeActionReturning(byStepId: Record<string, OutgoingIntent>) {
  return async (action: Action, _context: DomainContext): Promise<ActionResult> => ({
    actionId: action.id,
    status: 'success',
    intents: [byStepId[action.id]!],
  });
}

describe('processAcceptedIncomingEvent — доставка intents best-effort по цепочке', () => {
  beforeEach(() => {
    loggerWarn.mockClear();
  });

  it('дано: единственный intent (ответ пациенту) упал → когда обработка → тогда это наблюдаемо ЕДИНСТВЕННЫМ способом: структурированный logger.warn с полным диагностическим контекстом', async () => {
    // АРБИТР: в цикле дозвона убрать поля `eventId`/`correlationId` из первого logger.warn (или
    // сам вызов) — предмет проверки здесь не «вызвана ли функция», а КОНКРЕТНЫЙ диагностический
    // контекст, без которого инцидент не разобрать (правило, п.7 — законное исключение: предмет
    // проверки САМ ФАКТ обращения к границе наблюдаемости с нужными аргументами).
    const failingIntent = intent('message.send', 'evt-1', 'corr-1');
    const dispatched: OutgoingIntent[] = [];
    const dispatchIntent = async (i: OutgoingIntent) => {
      dispatched.push(i);
      throw new Error('provider unreachable');
    };

    await expect(
      processAcceptedIncomingEvent(event('evt-1', 'corr-1'), {
        readPort,
        executeAction: executeActionReturning({ s1: failingIntent }),
        dispatchIntent,
        orchestrator: orchestratorFor([step('s1')]),
      }),
    ).resolves.toBeUndefined();

    expect(dispatched).toEqual([failingIntent]);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: 'provider unreachable' }),
        intentIndex: 0,
        intentType: 'message.send',
        eventId: 'evt-1',
        correlationId: 'corr-1',
      }),
      'processAcceptedIncomingEvent: intent dispatch failed (continuing)',
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchFailureCount: 1,
        intentTotal: 1,
        failedIntentIndices: [0],
        failedIntentTypes: ['message.send'],
        eventId: 'evt-1',
        correlationId: 'corr-1',
        source: 'telegram',
      }),
      'processAcceptedIncomingEvent: intent dispatch finished with one or more failures',
    );
  });

  it('дано: первый intent (message.edit) упал, второй (callback.answer) — нет → когда обработка → тогда ВТОРОЙ всё равно выполнен', async () => {
    // Ровно комментарий в шапке модуля: без best-effort человек навсегда виснет в «loading» —
    // provider никогда не получает ack, если первая ошибка обрывает цепочку.
    // АРБИТР: убрать `try { await deps.dispatchIntent(intent) } catch { ... }` (без защиты) —
    // исключение первого intent прервёт цикл, dispatched.length останется 1, и сам вызов
    // processAcceptedIncomingEvent неожиданно зареджектится — тест покраснеет на обоих утверждениях.
    const editIntent = intent('message.edit', 'evt-2');
    const ackIntent = intent('callback.answer', 'evt-2');
    const dispatched: OutgoingIntent['type'][] = [];
    const dispatchIntent = async (i: OutgoingIntent) => {
      dispatched.push(i.type);
      if (i.type === 'message.edit') throw new Error('edit failed: message too old');
    };

    await processAcceptedIncomingEvent(event('evt-2'), {
      readPort,
      executeAction: executeActionReturning({ s1: editIntent, s2: ackIntent }),
      dispatchIntent,
      orchestrator: orchestratorFor([step('s1'), step('s2')]),
    });

    expect(dispatched).toEqual(['message.edit', 'callback.answer']);
  });

  it('дано: все intents прошли успешно → когда обработка → тогда предупреждающий сводный лог НЕ пишется', async () => {
    // Контраст к первому тесту: сводный warn обязан быть УСЛОВНЫМ, а не выводиться всегда.
    // АРБИТР: убрать условие `if (dispatchFailureCount > 0)` вокруг сводного logger.warn —
    // он начнёт вызываться и на успешном пути, тест покраснеет.
    const okIntent = intent('callback.answer', 'evt-3');
    const dispatchIntent = async () => {};

    await processAcceptedIncomingEvent(event('evt-3'), {
      readPort,
      executeAction: executeActionReturning({ s1: okIntent }),
      dispatchIntent,
      orchestrator: orchestratorFor([step('s1')]),
    });

    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('дано: исполнение действия (executeAction, а не dispatchIntent) бросает исключение → когда обработка → тогда processAcceptedIncomingEvent реджектится (сегодняшнее фактическое поведение — best-effort покрывает только dispatchIntent, не сам executeAction)', async () => {
    // Все три предыдущих теста роняют только dispatchIntent (отправку УЖЕ построенного intent).
    // Бросок из handleIncomingEvent (через executeAction) идёт другим путём: он не оборачивается
    // в try/catch нигде между handleIncomingEvent и processAcceptedIncomingEvent, поэтому
    // событие сегодня реджектится целиком, а не глушится best-effort циклом.
    // АРБИТР: обернуть `await handleIncomingEvent(...)` в processAcceptedIncomingEvent в try/catch,
    // который на ошибке возвращает пустой результат (`{ intents: [] }`) вместо проброса — промис
    // начнёт резолвиться вместо реджекта, тест покраснеет на `.rejects`.
    const executeAction = async (): Promise<ActionResult> => {
      throw new Error('executor blew up');
    };

    await expect(
      processAcceptedIncomingEvent(event('evt-4'), {
        readPort,
        executeAction,
        dispatchIntent: async () => {},
        orchestrator: orchestratorFor([step('s1')]),
      }),
    ).rejects.toThrow('executor blew up');
  });
});
