import { describe, expect, it } from "vitest";
import { reconcileDevClinicAdminWorkspace } from "./devBypassClinicAdminWorkspaceReconciliation";

describe("reconcileDevClinicAdminWorkspace", () => {
  const input = {
    platformUserId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    displayName: "Demo Clinic Owner",
  };

  it("is stable across two consecutive reconciliation runs", () => {
    const first = reconcileDevClinicAdminWorkspace(input);
    const second = reconcileDevClinicAdminWorkspace(input);
    expect(second).toEqual(first);
  });

  it("returns exact desired ownership and presentation after corrupted stored state", () => {
    const corrupted = {
      organization: { id: "wrong", title: "Wrong", isActive: false, sortOrder: 99 },
      specialist: {
        id: "wrong",
        organizationId: "foreign-org",
        fullName: "Wrong",
        isActive: false,
        sortOrder: 99,
      },
    };

    const repaired = { ...corrupted, ...reconcileDevClinicAdminWorkspace(input) };

    expect(repaired.organization).toEqual({
      id: "d0000000-0000-4000-8000-000000000004",
      title: "DEV UX Clinic",
      isActive: true,
      sortOrder: 0,
    });
    expect(repaired.specialist).toEqual({
      id: "d0000000-0000-4000-8000-000000000005",
      organizationId: "d0000000-0000-4000-8000-000000000004",
      fullName: "Demo Clinic Owner",
      isActive: true,
      sortOrder: 0,
    });
    expect(repaired.membership).toMatchObject({
      platformUserId: input.platformUserId,
      role: "owner",
      status: "active",
    });
  });
});
