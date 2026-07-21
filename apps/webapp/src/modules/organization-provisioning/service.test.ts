import { describe, expect, it, vi } from "vitest";
import type { OrganizationProvisioningPort } from "./ports";
import { createOrganizationProvisioningService } from "./service";

function createPort(): OrganizationProvisioningPort {
  return {
    createSpecialistSignupIntent: vi.fn(async () => undefined),
    getPendingSpecialistSignupIntent: vi.fn(async () => ({
      id: "intent-1",
      userId: "user-1",
      challengeId: "challenge-1",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic",
      specialistFullName: "Doctor Owner",
      status: "pending" as const,
      provisionedOrganizationId: null,
      provisionedSpecialistId: null,
      provisionedMembershipId: null,
    })),
    getSpecialistSignupIntentByChallengeId: vi.fn(async () => null),
    getLatestSpecialistSignupIntentForUser: vi.fn(async () => null),
    replacePendingSpecialistSignupChallenge: vi.fn(async () => false),
    provisionSpecialistOwner: vi.fn(async () => ({
      organizationId: "org-1",
      specialistId: null,
      membershipId: "membership-1",
    })),
    ensureOwnBookableSpecialist: vi.fn(async () => ({
      specialistId: "specialist-1",
      created: true,
    })),
  };
}

describe("createOrganizationProvisioningService", () => {
  it("normalizes and stores specialist signup intent data", async () => {
    const port = createPort();
    const service = createOrganizationProvisioningService({ provisioningPort: port });

    await service.createSpecialistSignupIntent({
      challengeId: "challenge-1",
      emailNormalized: "doctor@example.com",
      organizationTitle: "  Clinic   One ",
      specialistFullName: "  Doctor   Owner ",
    });

    expect(port.createSpecialistSignupIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationTitle: "Clinic One",
        specialistFullName: "Doctor Owner",
      }),
    );
  });

  it("lets the transactional port own absent-intent failures", async () => {
    const port = createPort();
    vi.mocked(port.provisionSpecialistOwner).mockRejectedValueOnce(new Error("specialist_signup_intent_not_found"));
    const service = createOrganizationProvisioningService({ provisioningPort: port });

    await expect(
      service.provisionSpecialistOwner({ challengeId: "challenge-1" }),
    ).rejects.toThrow("specialist_signup_intent_not_found");
    expect(port.provisionSpecialistOwner).toHaveBeenCalledWith({
      challengeId: "challenge-1",
    });
  });

  it("delegates provisioning and replay idempotency to the transactional port", async () => {
    const port = createPort();
    const service = createOrganizationProvisioningService({ provisioningPort: port });

    await expect(
      service.provisionSpecialistOwner({ challengeId: "challenge-1" }),
    ).resolves.toEqual({
      organizationId: "org-1",
      specialistId: null,
      membershipId: "membership-1",
    });
    expect(port.provisionSpecialistOwner).toHaveBeenCalledWith({
      challengeId: "challenge-1",
    });
  });

  it("applies the configured organization-provisioned trial idempotently after provisioning", async () => {
    const port = createPort();
    const startConfiguredTrial = vi.fn(async () => undefined);
    const service = createOrganizationProvisioningService({ provisioningPort: port, startConfiguredTrial });

    await service.provisionSpecialistOwner({ challengeId: "challenge-1" });

    expect(startConfiguredTrial).toHaveBeenCalledWith("org-1");
  });
});
