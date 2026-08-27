import { describe, expect, it } from 'vitest';
import { classifyOperatorCronJobHealth } from '@/modules/operator-health/classifyOperatorCronJobHealthStatus';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

/**
 * Этап 2 сводного аудита 27.08.2026: «здоровье видит только те jobs, которые когда-то уже записали
 * тик». Kill-set — четыре исхода, которые прежняя классификация схлопывала в два: задание, которое
 * никогда не запускалось, просроченное, упавшее и здоровое.
 */
describe('classifyOperatorCronJobHealth', () => {
  it('никогда не запускалось — не то же самое, что просрочено', () => {
    expect(
      classifyOperatorCronJobHealth({
        lastStatus: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        staleAfterSec: 180,
        nowMs: NOW,
      }),
    ).toEqual({ status: 'no_data', reason: 'never_run' });
  });

  it('успех старше SLA свежести — просрочено', () => {
    expect(
      classifyOperatorCronJobHealth({
        lastStatus: 'success',
        lastSuccessAt: ago(3600),
        lastFailureAt: null,
        staleAfterSec: 180,
        nowMs: NOW,
      }),
    ).toEqual({ status: 'degraded', reason: 'stale' });
  });

  it('последний запуск упал — отказ, даже если недавний успех тоже есть', () => {
    expect(
      classifyOperatorCronJobHealth({
        lastStatus: 'failure',
        lastSuccessAt: ago(30),
        lastFailureAt: ago(10),
        staleAfterSec: 180,
        nowMs: NOW,
      }),
    ).toEqual({ status: 'error', reason: 'last_run_failed' });
  });

  it('свежий успех после старой ошибки — здоровье', () => {
    expect(
      classifyOperatorCronJobHealth({
        lastStatus: 'success',
        lastSuccessAt: ago(30),
        lastFailureAt: ago(3600),
        staleAfterSec: 180,
        nowMs: NOW,
      }),
    ).toEqual({ status: 'ok', reason: 'success' });
  });

  it('строка есть, а подтверждённого успеха нет — не здоровье', () => {
    expect(
      classifyOperatorCronJobHealth({
        lastStatus: 'running',
        lastSuccessAt: null,
        lastFailureAt: null,
        staleAfterSec: 180,
        nowMs: NOW,
      }),
    ).toEqual({ status: 'degraded', reason: 'stale' });
  });
});
