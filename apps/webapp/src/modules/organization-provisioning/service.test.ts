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
    provisionSpecialistOwner: vi.fn(async () => ({
      organizationId: "org-1",
      specialistId: "specialist-1",
      membershipId: "membership-1",
    })),
  };
}

describe("createOrganizationProvisioningService", () => {
  it("normalizes and stores specialist signup intent data", async () => {
    const port = createPort();
    const service = createOrganizationProvisioningService({ provisioningPort: port });

    await service.createSpecialistSignupIntent({
      userId: "user-1",
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
      service.provisionSpecialistOwner({ userId: "user-1", challengeId: "challenge-1" }),
    ).rejects.toThrow("specialist_signup_intent_not_found");
    expect(port.provisionSpecialistOwner).toHaveBeenCalledWith({
      userId: "user-1",
      challengeId: "challenge-1",
    });
  });

  it("delegates provisioning and replay idempotency to the transactional port", async () => {
    const port = createPort();
    const service = createOrganizationProvisioningService({ provisioningPort: port });

    await expect(
      service.provisionSpecialistOwner({ userId: "user-1", challengeId: "challenge-1" }),
    ).resolves.toEqual({
      organizationId: "org-1",
      specialistId: "specialist-1",
      membershipId: "membership-1",
    });
    expect(port.provisionSpecialistOwner).toHaveBeenCalledWith({
      userId: "user-1",
      challengeId: "challenge-1",
    });
  });
});
