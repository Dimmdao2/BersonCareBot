/**
 * Каденция критического инцидента на границе тика.
 *
 * Решение владельца 21.07: «сразу → повтор через 1 час → далее каждое утро в системном отчёте,
 * пока не починю». Разбор прода 19.08 утверждал обратное: за двое суток непрерывного телеграмного
 * `401` в журнале отправок ровно ОДНА критическая строка, дальше тишина — то есть плоский дедуп
 * съедал повтор навсегда.
 *
 * Здесь проверяется то, что живёт в этом файле: тик обязан вести КАЖДЫЙ критический топик через
 * жизненный цикл инцидента (открыть/тронуть → занять, если пора → отметить фазу), а не через
 * плоский суточный дедуп, и обязан молчать ровно тогда, когда фаза ещё не наступила.
 *
 * Хранилище здесь — двойник, который исполняет то же правило фаз, что и предикат в
 * `pgOperatorHealthWrite.claimIncidentAlertIfDue`. Сам предикат исполняется только настоящим
 * Postgres; из песочницы агента база недоступна, и это записано в план как незакрытая проверка.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Incident = {
  id: string;
  openedAt: number;
  initialSentAt: number | null;
  oneHourSentAt: number | null;
  resolvedAt: number | null;
};

const store = new Map<string, Incident>();
const dispatched: string[] = [];

const dispatchOperatorAlert = vi.fn(async (input: { dedupKey: string }) => {
  dispatched.push(input.dedupKey);
  return { dispatched: true };
});

const writePort = {
  openOrTouchCriticalAlertIncident: vi.fn(async (input: { dedupKey: string; nowIso: string }) => {
    const existing = store.get(input.dedupKey);
    if (existing && existing.resolvedAt === null) return { id: existing.id, openedAt: '' };
    const fresh: Incident = {
      id: `incident-${input.dedupKey}-${store.size}`,
      openedAt: Date.parse(input.nowIso),
      initialSentAt: null,
      oneHourSentAt: null,
      resolvedAt: null,
    };
    store.set(input.dedupKey, fresh);
    return { id: fresh.id, openedAt: input.nowIso };
  }),
  claimIncidentAlertIfDue: vi.fn(
    async (input: { incidentId: string; nowIso: string; claimToken: string }) => {
      const incident = [...store.values()].find((row) => row.id === input.incidentId);
      if (!incident || incident.resolvedAt !== null) return null;
      const now = Date.parse(input.nowIso);
      if (incident.initialSentAt === null) {
        return { id: incident.id, phase: 'initial' as const, claimToken: input.claimToken };
      }
      if (incident.oneHourSentAt === null && incident.openedAt + 3_600_000 <= now) {
        return { id: incident.id, phase: 'one_hour_repeat' as const, claimToken: input.claimToken };
      }
      return null;
    },
  ),
  completeOutboundProviderAlertClaim: vi.fn(
    async (input: {
      incidentId: string;
      phase: 'initial' | 'one_hour_repeat';
      sentAtIso: string;
    }) => {
      const incident = [...store.values()].find((row) => row.id === input.incidentId);
      if (!incident) return false;
      if (input.phase === 'initial') incident.initialSentAt = Date.parse(input.sentAtIso);
      else incident.oneHourSentAt = Date.parse(input.sentAtIso);
      return true;
    },
  ),
  releaseOutboundProviderAlertClaim: vi.fn(async () => true),
  claimDueOutboundProviderAlert: vi.fn(async () => null),
  resolveStaleCriticalAlertIncidents: vi.fn(async () => ({ resolved: 0 })),
};

vi.mock('@/app-layer/health/collectCriticalHealthSignals', () => ({
  collectCriticalHealthSignals: vi.fn(async () => ({ webappDb: 'down' })),
}));
vi.mock('@/modules/operator-health/criticalHealthSignals', () => ({
  classifyCriticalHealthSignals: vi.fn(() => [
    {
      topic: 'webapp_db',
      dedupKey: 'critical:webapp_db:down',
      lines: ['БД webapp: недоступна'],
      pushTitle: 'Критичный сбой: БД webapp',
    },
  ]),
}));
vi.mock('@/modules/operator-alerts/dispatchOperatorAlert', () => ({ dispatchOperatorAlert }));
vi.mock('@/app-layer/health/deliveryHeartbeatObserver', () => ({
  pingPipelineHeartbeatOnConfirmedDelivery: vi.fn(async () => 'skipped'),
  readOperatorHeartbeatVerdicts: vi.fn(async () => []),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ operatorHealthWrite: writePort }),
}));

const { runOperatorHealthCriticalTick } =
  await import('@/app-layer/health/runOperatorHealthCriticalTick');

const T0 = new Date('2026-08-19T09:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe('каденция критического сигнала: сразу → +1 час → и не чаще', () => {
  beforeEach(() => {
    store.clear();
    dispatched.length = 0;
    vi.clearAllMocks();
  });

  it('дано: отказ держится непрерывно → когда тик бежит каждые пять минут два часа → тогда человека будят дважды: в момент отказа и через час', async () => {
    for (let minute = 0; minute <= 120; minute += 5) {
      await runOperatorHealthCriticalTick(at(minute));
    }

    expect(dispatched).toEqual(['critical:webapp_db:down', 'critical:webapp_db:down']);
    const incident = [...store.values()][0]!;
    expect(incident.initialSentAt).toBe(T0.getTime());
    expect(incident.oneHourSentAt).toBe(at(60).getTime());
  });

  it('дано: тик прошёл через пять минут после первого алерта → когда отказ тот же → тогда второго сообщения нет: повтор ждёт своего часа, а не спамит', async () => {
    await runOperatorHealthCriticalTick(at(0));
    await runOperatorHealthCriticalTick(at(5));

    expect(dispatched).toHaveLength(1);
  });

  it('дано: отправка не удалась → когда тик завершился → тогда заявка отпущена и фаза НЕ помечена отправленной, иначе повтор потерялся бы навсегда', async () => {
    dispatchOperatorAlert.mockResolvedValueOnce({ dispatched: false });

    await runOperatorHealthCriticalTick(at(0));

    expect(writePort.releaseOutboundProviderAlertClaim).toHaveBeenCalledTimes(1);
    expect([...store.values()][0]!.initialSentAt).toBeNull();

    await runOperatorHealthCriticalTick(at(5));
    expect(dispatched).toEqual(['critical:webapp_db:down']);
  });
});
