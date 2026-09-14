import { describe, expect, it } from 'vitest';
import {
  decideHealthProbeLog,
  emptyHealthProbeWindow,
  HEALTH_PROBE_LOG_MIN_GAP_MS,
} from './healthProbeLog.js';

/**
 * Журнал проверки `/health` обязан отвечать на один вопрос и не писать ничего сверх него: было ли
 * хорошо минуту назад. Тишина не должна значить одновременно «хорошо» и «настолько плохо, что даже
 * отказ не записался» (решение владельца 14.09.2026).
 */
describe('decideHealthProbeLog', () => {
  const T0 = 1_000_000;
  const MINUTE = 60 * 1000;

  it('пишет первую строку после запуска — иначе до первой смены состояния журнал пуст', () => {
    const decision = decideHealthProbeLog(emptyHealthProbeWindow(), 'ok', T0);

    expect(decision.log).toBe(true);
    if (!decision.log) throw new Error('unreachable');
    expect(decision.reason).toBe('first');
    expect(decision.previous).toBeNull();
  });

  it('минутная проверка даёт минутную строку — свежесть и есть весь смысл записи', () => {
    const window = decideHealthProbeLog(emptyHealthProbeWindow(), 'ok', T0).window;

    const decision = decideHealthProbeLog(window, 'ok', T0 + MINUTE);

    expect(decision.log).toBe(true);
    if (!decision.log) throw new Error('unreachable');
    expect(decision.reason).toBe('tick');
  });

  it('ПОРЧА состояния пишется немедленно, не дожидаясь минуты', () => {
    const window = decideHealthProbeLog(emptyHealthProbeWindow(), 'ok', T0).window;

    const decision = decideHealthProbeLog(window, 'db_down', T0 + 1_000);

    expect(decision.log).toBe(true);
    if (!decision.log) throw new Error('unreachable');
    expect(decision.reason).toBe('state_changed');
    expect(decision.state).toBe('db_down');
    expect(decision.previous).toBe('ok');
  });

  it('ВОЗВРАТ в норму пишется тоже — иначе непонятно, кончился ли отказ', () => {
    const broken = decideHealthProbeLog(
      decideHealthProbeLog(emptyHealthProbeWindow(), 'ok', T0).window,
      'db_down',
      T0 + 1_000,
    ).window;

    const decision = decideHealthProbeLog(broken, 'ok', T0 + 2_000);

    expect(decision.log).toBe(true);
    if (!decision.log) throw new Error('unreachable');
    expect(decision.reason).toBe('state_changed');
    expect(decision.state).toBe('ok');
    expect(decision.previous).toBe('db_down');
  });

  /**
   * Порог существует только на случай, если шаг самой проверки когда-нибудь опять опустят до
   * десяти секунд: тогда журнал не должен вернуться к строке на каждый опрос.
   */
  it('учащённый опрос не возвращает строку на каждую проверку', () => {
    let window = decideHealthProbeLog(emptyHealthProbeWindow(), 'ok', T0).window;
    let logged = 0;

    for (let i = 1; i <= 6; i += 1) {
      const decision = decideHealthProbeLog(window, 'ok', T0 + i * 10_000);
      if (decision.log) logged += 1;
      window = decision.window;
    }

    // Шесть опросов за минуту дают две строки (порог — тридцать секунд), а не шесть.
    expect(logged).toBe(2);
    expect(HEALTH_PROBE_LOG_MIN_GAP_MS).toBeLessThan(MINUTE);
  });
});
