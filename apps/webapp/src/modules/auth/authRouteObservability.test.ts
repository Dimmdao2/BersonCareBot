import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerRuntimeBool, loggerInfo } = vi.hoisted(() => ({
  getServerRuntimeBool: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getServerRuntimeBool,
}));

vi.mock('@/infra/logging/logger', () => ({
  logger: { info: loggerInfo },
}));

import { logAuthRouteTiming } from './authRouteObservability';

describe('logAuthRouteTiming', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    getServerRuntimeBool.mockReset();
    loggerInfo.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the server-only flag and logs when enabled', async () => {
    getServerRuntimeBool.mockResolvedValue(true);

    logAuthRouteTiming({
      route: 'auth/test',
      request: new Request('https://example.test/api/auth/test'),
      startedAt: Date.now(),
      status: 200,
      outcome: 'ok',
    });

    await vi.waitFor(() => expect(loggerInfo).toHaveBeenCalledTimes(1));
    expect(getServerRuntimeBool).toHaveBeenCalledWith('debug_forward_to_admin');
  });

  it('never copies a raw legacy correlation header into explicit pino fields', async () => {
    getServerRuntimeBool.mockResolvedValue(true);
    const rawMarker = 'patient-name-or-token';

    logAuthRouteTiming({
      route: 'auth/test',
      request: new Request('https://example.test/api/auth/test', {
        headers: { 'x-bc-auth-correlation-id': rawMarker },
      }),
      startedAt: Date.now(),
      status: 200,
      outcome: 'ok',
    });

    await vi.waitFor(() => expect(loggerInfo).toHaveBeenCalledTimes(1));
    const fields = loggerInfo.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fields).not.toHaveProperty('correlationId');
    expect(JSON.stringify(fields)).not.toContain(rawMarker);
  });

  it('does not log when the server-only flag is disabled', async () => {
    getServerRuntimeBool.mockResolvedValue(false);

    logAuthRouteTiming({
      route: 'auth/test',
      request: new Request('https://example.test/api/auth/test'),
      startedAt: Date.now(),
      status: 200,
      outcome: 'ok',
    });

    await vi.waitFor(() => expect(getServerRuntimeBool).toHaveBeenCalledTimes(1));
    expect(loggerInfo).not.toHaveBeenCalled();
  });
});
