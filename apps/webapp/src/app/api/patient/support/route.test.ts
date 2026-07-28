import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const patientGateMock = vi.hoisted(() => vi.fn());
const relaySupportSubmissionMock = vi.hoisted(() => vi.fn());
const headerMap = vi.hoisted(() => ({
  entries: [['user-agent', 'VitestUA/1']] as [string, string][],
}));

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock('@/app-layer/platform-access', () => ({
  patientClientBusinessGate: patientGateMock,
}));

// D-2: Telegram-only relayOutbound replaced by the multi-channel operator-alert relay.
vi.mock('@/app-layer/support/relaySupportSubmission', () => ({
  relaySupportSubmission: relaySupportSubmissionMock,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers(headerMap.entries)),
}));

import { POST } from './route';

function baseSession(overrides?: Partial<{ userId: string; phone: string; telegramId: string }>) {
  const o = overrides ?? {};
  return {
    user: {
      userId: o.userId !== undefined ? o.userId : 'user-support-1',
      role: 'client' as const,
      displayName: 'Тест',
      phone: o.phone !== undefined ? o.phone : '+79990001122',
      bindings: {
        telegramId: o.telegramId ?? '',
        maxId: '',
        vkId: '',
      },
    },
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  };
}

const jsonBody = (email: string, message: string, opts?: { surface?: string; from?: string }) =>
  JSON.stringify({
    email,
    message,
    ...(opts?.surface ? { surface: opts.surface } : {}),
    ...(opts?.from !== undefined ? { from: opts.from } : {}),
  });

describe('POST /api/patient/support', () => {
  beforeEach(() => {
    relaySupportSubmissionMock.mockResolvedValue({ delivered: true, persisted: false });
    patientGateMock.mockResolvedValue('allow');
    headerMap.entries = [['user-agent', 'VitestUA/1']];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session', async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('a@b.co', 'hi'),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when gate is stale_session', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession());
    patientGateMock.mockResolvedValue('stale_session');
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('a@b.co', 'hi'),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-client role', async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: {
        userId: 'doc-1',
        role: 'doctor',
        displayName: 'Dr',
        phone: '',
        bindings: {},
      },
      issuedAt: 0,
      expiresAt: 9_999_999_999,
    });
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('a@b.co', 'hi'),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid email', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession());
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('not-an-email', 'hi'),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('invalid_email');
  });

  it('returns 200 when gate is need_activation and relays with correct content', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'onb-1', phone: '' }));
    patientGateMock.mockResolvedValue('need_activation');
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('user@example.com', 'Помогите'),
      }),
    );
    expect(res.status).toBe(200);
    expect(relaySupportSubmissionMock).toHaveBeenCalledTimes(1);
    const [params] = relaySupportSubmissionMock.mock.calls[0] as [
      { kind: string; lines: string[]; email: string; message: string; userId: string },
    ];
    expect(params.kind).toBe('patient');
    expect(params.email).toBe('user@example.com');
    expect(params.message).toBe('Помогите');
    expect(params.userId).toBe('onb-1');
    expect(params.lines.join('\n')).toContain('onb-1');
  });

  it('includes sanitized from path in the relayed lines when under /app', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'support-from-ok' }));
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('a@b.co', 'hi', { from: '/app/patient/bind-phone' }),
      }),
    );
    expect(res.status).toBe(200);
    const [params] = relaySupportSubmissionMock.mock.calls[0] as [{ lines: string[] }];
    expect(params.lines.join('\n')).toContain('Страница: /app/patient/bind-phone');
  });

  it('ignores from path outside /app', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'support-from-bad' }));
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('a@b.co', 'hi', { from: '/login?next=/evil' }),
      }),
    );
    expect(res.status).toBe(200);
    const [params] = relaySupportSubmissionMock.mock.calls[0] as [{ lines: string[] }];
    expect(params.lines.join('\n')).not.toContain('Страница:');
  });

  it('allows messenger bindings (no messenger_only)', async () => {
    getCurrentSessionMock.mockResolvedValue(
      baseSession({ userId: 'tg-user', telegramId: '12345' }),
    );
    patientGateMock.mockResolvedValue('allow');
    const res = await POST(
      new Request('http://localhost/api/patient/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody('x@y.z', 'msg'),
      }),
    );
    expect(res.status).toBe(200);
    const [params] = relaySupportSubmissionMock.mock.calls[0] as [{ lines: string[] }];
    expect(params.lines.join('\n')).toContain('telegram=да');
    expect(params.lines.join('\n')).toContain('12345');
  });

  it('returns 429 on rapid repeat after success', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'rate-u' }));
    const req = () =>
      POST(
        new Request('http://localhost/api/patient/support', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonBody('r@r.r', 'one'),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  it('rate-limits by phone when userId is empty', async () => {
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: '', phone: '+79991112233' }));
    const req = () =>
      POST(
        new Request('http://localhost/api/patient/support', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonBody('p@p.p', 'm'),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  it('rate-limits by X-Forwarded-For when userId and phone empty', async () => {
    headerMap.entries = [
      ['user-agent', 'VitestUA/1'],
      ['x-forwarded-for', '203.0.113.9, 10.0.0.1'],
    ];
    getCurrentSessionMock.mockResolvedValue(baseSession({ userId: '', phone: '' }));
    const req = () =>
      POST(
        new Request('http://localhost/api/patient/support', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonBody('i@i.i', 'm'),
        }),
      );
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  describe('D-2: never a hard failure to the caller', () => {
    it('still returns 200 ok:true with a non-alarming message when no channel confirms delivery', async () => {
      getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'fail-u' }));
      relaySupportSubmissionMock.mockResolvedValueOnce({ delivered: false, persisted: true });
      const res = await POST(
        new Request('http://localhost/api/patient/support', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonBody('f@f.f', 'm'),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; delivered: boolean; message: string };
      expect(body.ok).toBe(true);
      expect(body.delivered).toBe(false);
      expect(body.message).not.toMatch(/недоступна|ошибка|попробуйте позже/i);
    });

    it('still rate-limits after an undelivered-but-persisted submission (accepted either way)', async () => {
      getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'fail-u-2' }));
      relaySupportSubmissionMock.mockResolvedValueOnce({ delivered: false, persisted: true });
      const req = () =>
        POST(
          new Request('http://localhost/api/patient/support', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: jsonBody('f2@f.f', 'm'),
          }),
        );
      expect((await req()).status).toBe(200);
      expect((await req()).status).toBe(429);
    });
  });

  describe('relay chokepoint (D-2)', () => {
    it('calls relaySupportSubmission with kind=patient and a unique messageId', async () => {
      getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'relay-check-u' }));
      const res = await POST(
        new Request('http://localhost/api/patient/support', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonBody('a@b.co', 'test message'),
        }),
      );
      expect(res.status).toBe(200);
      expect(relaySupportSubmissionMock).toHaveBeenCalledTimes(1);
      const [params] = relaySupportSubmissionMock.mock.calls[0] as [
        { kind: string; messageId: string },
      ];
      expect(params.kind).toBe('patient');
      expect(params.messageId).toMatch(/^support:patient:/);
    });

    it('returns 200 (not an HTTP error) even when relaySupportSubmission reports total failure', async () => {
      getCurrentSessionMock.mockResolvedValue(baseSession({ userId: 'relay-fail-u' }));
      relaySupportSubmissionMock.mockResolvedValueOnce({ delivered: false, persisted: false });
      const res = await POST(
        new Request('http://localhost/api/patient/support', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: jsonBody('a@b.co', 'test message'),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; delivered: boolean };
      expect(body.ok).toBe(true);
      expect(body.delivered).toBe(false);
    });
  });
});
