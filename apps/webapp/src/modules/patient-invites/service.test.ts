import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryPatientInvitesPort,
  resetInMemoryPatientInvitesForTests,
  setInMemoryPatientInviteEnrollmentForTests,
} from "@/infra/repos/inMemoryPatientInvites";
import {
  createPatientInvitesService,
  hashPatientInviteBearer,
  hashPatientInviteContinuation,
} from "./service";

const organizationId = "00000000-0000-4000-8000-000000000001";
const patientUserId = "00000000-0000-4000-8000-000000000002";
const staffUserId = "00000000-0000-4000-8000-000000000003";

function bearerFrom(relativeUrl: string): string {
  return relativeUrl.split("#")[1] ?? "";
}

function buildService() {
  const startEmailChallenge = vi.fn(async () => ({
    ok: true as const,
    challengeId: "challenge-1",
    retryAfterSeconds: 30,
  }));
  const consumeEmailChallenge = vi.fn(async (_userId: string, _challengeId: string, code: string) =>
    code === "123456"
      ? ({ ok: true as const } as const)
      : ({ ok: false as const, code: "invalid_code" as const } as const),
  );
  const service = createPatientInvitesService({
    port: createInMemoryPatientInvitesPort(),
    startEmailChallenge,
    consumeEmailChallenge,
  });
  return { service, startEmailChallenge, consumeEmailChallenge };
}

async function issueInvite(service: ReturnType<typeof buildService>["service"], invitedEmail = "patient@example.test") {
  return service.issue({
    organizationId,
    patientUserId,
    invitedEmail,
    createdByPlatformUserId: staffUserId,
  });
}

beforeEach(() => {
  resetInMemoryPatientInvitesForTests();
  setInMemoryPatientInviteEnrollmentForTests({ organizationId, patientUserId, status: "invited" });
});

describe("patient invite activation", () => {
  it("stores purpose-separated hashes and exposes the bearer only in the URL fragment", async () => {
    const { service } = buildService();
    const issued = await issueInvite(service);

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const bearer = bearerFrom(issued.relativeUrl);
    expect(issued.relativeUrl).toMatch(/^\/join\/start#[A-Za-z0-9_-]{40,}$/);
    expect(issued.invite).not.toHaveProperty("tokenHash");
    expect(hashPatientInviteBearer(bearer)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPatientInviteBearer(bearer)).not.toBe(bearer);
    expect(hashPatientInviteBearer(bearer)).not.toBe(hashPatientInviteContinuation(bearer));
  });

  it("supersedes the old bearer when a new invitation is issued", async () => {
    const { service } = buildService();
    const first = await issueInvite(service);
    const second = await issueInvite(service);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await expect(service.exchangeBearer(bearerFrom(first.relativeUrl))).resolves.toEqual({
      ok: false,
      code: "superseded_token",
    });
    await expect(service.exchangeBearer(bearerFrom(second.relativeUrl))).resolves.toMatchObject({
      ok: true,
      kind: "patient",
    });
  });

  it("revokes an exact pending invitation", async () => {
    const { service } = buildService();
    const issued = await issueInvite(service);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    await expect(
      service.revoke({
        organizationId,
        patientUserId,
        inviteId: issued.invite.id,
        revokedByPlatformUserId: staffUserId,
      }),
    ).resolves.toBe(true);
    await expect(service.exchangeBearer(bearerFrom(issued.relativeUrl))).resolves.toEqual({
      ok: false,
      code: "revoked_token",
    });
  });

  it("rejects an email that differs from the bound recipient", async () => {
    const { service, startEmailChallenge } = buildService();
    const issued = await issueInvite(service);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    await expect(service.startEmailProof(exchanged.continuation, "other@example.test")).resolves.toEqual({
      ok: false,
      code: "wrong_recipient",
    });
    expect(startEmailChallenge).not.toHaveBeenCalled();
  });

  it("activates the exact invited relationship after a valid email proof", async () => {
    const { service, startEmailChallenge, consumeEmailChallenge } = buildService();
    const issued = await issueInvite(service);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    await expect(service.startEmailProof(exchanged.continuation, "PATIENT@example.test")).resolves.toEqual({
      ok: true,
      retryAfterSeconds: 30,
    });
    await expect(service.redeemEmailProof(exchanged.continuation, "123456")).resolves.toEqual({
      ok: true,
      platformUserId: patientUserId,
      organizationId,
    });
    await expect(service.getPortalStatus(organizationId, patientUserId)).resolves.toMatchObject({ status: "linked" });
    expect(startEmailChallenge).toHaveBeenCalledWith(patientUserId, "patient@example.test");
    expect(consumeEmailChallenge).toHaveBeenCalledWith(patientUserId, "challenge-1", "123456");
  });

  it("allows exactly one success when redemption races", async () => {
    const { service } = buildService();
    const issued = await issueInvite(service);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const exchanged = await service.exchangeBearer(bearerFrom(issued.relativeUrl));
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;
    await service.startEmailProof(exchanged.continuation, "patient@example.test");

    const results = await Promise.all([
      service.redeemEmailProof(exchanged.continuation, "123456"),
      service.redeemEmailProof(exchanged.continuation, "123456"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });
});
