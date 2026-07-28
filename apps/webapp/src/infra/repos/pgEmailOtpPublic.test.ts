import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/db/runWebappSql')>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
    // Transaction wrapper just invokes the callback with a fake tx handle;
    // runWebappPgText is mocked so the handle is never dereferenced.
    runWebappTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
});

import { createPgEmailOtpPublicPort } from './pgEmailOtpPublic';

describe('pgEmailOtpPublic.findOrCreatePublicEmailUser', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('merged-away email resolves to the CANONICAL user (no ghost account)', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: 'canon-user', was_created: false }],
    });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser('old-merged@example.com');

    expect(result).toEqual({ userId: 'canon-user', wasCreated: false });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain(
      'app.email_otp_public_find_or_create_user',
    );
  });

  it('unknown email (no canonical, no merged row) falls through to INSERT', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: 'new-user', was_created: true }],
    });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser('brand-new@example.com');

    expect(result).toEqual({ userId: 'new-user', wasCreated: true });
  });

  it('existing canonical email returns it directly without touching merge resolution', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: 'existing-user', was_created: false }],
    });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser('known@example.com');

    expect(result).toEqual({ userId: 'existing-user', wasCreated: false });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });
});

describe('pgEmailOtpPublic structured patient registration', () => {
  beforeEach(() => runWebappPgTextMock.mockReset());

  it('uses lookup-only accessor for ordinary email OTP login', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const result = await createPgEmailOtpPublicPort().findPublicEmailUser('unknown@example.com');
    expect(result).toBeNull();
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain(
      'app.email_otp_public_find_user_by_email',
    );
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).not.toContain('find_or_create');
  });

  it('passes structured FIO and optional null patronymic only through the narrow registration accessor', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ ok: true, user_id: 'patient-user', was_created: true }],
    });
    const result = await createPgEmailOtpPublicPort().registerPublicEmailPatient({
      emailNormalized: 'patient@example.com',
      lastName: 'Иванов',
      firstName: 'Иван',
      patronymic: null,
    });
    expect(result).toEqual({ ok: true, userId: 'patient-user', wasCreated: true });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain(
      'app.email_otp_public_register_patient',
    );
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      'patient@example.com',
      'Иванов',
      'Иван',
      null,
    ]);
  });
});
