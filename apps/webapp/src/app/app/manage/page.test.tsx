/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const loadManagementWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("./loadManagementWorkspace", () => ({
  loadManagementWorkspace: () => loadManagementWorkspaceMock(),
}));

import ManagementPage from "./page";

function workspace(specialistId: string | null) {
  return {
    organizationName: "Практика Берсона",
    workspace: {
      session: {
        user: {
          userId: "00000000-0000-4000-8000-000000000001",
          role: "doctor" as const,
          displayName: "Owner",
          bindings: {},
        },
      },
      organizationId: "00000000-0000-4000-8000-000000000002",
      membershipId: "00000000-0000-4000-8000-000000000003",
      membershipRole: "owner" as const,
      specialistId,
      canManageOrganization: true,
      canManageAllSpecialists: true,
      canAccessClinicalWorkspace: specialistId !== null,
      capabilities: specialistId
        ? (["organization.management", "clinical.workspace", "account.self"] as const)
        : (["organization.management", "account.self"] as const),
    },
  };
}

describe("ManagementPage", () => {
  beforeEach(() => {
    loadManagementWorkspaceMock.mockReset();
  });

  it("renders one practice context and no clinical links for a management-only owner", async () => {
    loadManagementWorkspaceMock.mockResolvedValue(workspace(null));
    const html = renderToStaticMarkup(await ManagementPage());

    expect(html).toContain("Практика · Практика Берсона");
    expect(html).toContain('href="/app/settings?tab=organization"');
    expect(html).toContain('href="/app/account"');
    expect(html).not.toContain('href="/app/doctor"');
    expect(html).not.toContain('href="/app/doctor/schedule?tab=setup"');
  });

  it("offers explicit clinical transitions only when a specialist binding exists", async () => {
    loadManagementWorkspaceMock.mockResolvedValue(workspace("00000000-0000-4000-8000-000000000004"));
    const html = renderToStaticMarkup(await ManagementPage());

    expect(html).toContain('href="/app/doctor"');
    expect(html).toContain('href="/app/doctor/schedule?tab=setup"');
  });
});
