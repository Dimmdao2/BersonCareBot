import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DB_PRINCIPAL_CONTEXT_MODE_ENV,
  DB_PRINCIPAL_SIGNING_SECRET_ENV,
  enterWithDbBootstrapPrincipal,
  enterWithDbPatientPrincipal,
  getCurrentDbPrincipal,
  type DbPrincipalContextMode,
} from '@bersoncare/db-principal';
import type { AppSession } from '@/shared/types/session';

const resolveMock = vi.fn();
const resolvePatientOrganizationMock = vi.hoisted(() => vi.fn());
const PATIENT_ORG_ID = '11111111-1111-4111-8111-111111111111';
const originalPrincipalMode = process.env[DB_PRINCIPAL_CONTEXT_MODE_ENV];
const originalPrincipalSigningSecret = process.env[DB_PRINCIPAL_SIGNING_SECRET_ENV];

vi.mock('@/config/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/config/env')>();
  return {
    ...mod,
    env: { ...mod.env, DATABASE_URL: 'postgresql://test/test' },
  };
});

vi.mock('@/infra/db/client', () => ({
  getPool: () => ({}),
}));

/** Прямой мок: `patientClientBusinessGate` импортирует resolver из файла, не из barrel. */
vi.mock('@/modules/platform-access/resolvePlatformAccessContext', () => ({
  resolvePlatformAccessContext: (...args: unknown[]) => resolveMock(...args),
}));

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => ({
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolvePatientOrganizationMock,
    },
  })),
}));

const getPlatformEntryMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/platformCookie.server', () => ({
  getPlatformEntry: (...args: unknown[]) => getPlatformEntryMock(...(args as [])),
}));

import { getCurrentSession } from '@/modules/auth/service';
import {
  requirePatientApiBusinessAccess,
  requirePatientApiSession,
  requirePatientApiSessionWithPhone,
} from './requireRole';

function clientSession(partial?: Partial<AppSession['user']>): AppSession {
  return {
    user: {
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      role: 'client',
      displayName: 'T',
      phone: '+79990000001',
      bindings: {},
      ...partial,
    },
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

function setDbPrincipalContextMode(mode: DbPrincipalContextMode): void {
  process.env[DB_PRINCIPAL_CONTEXT_MODE_ENV] = mode;
  if (mode === 'legacy-guc') {
    delete process.env[DB_PRINCIPAL_SIGNING_SECRET_ENV];
    return;
  }
  process.env[DB_PRINCIPAL_SIGNING_SECRET_ENV] = 'test-db-principal-signing-secret';
}

describe('requirePatientApiBusinessAccess / requirePatientApiSessionWithPhone — tier patient (Phase C fix)', () => {
  beforeEach(() => {
    enterWithDbBootstrapPrincipal({ source: 'test-reset' });
    resolvePatientOrganizationMock.mockReset();
    resolvePatientOrganizationMock.mockResolvedValue({ ok: true, organizationId: PATIENT_ORG_ID });
    resolveMock.mockReset();
    getPlatformEntryMock.mockReset();
    vi.mocked(getCurrentSession).mockReset();
    setDbPrincipalContextMode('legacy-guc');
  });

  afterEach(() => {
    if (originalPrincipalMode === undefined) {
      delete process.env[DB_PRINCIPAL_CONTEXT_MODE_ENV];
    } else {
      process.env[DB_PRINCIPAL_CONTEXT_MODE_ENV] = originalPrincipalMode;
    }
    if (originalPrincipalSigningSecret === undefined) {
      delete process.env[DB_PRINCIPAL_SIGNING_SECRET_ENV];
    } else {
      process.env[DB_PRINCIPAL_SIGNING_SECRET_ENV] = originalPrincipalSigningSecret;
    }
  });

  it('allows web/OAuth/email user without phone even with messenger binding when entry is standalone', async () => {
    const sess = clientSession({ bindings: { telegramId: '123' }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'onboarding',
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: 'resolved_canon',
    });
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce('standalone');

    const gate = await requirePatientApiBusinessAccess({ returnPath: '/app/patient/diary' });
    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: sess.user.userId,
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
  });

  it('returns 403 patient_activation_required when tier is onboarding and platform entry is bot (miniapp)', async () => {
    const sess = clientSession({ bindings: { telegramId: '123' }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'onboarding',
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: 'resolved_canon',
    });
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce('bot');

    const gate = await requirePatientApiBusinessAccess({ returnPath: '/app/patient/diary' });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const data = (await gate.response.json()) as { error?: string };
    expect(data.error).toBe('patient_activation_required');
  });

  it('allows when tier is patient', async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon',
    });

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
  });

  it('preserves the organization resolved by the central patient session stamp', async () => {
    const session = clientSession();
    enterWithDbPatientPrincipal({
      organizationId: PATIENT_ORG_ID,
      platformUserId: session.user.userId,
      source: 'getCurrentSession',
    });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(session);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: session.user.userId,
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon',
    });

    const gate = await requirePatientApiBusinessAccess();

    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      organizationId: PATIENT_ORG_ID,
      platformUserId: session.user.userId,
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
  });

  it('allows web/OAuth/email user without phone even with max binding when entry is standalone', async () => {
    const sess = clientSession({ bindings: { maxId: 'm123' }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'onboarding',
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: 'resolved_canon',
    });
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce('standalone');

    const gate = await requirePatientApiBusinessAccess({ returnPath: '/app/patient/diary' });
    expect(gate.ok).toBe(true);
  });

  it('allows when getPlatformEntry throws (treat as standalone)', async () => {
    const sess = clientSession({ phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'onboarding',
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: 'resolved_canon',
    });
    vi.mocked(getPlatformEntryMock).mockRejectedValueOnce(new Error('boom'));

    const gate = await requirePatientApiBusinessAccess({ returnPath: '/app/patient/diary' });
    expect(gate.ok).toBe(true);
  });

  it('returns 401 when there is no session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(null);

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it('returns 401 when role is not client (doctor)', async () => {
    const sess = clientSession({ role: 'doctor' as const });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it('returns 401 when platform row missing', async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: null,
      dbRole: null,
      tier: 'guest',
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: 'session_user_missing',
    });

    const gate = await requirePatientApiSessionWithPhone();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it('stamps patient identity only in legacy-guc without resolving clinic enrollment', async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon',
    });

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
  });

  it('stamps patient identity only in shadow without logging clinic-resolution warnings', async () => {
    setDbPrincipalContextMode('shadow');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon',
    });

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stamps patient identity only in locked when patient has no active clinic enrollment', async () => {
    setDbPrincipalContextMode('locked');
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon',
    });

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
  });

  it('stamps patient identity only in locked when a patient has multiple active clinic enrollments', async () => {
    setDbPrincipalContextMode('locked');
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'patient',
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon',
    });

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(resolvePatientOrganizationMock).not.toHaveBeenCalled();
  });

  it('alias requirePatientApiSessionWithPhone matches requirePatientApiBusinessAccess', async () => {
    const ctx = {
      canonicalUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      dbRole: 'client',
      tier: 'patient' as const,
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: 'resolved_canon' as const,
    };
    const sess = clientSession();
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce(ctx);
    const a = await requirePatientApiBusinessAccess();
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce(ctx);
    const b = await requirePatientApiSessionWithPhone();
    expect(a.ok && b.ok).toBe(true);
  });
});

describe('requirePatientApiSession — onboarding patient boundary', () => {
  beforeEach(() => {
    enterWithDbBootstrapPrincipal({ source: 'test-reset' });
    vi.mocked(getCurrentSession).mockReset();
    resolveMock.mockReset();
    setDbPrincipalContextMode('legacy-guc');
  });

  it('accepts a patient without evaluating the business tier and installs its principal', async () => {
    const sess = clientSession({ phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);

    const gate = await requirePatientApiSession();

    expect(gate).toMatchObject({ ok: true, session: sess });
    expect(resolveMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'patient',
      platformUserId: sess.user.userId,
    });
  });

  it('rejects a staff audience', async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession({ role: 'doctor' }));

    const gate = await requirePatientApiSession();

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });
});
