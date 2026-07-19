import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDoctorWorkspaceContextMock, updateSettingMock } = vi.hoisted(() => ({
  requireDoctorWorkspaceContextMock: vi.fn(),
  updateSettingMock: vi.fn().mockResolvedValue({}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, run: () => unknown) => run(),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { updateSetting: updateSettingMock },
  }),
}));

import {
  savePatientHomePracticeTargetAction,
  savePatientHomeRepeatCooldownsAction,
} from "./patientHomeDoctorSettingsActions";

const ownerContext = {
  session: { user: { userId: "owner-1", role: "doctor" } },
  organizationId: "org-1",
  membershipId: "membership-1",
  membershipRole: "owner",
  specialistId: "specialist-1",
  canManageOrganization: true,
  canManageAllSpecialists: true,
  canAccessClinicalWorkspace: true,
  capabilities: ["organization.management", "clinical.workspace"],
};

describe("patient-home owner server actions", () => {
  beforeEach(() => {
    requireDoctorWorkspaceContextMock.mockReset();
    updateSettingMock.mockReset();
    updateSettingMock.mockResolvedValue({});
    requireDoctorWorkspaceContextMock.mockResolvedValue(ownerContext);
  });

  it("fails closed for an ordinary specialist", async () => {
    requireDoctorWorkspaceContextMock.mockResolvedValue({
      ...ownerContext,
      session: { user: { userId: "doctor-1", role: "doctor" } },
      membershipRole: "doctor",
      canManageOrganization: false,
    });
    await expect(savePatientHomePracticeTargetAction(3)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("allows an owner to save both repeat cooldowns in the organization", async () => {
    await expect(savePatientHomeRepeatCooldownsAction({ warmupRepeatMinutes: 30, planItemRepeatMinutes: 45 })).resolves.toEqual({ ok: true });
    expect(updateSettingMock).toHaveBeenCalledTimes(2);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_daily_warmup_repeat_cooldown_minutes", "admin", { value: 30 }, "owner-1", { organizationId: "org-1" },
    );
  });

  it("keeps repeat cooldowns available to an ordinary specialist", async () => {
    requireDoctorWorkspaceContextMock.mockResolvedValue({
      ...ownerContext,
      session: { user: { userId: "doctor-1", role: "doctor" } },
      membershipRole: "doctor",
      canManageOrganization: false,
    });

    await expect(
      savePatientHomeRepeatCooldownsAction({ warmupRepeatMinutes: 20, planItemRepeatMinutes: 30 }),
    ).resolves.toEqual({ ok: true });
    expect(updateSettingMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a platform admin without a clinical workspace", async () => {
    requireDoctorWorkspaceContextMock.mockRejectedValue(new Error("forbidden"));
    await expect(savePatientHomePracticeTargetAction(4)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(updateSettingMock).not.toHaveBeenCalled();
  });
});
