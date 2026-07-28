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
      organizationSlug: "clinic",
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
      specialistId: "specialist-1",
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
      organizationSlug: "Clinic One",
      specialistFullName: "  Doctor   Owner ",
    });

    expect(port.createSpecialistSignupIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationTitle: "Clinic One",
        organizationSlug: "clinic-one",
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

    // Changed because successful owner provisioning now commits the owner specialist in the same transaction.
    await expect(
      service.provisionSpecialistOwner({ challengeId: "challenge-1" }),
    ).resolves.toEqual({
      organizationId: "org-1",
      specialistId: "specialist-1",
      membershipId: "membership-1",
    });
    expect(port.provisionSpecialistOwner).toHaveBeenCalledWith({
      challengeId: "challenge-1",
    });
  });

});
