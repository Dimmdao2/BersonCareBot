import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { warn: vi.fn() },
}));

import {
  createEmptyAudienceReporter,
  type EmptyAudienceReporterDependencies,
} from './reportEmptyNotificationAudience';

const NOW = new Date('2026-07-30T08:00:00.000Z');

function createDependencies(
  overrides: Partial<EmptyAudienceReporterDependencies> = {},
): EmptyAudienceReporterDependencies {
  return {
    readCounterMeta: vi.fn(async () => null),
    recordCounterFailure: vi.fn(async () => undefined),
    readFallbackEmail: vi.fn(async () => 'operator@example.com'),
    sendFallbackEmail: vi.fn(async () => true),
    now: () => NOW,
    ...overrides,
  };
}

describe('empty notification audience reporter', () => {
  it('records and relays an operational empty audience exactly once without event data', async () => {
    const dependencies = createDependencies();
    const report = createEmptyAudienceReporter(dependencies);

    const result = await report({
      topic: 'patient-name-Иван',
      severity: 'operational',
      channels: ['private-patient-channel'],
      context: { patient: 'Иван' },
    });

    expect(result).toEqual({ counterTotal: 1, fallback: 'sent' });
    expect(dependencies.recordCounterFailure).toHaveBeenCalledOnce();
    expect(dependencies.readFallbackEmail).toHaveBeenCalledOnce();
    expect(dependencies.sendFallbackEmail).toHaveBeenCalledOnce();
    const message = vi.mocked(dependencies.sendFallbackEmail).mock.calls[0]![0];
    expect(message.to).toBe('operator@example.com');
    expect(`${message.subject}\n${message.text}`).not.toMatch(
      /Иван|patient-name|private-patient-channel/,
    );
  });

  it('records user-facing failures but never reads or invokes the operator fallback', async () => {
    const dependencies = createDependencies();
    const report = createEmptyAudienceReporter(dependencies);

    const result = await report({
      topic: 'patient_notification',
      severity: 'user_facing',
      channels: ['email'],
    });

    expect(result).toEqual({ counterTotal: 1, fallback: 'not_applicable' });
    expect(dependencies.recordCounterFailure).toHaveBeenCalledOnce();
    expect(dependencies.readFallbackEmail).not.toHaveBeenCalled();
    expect(dependencies.sendFallbackEmail).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'DB setting read',
      overrides: {
        readFallbackEmail: vi.fn(async () => {
          throw new Error('setting unavailable');
        }),
      },
    },
    {
      name: 'dedicated relay',
      overrides: {
        sendFallbackEmail: vi.fn(async () => {
          throw new Error('relay unavailable');
        }),
      },
    },
  ])('keeps the original path safe when $name fails', async ({ overrides }) => {
    const dependencies = createDependencies(overrides);
    const report = createEmptyAudienceReporter(dependencies);

    await expect(
      report({
        topic: 'operator_health',
        severity: 'operational',
        channels: ['email'],
      }),
    ).resolves.toEqual({ counterTotal: 1, fallback: 'failed' });
    expect(dependencies.recordCounterFailure).toHaveBeenCalledOnce();
  });
});
