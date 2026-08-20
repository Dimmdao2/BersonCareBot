import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  recordEventsBatch: vi.fn(),
  writePlatformAuditLog: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    productAnalytics: { recordEventsBatch: fakes.recordEventsBatch },
  }),
}));

vi.mock('@/app-layer/admin/auditLog', () => ({
  writePlatformAuditLog: fakes.writePlatformAuditLog,
}));

import { recordAuthRegistrationFailure } from './recordAuthRegistration';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.recordEventsBatch.mockResolvedValue(undefined);
  fakes.writePlatformAuditLog.mockResolvedValue(undefined);
});

describe('registration failure operational audit', () => {
  it('reports a system failure through the platform audit boundary even when funnel analytics fails', async () => {
    fakes.recordEventsBatch.mockRejectedValueOnce(new Error('analytics unavailable'));

    await expect(
      recordAuthRegistrationFailure({
        attemptId: 'attempt-42',
        authMethod: 'email_password',
        stage: 'confirm',
        entryChannel: 'pwa',
        contactType: 'email',
        contactValue: 'patient@example.com',
        errorCode: 'database_unavailable',
        errorClass: 'system',
      }),
    ).resolves.toBeUndefined();

    expect(fakes.writePlatformAuditLog).toHaveBeenCalledWith({
      actorId: null,
      action: 'auth_register_failure',
      targetId: 'attempt-42',
      status: 'error',
      details: {
        attemptId: 'attempt-42',
        authMethod: 'email_password',
        stage: 'confirm',
        contactType: 'email',
        contactHint: 'p***@example.com',
        errorCode: 'database_unavailable',
        errorClass: 'system',
      },
    });
  });
});
