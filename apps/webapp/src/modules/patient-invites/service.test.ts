import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryPatientInvitesPort,
  resetInMemoryPatientInvitesForTests,
  setInMemoryPatientInviteEnrollmentForTests,
} from '@/infra/repos/inMemoryPatientInvites';
import {
  createPatientInvitesService,
  hashPatientInviteBearer,
  hashPatientInviteContinuation,
} from './service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const patientUserId = '00000000-0000-4000-8000-000000000002';
const otherUserId = '00000000-0000-4000-8000-000000000004';
const staffUserId = '00000000-0000-4000-8000-000000000003';

function bearerFrom(relativeUrl: string): string {
  return relativeUrl.split('#')[1] ?? '';
}

function buildService() {
  let deliveredCode = '';
  const sendEmailCode = vi.fn(async (_email: string, code: string) => {
    deliveredCode = code;
    return { ok: true as const };
  });
  const service = createPatientInvitesService({
    port: createInMemoryPatientInvitesPort(),
    sendEmailCode,
  });
  return { service, sendEmailCode, deliveredCode: () => deliveredCode };
}

async function issueInvite(
  service: ReturnType<typeof buildService>['service'],
  invitedEmail = 'patient@example.test',
) {
  return service.issue({
    organizationId,
    patientUserId,
    invitedEmail,
    createdByPlatformUserId: staffUserId,
  });
}

async function exchange(service: ReturnType<typeof buildService>['service']) {
  const issued = await issueInvite(service);
  expect(issued.ok).toBe(true);
  if (!issued.ok) throw new Error('invite issue failed');
  const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
  expect(exchanged.ok).toBe(true);
  if (!exchanged.ok) throw new Error('invite exchange failed');
  return { issued, exchanged };
}

beforeEach(() => {
  resetInMemoryPatientInvitesForTests();
  setInMemoryPatientInviteEnrollmentForTests({ organizationId, patientUserId, status: 'invited' });
});

describe('patient invite activation', () => {
  it('stores purpose-separated hashes and exposes the bearer only in the URL fragment', async () => {
    const { service } = buildService();
    const issued = await issueInvite(service);

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const bearer = bearerFrom(issued.relativeUrl);
    expect(issued.relativeUrl).toMatch(/^\/join\/start#[A-Za-z0-9_-]{40,}$/);
    expect(issued.invite).not.toHaveProperty('tokenHash');
    expect(hashPatientInviteBearer(bearer)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPatientInviteBearer(bearer)).not.toBe(bearer);
    expect(hashPatientInviteBearer(bearer)).not.toBe(hashPatientInviteContinuation(bearer));
  });

  it('requires an explicit recipient email', async () => {
    const { service } = buildService();
    await expect(issueInvite(service, '')).resolves.toEqual({
      ok: false,
      code: 'missing_recipient',
    });
  });

  it('supersedes the old bearer only after the replacement exists', async () => {
    const { service } = buildService();
    const first = await issueInvite(service);
    const second = await issueInvite(service);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await expect(service.exchangeBearer(bearerFrom(first.relativeUrl))).resolves.toEqual({
      ok: false,
      code: 'superseded_token',
    });
    await expect(service.exchangeBearer(bearerFrom(second.relativeUrl))).resolves.toMatchObject({
      ok: true,
      kind: 'patient',
    });
  });

  it('exchanges a raw bearer exactly once', async () => {
    const { service } = buildService();
    const issued = await issueInvite(service);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const bearer = bearerFrom(issued.relativeUrl);
    await expect(service.exchangeBearer(bearer)).resolves.toMatchObject({ ok: true });
    await expect(service.exchangeBearer(bearer)).resolves.toEqual({
      ok: false,
      code: 'exchanged_token',
    });
  });

  it('keeps terminal continuation state truthful after revoke', async () => {
    const { service } = buildService();
    const { issued, exchanged } = await exchange(service);
    await expect(
      service.revoke({
        organizationId,
        patientUserId,
        inviteId: issued.invite.id,
        revokedByPlatformUserId: staffUserId,
      }),
    ).resolves.toBe(true);
    await expect(service.lookupContinuation(exchanged.continuation)).resolves.toEqual({
      ok: false,
      code: 'revoked_token',
    });
  });

  it('keeps a legacy active relationship unlinked until explicit invite proof', async () => {
    setInMemoryPatientInviteEnrollmentForTests({ organizationId, patientUserId, status: 'active' });
    const { service } = buildService();
    await expect(service.getPortalStatus(organizationId, patientUserId)).resolves.toMatchObject({
      status: 'not_activated',
    });
    await expect(issueInvite(service)).resolves.toMatchObject({ ok: true });
  });

  it('rejects an email that differs from the bound recipient', async () => {
    const { service, sendEmailCode } = buildService();
    const { exchanged } = await exchange(service);

    await expect(
      service.startEmailProof(exchanged.continuation, 'other@example.test'),
    ).resolves.toEqual({
      ok: false,
      code: 'wrong_recipient',
    });
    expect(sendEmailCode).not.toHaveBeenCalled();
  });

  it('activates only after purpose-scoped OTP proof and canonical identity resolution', async () => {
    const { service, sendEmailCode, deliveredCode } = buildService();
    const { exchanged } = await exchange(service);

    await expect(
      service.startEmailProof(exchanged.continuation, 'PATIENT@example.test'),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(sendEmailCode).toHaveBeenCalledWith(
      'patient@example.test',
      expect.stringMatching(/^\d{6}$/),
    );
    await expect(
      service.verifyEmailProof(exchanged.continuation, 'patient@example.test', deliveredCode()),
    ).resolves.toEqual({ ok: true });
    await expect(service.redeemEmailProof(exchanged.continuation, patientUserId)).resolves.toEqual({
      ok: true,
      organizationId,
    });
    await expect(service.getPortalStatus(organizationId, patientUserId)).resolves.toMatchObject({
      status: 'linked',
    });
  });

  it('does not let another resolved identity redeem a valid proof', async () => {
    const { service, deliveredCode } = buildService();
    const { exchanged } = await exchange(service);
    await service.startEmailProof(exchanged.continuation, 'patient@example.test');
    await service.verifyEmailProof(exchanged.continuation, 'patient@example.test', deliveredCode());
    await expect(service.redeemEmailProof(exchanged.continuation, otherUserId)).resolves.toEqual({
      ok: false,
      code: 'conflicting_identity',
    });
  });

  it('allows exactly one success when redemption races', async () => {
    const { service, deliveredCode } = buildService();
    const { exchanged } = await exchange(service);
    await service.startEmailProof(exchanged.continuation, 'patient@example.test');
    await service.verifyEmailProof(exchanged.continuation, 'patient@example.test', deliveredCode());

    const results = await Promise.all([
      service.redeemEmailProof(exchanged.continuation, patientUserId),
      service.redeemEmailProof(exchanged.continuation, patientUserId),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });
});
