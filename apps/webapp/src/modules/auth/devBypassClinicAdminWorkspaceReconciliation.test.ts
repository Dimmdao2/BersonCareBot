import { describe, expect, it } from "vitest";
import {
  DEV_CLINIC_ADMIN_ORGANIZATION_ID,
  DEV_CLINIC_ADMIN_SPECIALIST_ID,
  DEV_DOCTOR_SPECIALIST_ID,
  reconcileDevBypassStaffWorkspace,
  type DevBypassStaffWorkspaceKind,
} from "./devBypassClinicAdminWorkspaceReconciliation";

describe("reconcileDevBypassStaffWorkspace", () => {
  const input = {
    platformUserId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    displayName: "Demo Clinic Owner",
    kind: "clinic_admin" as const,
  };

  it("is stable across two consecutive reconciliation runs", () => {
    const first = reconcileDevBypassStaffWorkspace(input);
    const second = reconcileDevBypassStaffWorkspace(input);
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

    const repaired = { ...corrupted, ...reconcileDevBypassStaffWorkspace(input) };

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

  it.each<{
    kind: DevBypassStaffWorkspaceKind;
    role: "owner" | "doctor" | "assistant";
    specialistId: string | null;
  }>([
    {
      kind: "doctor",
      role: "doctor",
      specialistId: DEV_DOCTOR_SPECIALIST_ID,
    },
    {
      kind: "clinic_admin",
      role: "owner",
      specialistId: DEV_CLINIC_ADMIN_SPECIALIST_ID,
    },
    {
      kind: "global_admin",
      role: "assistant",
      specialistId: null,
    },
  ])("projects the exact $kind membership for a fresh workspace", ({ kind, role, specialistId }) => {
    const state = reconcileDevBypassStaffWorkspace({
      platformUserId: input.platformUserId,
      displayName: input.displayName,
      kind,
    });

    expect(state.organization.id).toBe(DEV_CLINIC_ADMIN_ORGANIZATION_ID);
    expect(state.membership).toEqual({
      organizationId: DEV_CLINIC_ADMIN_ORGANIZATION_ID,
      platformUserId: input.platformUserId,
      role,
      specialistId,
      status: "active",
    });
    expect(state.specialist?.id ?? null).toBe(specialistId);
  });
});
