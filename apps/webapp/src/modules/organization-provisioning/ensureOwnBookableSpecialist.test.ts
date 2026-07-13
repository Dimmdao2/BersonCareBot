import { describe, expect, it, vi } from "vitest";
import type { OrganizationProvisioningPort } from "./ports";
import { ensureOwnBookableSpecialist } from "./ensureOwnBookableSpecialist";

function createPort(): OrganizationProvisioningPort {
  return {
    createSpecialistSignupIntent: vi.fn(async () => undefined),
    getPendingSpecialistSignupIntent: vi.fn(async () => null),
    getSpecialistSignupIntentByChallengeId: vi.fn(async () => null),
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

describe("ensureOwnBookableSpecialist", () => {
  it("short-circuits when the workspace context already has a specialist", async () => {
    const port = createPort();

    await expect(
      ensureOwnBookableSpecialist(port, {
        organizationId: "org-1",
        membershipId: "membership-1",
        membershipRole: "owner",
        specialistId: "specialist-existing",
        displayName: "Doctor Owner",
      }),
    ).resolves.toBe("specialist-existing");
    expect(port.ensureOwnBookableSpecialist).not.toHaveBeenCalled();
  });

  it("does not create a specialist for admin by default", async () => {
    const port = createPort();

    await expect(
      ensureOwnBookableSpecialist(port, {
        organizationId: "org-1",
        membershipId: "membership-1",
        membershipRole: "admin",
        specialistId: null,
        displayName: "Clinic Admin",
      }),
    ).resolves.toBeNull();
    expect(port.ensureOwnBookableSpecialist).not.toHaveBeenCalled();
  });

  it("creates a specialist for owner by default", async () => {
    const port = createPort();

    await expect(
      ensureOwnBookableSpecialist(port, {
        organizationId: "org-1",
        membershipId: "membership-1",
        membershipRole: "owner",
        specialistId: null,
        displayName: " Doctor  Owner ",
      }),
    ).resolves.toBe("specialist-1");
    expect(port.ensureOwnBookableSpecialist).toHaveBeenCalledWith({
      organizationId: "org-1",
      membershipId: "membership-1",
      fullName: "Doctor  Owner",
    });
  });
});
