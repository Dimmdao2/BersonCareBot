import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const fakes = vi.hoisted(() => ({
  gate: vi.fn(),
  listSettingsByScope: vi.fn(),
  persistErrorTrackingConfig: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.gate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: {
      listSettingsByScope: fakes.listSettingsByScope,
      persistErrorTrackingConfig: fakes.persistErrorTrackingConfig,
    },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: {
    error: fakes.loggerError,
    warn: fakes.loggerWarn,
    info: fakes.loggerInfo,
  },
}));

import { GET, PUT } from './route';

const session = {
  user: {
    userId: '00000000-0000-4000-8000-000000000017',
    role: 'admin',
    displayName: 'Platform admin',
    bindings: {},
  },
};

function put(body: unknown) {
  return PUT(
    new Request('https://app.example.test/api/platform/error-tracking', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.gate.mockResolvedValue({ ok: true, session });
  fakes.persistErrorTrackingConfig.mockResolvedValue([]);
});

describe('platform error-tracking API', () => {
  it('atomically saves a valid enabled DSN and only reads back its presence', async () => {
    const dsn = 'https://public-key@errors.example.test/42';
    const response = await put({ enabled: true, dsn });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      config: { enabled: true, hasStoredDsn: true },
    });
    expect(fakes.persistErrorTrackingConfig).toHaveBeenCalledWith(
      { enabled: true, dsn },
      session.user.userId,
    );

    fakes.listSettingsByScope.mockResolvedValue([
      { key: 'error_tracking_enabled', valueJson: { value: true } },
      { key: 'error_tracking_dsn', valueJson: { value: dsn } },
    ]);
    const readback = await GET();
    const readbackText = await readback.text();
    expect(readbackText).not.toContain(dsn);
    expect(JSON.parse(readbackText)).toEqual({
      ok: true,
      config: { enabled: true, hasStoredDsn: true },
    });
  });

  it('never emits a submitted DSN through structured or console logs', async () => {
    const dsn = 'https://audit-secret-key@errors.example.test/42';
    const consoleSpies = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
    ];

    try {
      const response = await put({ enabled: true, dsn });

      expect(response.status).toBe(200);
      const emitted = JSON.stringify([
        fakes.loggerError.mock.calls,
        fakes.loggerWarn.mock.calls,
        fakes.loggerInfo.mock.calls,
        ...consoleSpies.map((spy) => spy.mock.calls),
      ]);
      expect(emitted).not.toContain(dsn);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
    }
  });

  it('refuses a malformed DSN without touching the settings transaction', async () => {
    const response = await put({ enabled: true, dsn: 'not-a-dsn' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_dsn' });
    expect(fakes.persistErrorTrackingConfig).not.toHaveBeenCalled();
  });

  it('returns the platform gate refusal before resolving dependencies', async () => {
    const denied = NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    fakes.gate.mockResolvedValue({ ok: false, response: denied });

    expect(await put({ enabled: true, dsn: 'https://public@example.test/1' })).toBe(denied);
    expect(fakes.persistErrorTrackingConfig).not.toHaveBeenCalled();
  });
});
