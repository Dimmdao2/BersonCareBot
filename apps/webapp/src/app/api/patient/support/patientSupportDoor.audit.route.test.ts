/**
 * Oracle: docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md §5.1 keeps support reachable before
 * email confirmation. A regression here strands the patient behind the email gate and can silently
 * lose the only recovery channel available from that restricted state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  requirePatientApiSession: vi.fn(),
  patientClientBusinessGate: vi.fn(),
  relaySupportSubmission: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiSession: fakes.requirePatientApiSession,
}));
vi.mock('@/app-layer/platform-access', () => ({
  patientClientBusinessGate: fakes.patientClientBusinessGate,
}));
vi.mock('@/app-layer/support/relaySupportSubmission', () => ({
  relaySupportSubmission: fakes.relaySupportSubmission,
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { warn: vi.fn() },
}));

import { POST } from './route';

function patientWithoutEmail(userId: string): AppSession {
  return {
    user: {
      userId,
      role: 'client',
      displayName: 'Пациент',
      phone: '+79990000000',
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 2,
  };
}

function request(body: unknown): Request {
  return new Request('https://therapygo.example.test/api/patient/support', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/patient/support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.patientClientBusinessGate.mockResolvedValue('need_activation');
    fakes.relaySupportSubmission.mockResolvedValue({ delivered: true, persisted: false });
  });

  it('preserves the shared session-boundary rejection response', async () => {
    fakes.requirePatientApiSession.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });

    const response = await POST(request({ email: 'patient@example.test', message: 'Помогите' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(fakes.patientClientBusinessGate).not.toHaveBeenCalled();
  });

  it('keeps stale patient sessions unauthorized', async () => {
    const session = patientWithoutEmail('patient-stale');
    fakes.requirePatientApiSession.mockResolvedValue({ ok: true, session });
    fakes.patientClientBusinessGate.mockResolvedValue('stale_session');

    const response = await POST(request({ email: 'patient@example.test', message: 'Помогите' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });

  it('keeps validation statuses unchanged', async () => {
    const session = patientWithoutEmail('patient-validation');
    fakes.requirePatientApiSession.mockResolvedValue({ ok: true, session });

    const invalidEmail = await POST(request({ email: 'not-an-email', message: 'Помогите' }));
    const invalidMessage = await POST(request({ email: 'patient@example.test', message: ' ' }));

    expect(invalidEmail.status).toBe(400);
    await expect(invalidEmail.json()).resolves.toMatchObject({ error: 'invalid_email' });
    expect(invalidMessage.status).toBe(400);
    await expect(invalidMessage.json()).resolves.toMatchObject({ error: 'invalid_message' });
  });

  it('accepts support from an activation-gated patient without email', async () => {
    const session = patientWithoutEmail('patient-no-email');
    fakes.requirePatientApiSession.mockResolvedValue({ ok: true, session });

    const response = await POST(
      request({ email: 'reply@example.test', message: 'Не приходит код', surface: 'browser' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, delivered: true });
    expect(fakes.patientClientBusinessGate).toHaveBeenCalledWith(session);
    expect(fakes.relaySupportSubmission).toHaveBeenCalledTimes(1);

    const repeated = await POST(
      request({ email: 'reply@example.test', message: 'Повтор', surface: 'browser' }),
    );
    expect(repeated.status).toBe(429);
    await expect(repeated.json()).resolves.toEqual({ ok: false, error: 'rate_limited' });
  });

  it('keeps an undelivered but persisted submission successful', async () => {
    const session = patientWithoutEmail('patient-undelivered');
    fakes.requirePatientApiSession.mockResolvedValue({ ok: true, session });
    fakes.relaySupportSubmission.mockResolvedValue({ delivered: false, persisted: true });

    const response = await POST(
      request({ email: 'reply@example.test', message: 'Нужна помощь', surface: 'browser' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, delivered: false });
  });
});
