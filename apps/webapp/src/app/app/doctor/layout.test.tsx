/** @vitest-environment node */

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getOrganization: vi.fn(),
  listSettingsByScope: vi.fn(),
  getTariffForOrg: vi.fn(),
  listOverrides: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requireOrganizationWorkspaceContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: mocks.getCurrentSession }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireOrganizationWorkspaceContext: mocks.requireOrganizationWorkspaceContext,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingEngine: { organization: { getOrganization: mocks.getOrganization } },
    systemSettings: { listSettingsByScope: mocks.listSettingsByScope },
    orgEntitlements: {
      getTariffForOrg: mocks.getTariffForOrg,
      listOverrides: mocks.listOverrides,
    },
  }),
}));
vi.mock("@/shared/ui/doctor/shell/DoctorWorkspaceShell", () => ({
  DoctorWorkspaceShell: (props: unknown) => props,
}));

import DoctorSectionLayout from "./layout";

const doctorSession = {
  user: {
    userId: "00000000-0000-4000-8000-000000000001",
    role: "doctor" as const,
    displayName: "Owner",
    bindings: {},
  },
};

function workspace(canAccessClinicalWorkspace: boolean) {
  return {
    session: doctorSession,
    organizationId: "00000000-0000-4000-8000-000000000002",
    membershipId: "00000000-0000-4000-8000-000000000003",
    membershipRole: "owner" as const,
    specialistId: canAccessClinicalWorkspace ? "00000000-0000-4000-8000-000000000004" : null,
    canManageOrganization: true,
    canManageAllSpecialists: true,
    canAccessClinicalWorkspace,
  };
}

describe("DoctorSectionLayout", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.redirect.mockImplementation((href: string) => {
      throw new Error(`redirect:${href}`);
    });
    mocks.getCurrentSession.mockResolvedValue(doctorSession);
    mocks.listSettingsByScope.mockResolvedValue([]);
    mocks.getTariffForOrg.mockResolvedValue({ mechanics: { courses: true }, includedSeats: null });
    mocks.listOverrides.mockResolvedValue([]);
  });

  it("routes a management-only owner to the management shell", async () => {
    mocks.requireOrganizationWorkspaceContext.mockResolvedValue(workspace(false));

    await expect(DoctorSectionLayout({ children: null })).rejects.toThrow("redirect:/app/manage");
    expect(mocks.getOrganization).not.toHaveBeenCalled();
  });

  it("keeps a bound owner clinical and passes the resolved practice name to the shell", async () => {
    mocks.requireOrganizationWorkspaceContext.mockResolvedValue(workspace(true));
    mocks.getOrganization.mockResolvedValue({ title: "Практика Берсона" });

    const element = (await DoctorSectionLayout({ children: null })) as ReactElement<{
      workspaceContext: { organizationName: string | null };
    }>;
    expect(element.props.workspaceContext.organizationName).toBe("Практика Берсона");
  });

  it("renders the clinical route for a valid dev-bypass doctor session", async () => {
    const devBypassDoctor = { ...doctorSession, authSource: "dev_bypass" as const };
    mocks.getCurrentSession.mockResolvedValue(devBypassDoctor);
    mocks.requireOrganizationWorkspaceContext.mockResolvedValue({
      ...workspace(true),
      session: devBypassDoctor,
    });
    mocks.getOrganization.mockResolvedValue({ title: "DEV UX Clinic" });

    const element = (await DoctorSectionLayout({ children: null })) as ReactElement<{
      userRole: string;
      workspaceContext: { organizationName: string | null };
    }>;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.props.userRole).toBe("doctor");
    expect(element.props.workspaceContext.organizationName).toBe("DEV UX Clinic");
  });
});
