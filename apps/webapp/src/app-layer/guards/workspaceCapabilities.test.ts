import { describe, expect, it } from "vitest";
import { resolveLaunchCapabilities } from "./workspaceCapabilities";

describe("resolveLaunchCapabilities — new-clinic-owner provisioning facts", () => {
  it("grants clinical.workspace once provisioning binds a real specialist id to the fresh owner membership", () => {
    // Facts app.provision_specialist_owner() now produces in the SAME transaction as the
    // organization/membership (deploy/postgres/specialist-owner-provisioning-rls.sql): an
    // "owner" membership whose specialist_id is a real, non-null be_specialists row id.
    // Verified end to end on a disposable DB: SELECT * FROM app.provision_specialist_owner(...)
    // returned specialist_id = '577107f1-b97a-40a5-aab3-00e878e6e404' for a fresh signup.
    const capabilities = resolveLaunchCapabilities({
      sessionRole: "doctor",
      membershipRole: "owner",
      specialistId: "577107f1-b97a-40a5-aab3-00e878e6e404",
    });

    expect(capabilities.has("clinical.workspace")).toBe(true);
    expect(capabilities).toEqual(
      new Set(["account.self", "organization.management", "clinical.workspace"]),
    );
  });

  it("documents the pre-fix defect: the same owner membership with a NULL specialist id has no clinical.workspace", () => {
    // This is exactly the live-DB row the owner reported: role "owner", status "active",
    // specialist_id IS NULL. Left here so a future regression that reintroduces a NULL
    // specialist_id at provisioning time is caught by this same assertion flipping.
    const capabilities = resolveLaunchCapabilities({
      sessionRole: "doctor",
      membershipRole: "owner",
      specialistId: null,
    });

    expect(capabilities.has("clinical.workspace")).toBe(false);
    expect(capabilities).toEqual(new Set(["account.self", "organization.management"]));
  });
});
