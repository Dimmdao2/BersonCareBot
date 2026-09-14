import { describe, expect, it } from 'vitest';
import {
  classifyCriticalHealthSignals,
  nextIntegratorApiFailRuns,
  readIntegratorApiFailRuns,
  type CriticalHealthSignalsInput,
} from './criticalHealthSignals';

/**
 * Письмо «Критичный сбой: integrator API» будит человека ночью, поэтому одной неудачной пробы для
 * него мало: при переключении blue/green старый цвет ещё обслуживает, а его сосед-интегратор уже
 * остановлен. 13.09.2026 ровно так владельцу и ушло письмо в 22:15, через двадцать секунд после
 * которого всё было в порядке.
 *
 * Набор закрепляет обе половины правила: одиночный отказ НЕ будит, второй подряд — будит.
 */

function input(overrides: Partial<CriticalHealthSignalsInput>): CriticalHealthSignalsInput {
  return {
    webappDb: 'up',
    integratorApi: 'ok',
    outgoingDelivery: { deadTotal: 0, dueBacklog: 0, deadRecent: 0, lastOperatorDeadAt: null },
    backupJobs: {},
    probeConsecutiveFailRuns: 0,
    probeIncidentsOpenCount: 0,
    ...overrides,
  };
}

function integratorTopics(signals: CriticalHealthSignalsInput): string[] {
  return classifyCriticalHealthSignals(signals)
    .filter((candidate) => candidate.topic === 'integrator_api')
    .map((candidate) => candidate.dedupKey);
}

describe('тревога об интеграторе требует подтверждения', () => {
  it('одиночный отказ НЕ будит — это окно выкатки, а не авария', () => {
    expect(
      integratorTopics(input({ integratorApi: 'unreachable', integratorApiFailRuns: 1 })),
    ).toEqual([]);
  });

  it('второй отказ подряд будит', () => {
    expect(
      integratorTopics(input({ integratorApi: 'unreachable', integratorApiFailRuns: 2 })),
    ).toEqual(['critical:integrator_api:unreachable']);
  });

  it('исправный интегратор не будит ни при каком счёте', () => {
    expect(integratorTopics(input({ integratorApi: 'ok', integratorApiFailRuns: 5 }))).toEqual([]);
  });

  /**
   * Поверхности, которые просто ПОКАЗЫВАЮТ состояние, счётчик не ведут. Для них поведение обязано
   * остаться прежним — иначе «подтверждение» тихо ослепит и панель здоровья тоже.
   */
  it('без счётчика поведение прежнее: отказ виден сразу', () => {
    expect(integratorTopics(input({ integratorApi: 'error' }))).toEqual([
      'critical:integrator_api:error',
    ]);
  });
});

describe('счёт отказов подряд', () => {
  it('успех обнуляет счёт, отказ прибавляет', () => {
    expect(nextIntegratorApiFailRuns(3, 'ok')).toBe(0);
    expect(nextIntegratorApiFailRuns(0, 'unreachable')).toBe(1);
    expect(nextIntegratorApiFailRuns(1, 'error')).toBe(2);
  });

  it('испорченная или пустая отметка читается как ноль, а не роняет тик', () => {
    expect(readIntegratorApiFailRuns(null)).toBe(0);
    expect(readIntegratorApiFailRuns({})).toBe(0);
    expect(readIntegratorApiFailRuns({ integratorApiFailRuns: 'два' })).toBe(0);
    expect(readIntegratorApiFailRuns({ integratorApiFailRuns: -5 })).toBe(0);
    expect(readIntegratorApiFailRuns({ integratorApiFailRuns: 2 })).toBe(2);
  });

  /**
   * Ноль из испорченной отметки не должен ЗАМАЛЧИВАТЬ настоящий отказ навсегда: следующий тик
   * получит единицу, ещё следующий — двойку, и письмо всё равно придёт.
   */
  it('после нечитаемой отметки счёт всё равно доходит до порога', () => {
    const first = nextIntegratorApiFailRuns(readIntegratorApiFailRuns(null), 'unreachable');
    const second = nextIntegratorApiFailRuns(first, 'unreachable');

    expect(integratorTopics(input({ integratorApi: 'unreachable', integratorApiFailRuns: first })))
      .toEqual([]);
    expect(integratorTopics(input({ integratorApi: 'unreachable', integratorApiFailRuns: second })))
      .toEqual(['critical:integrator_api:unreachable']);
  });
});
