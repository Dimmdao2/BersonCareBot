import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  isOperatorHealthProbeQuiet,
  operatorHealthProbeConfigSchema,
} from './operatorHealthProbeSettings.js';

const DAY_MS = 24 * 60 * 60 * 1_000;

function storedConfig(quietWindowMaxDurationMs: number): unknown {
  return {
    ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
    quietWindowMaxDurationMs,
  };
}

describe('окно тишины проверок живости — решение владельца 17.08.2026', () => {
  it('принимает потолок ровно в сутки', () => {
    const parsed = operatorHealthProbeConfigSchema.parse(storedConfig(DAY_MS));

    expect(parsed.quietWindowMaxDurationMs).toBe(DAY_MS);
  });

  it('отвергает потолок больше суток: предохранитель не должен превращаться в выключатель', () => {
    // Владелец 17.08: «максимум сутки, по умолчанию 2 часа». Раньше схема интегратора принимала до
    // недели, хотя webapp тот же самый ключ отвергал уже после суток — настройка, отвергнутая одним
    // приложением, молча принималась другим.
    expect(() => operatorHealthProbeConfigSchema.parse(storedConfig(2 * DAY_MS))).toThrow();
    expect(() => operatorHealthProbeConfigSchema.parse(storedConfig(7 * DAY_MS))).toThrow();
  });

  it('отвергает потолок короче минуты', () => {
    expect(() => operatorHealthProbeConfigSchema.parse(storedConfig(59_000))).toThrow();
  });

  it('не глушит проверки, когда сохранённая тишина длиннее потолка', () => {
    const now = new Date('2026-08-17T10:00:00.000Z');
    const beyondCap = new Date(now.getTime() + DAY_MS + 60_000).toISOString();

    const quiet = isOperatorHealthProbeQuiet(
      { ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG, quietUntil: beyondCap },
      now,
    );

    expect(quiet).toBe(false);
  });

  it('глушит проверки внутри разрешённого окна', () => {
    const now = new Date('2026-08-17T10:00:00.000Z');
    const withinCap = new Date(now.getTime() + 2 * 60 * 60 * 1_000).toISOString();

    const quiet = isOperatorHealthProbeQuiet(
      { ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG, quietUntil: withinCap },
      now,
    );

    expect(quiet).toBe(true);
  });
});
