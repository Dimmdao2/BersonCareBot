import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, resolveOrganizationForUserMock, updateSettingMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  resolveOrganizationForUserMock: vi.fn(),
  updateSettingMock: vi.fn().mockResolvedValue({}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, run: () => unknown) => run(),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    organizationMembership: { resolveOrganizationForUser: resolveOrganizationForUserMock },
    systemSettings: { updateSetting: updateSettingMock },
  }),
}));

import {
  savePatientHomePracticeTargetAction,
  savePatientHomeRepeatCooldownsAction,
} from "./patientHomeDoctorSettingsActions";

const ownerContext = {
  ok: true,
  context: {
    organizationId: "org-1",
    membershipId: "membership-1",
    role: "owner",
    specialistId: null,
    canManageOrganization: true,
    canManageAllSpecialists: true,
  },
};

describe("patient-home owner server actions", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveOrganizationForUserMock.mockReset();
    updateSettingMock.mockReset();
    updateSettingMock.mockResolvedValue({});
    resolveOrganizationForUserMock.mockResolvedValue(ownerContext);
  });

  it("fails closed for an ordinary specialist", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "doctor-1", role: "doctor" } });
    resolveOrganizationForUserMock.mockResolvedValue({
      ...ownerContext,
      context: { ...ownerContext.context, role: "doctor", canManageOrganization: false },
    });
    await expect(savePatientHomePracticeTargetAction(3)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("allows an owner to save both repeat cooldowns in the organization", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "owner-1", role: "doctor" } });
    await expect(savePatientHomeRepeatCooldownsAction({ warmupRepeatMinutes: 30, planItemRepeatMinutes: 45 })).resolves.toEqual({ ok: true });
    expect(updateSettingMock).toHaveBeenCalledTimes(2);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_daily_warmup_repeat_cooldown_minutes", "admin", { value: 30 }, "owner-1", { organizationId: "org-1" },
    );
  });

  it("keeps repeat cooldowns available to an ordinary specialist", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "doctor-1", role: "doctor" } });
    resolveOrganizationForUserMock.mockResolvedValue({
      ...ownerContext,
      context: { ...ownerContext.context, role: "doctor", canManageOrganization: false },
    });

    await expect(
      savePatientHomeRepeatCooldownsAction({ warmupRepeatMinutes: 20, planItemRepeatMinutes: 30 }),
    ).resolves.toEqual({ ok: true });
    expect(updateSettingMock).toHaveBeenCalledTimes(2);
  });

  it("allows a global admin in admin mode without widening ordinary specialist access", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "admin-1", role: "admin" }, adminMode: true });
    resolveOrganizationForUserMock.mockResolvedValue({
      ...ownerContext,
      context: { ...ownerContext.context, role: "doctor", canManageOrganization: false },
    });
    await expect(savePatientHomePracticeTargetAction(4)).resolves.toEqual({ ok: true });
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_home_daily_practice_target",
      "admin",
      { value: 4 },
      "admin-1",
      { organizationId: "org-1" },
    );
  });
});
