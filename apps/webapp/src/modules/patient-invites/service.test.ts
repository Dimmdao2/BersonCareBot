import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryPatientInvitesPort,
  resetInMemoryPatientInvitesForTests,
  setInMemoryPatientInviteEmailOwnerForTests,
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
  invitedEmail: string | null = 'patient@example.test',
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

  it('issues a channel-agnostic invite and claims the verified email on the same patient', async () => {
    const { service, deliveredCode } = buildService();
    const issued = await issueInvite(service, null);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.invite.recipientBinding).toBe('unbound_email_claim');
    const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
    expect(exchanged).toMatchObject({
      ok: true,
      preview: { recipientBinding: 'unbound_email_claim', recipientHint: null },
    });
    if (!exchanged.ok) return;
    await expect(
      service.startEmailProof(exchanged.continuation, 'NEW@example.test'),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      service.verifyEmailProof(exchanged.continuation, 'new@example.test', deliveredCode()),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.claimUnboundEmailProof(exchanged.continuation, 'new@example.test'),
    ).resolves.toEqual({ ok: true, organizationId, patientUserId });
    await expect(service.getPortalStatus(organizationId, patientUserId)).resolves.toMatchObject({
      status: 'linked',
    });
  });

  it('reopens the same accepted unbound claim after a post-commit session failure', async () => {
    const { service, deliveredCode } = buildService();
    const issued = await issueInvite(service, null);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    await service.startEmailProof(exchanged.continuation, 'retry@example.test');
    const code = deliveredCode();
    await expect(
      service.verifyEmailProof(exchanged.continuation, 'retry@example.test', code),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.claimUnboundEmailProof(exchanged.continuation, 'retry@example.test'),
    ).resolves.toEqual({ ok: true, organizationId, patientUserId });

    // The database commit may succeed before the route can persist its session cookie. The same
    // still-valid invite proof must therefore converge on the already-claimed canonical identity.
    await expect(
      service.verifyEmailProof(exchanged.continuation, 'retry@example.test', code),
    ).resolves.toEqual({ ok: true });
    await expect(service.lookupContinuation(exchanged.continuation)).resolves.toMatchObject({
      ok: true,
      preview: { recipientBinding: 'unbound_email_claim' },
    });
    const retries = await Promise.all([
      service.claimUnboundEmailProof(exchanged.continuation, 'retry@example.test'),
      service.claimUnboundEmailProof(exchanged.continuation, 'retry@example.test'),
    ]);
    expect(retries).toEqual([
      { ok: true, organizationId, patientUserId },
      { ok: true, organizationId, patientUserId },
    ]);

    await expect(
      service.verifyEmailProof(exchanged.continuation, 'retry@example.test', '000000'),
    ).resolves.toEqual({ ok: false, code: 'invalid_code' });
    await expect(
      service.claimUnboundEmailProof(exchanged.continuation, 'other@example.test'),
    ).resolves.toEqual({ ok: false, code: 'conflicting_identity' });
  });

  it('rejects an unbound claim when the verified email belongs to another identity', async () => {
    const { service, deliveredCode } = buildService();
    setInMemoryPatientInviteEmailOwnerForTests('owned@example.test', otherUserId);
    const issued = await issueInvite(service, null);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;
    await service.startEmailProof(exchanged.continuation, 'owned@example.test');
    await service.verifyEmailProof(exchanged.continuation, 'owned@example.test', deliveredCode());
    await expect(
      service.claimUnboundEmailProof(exchanged.continuation, 'owned@example.test'),
    ).resolves.toEqual({ ok: false, code: 'conflicting_identity' });
    await expect(service.getPortalStatus(organizationId, patientUserId)).resolves.toMatchObject({
      status: 'invited',
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
