/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

const loadManagementWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("./loadManagementWorkspace", () => ({
  loadManagementWorkspace: () => loadManagementWorkspaceMock(),
}));

import ManagementPage from "./page";

function workspace(specialistId: string | null, clinicTeamEnabled = false) {
  return {
    organizationName: "Практика Берсона",
    clinicTeamEnabled,
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
    expect(html).toContain('href="/app/settings?tab=billing"');
    expect(html).not.toContain('href="/app/settings?tab=team"');
    expect(html).not.toContain('href="/app/doctor"');
    expect(html).not.toContain('href="/app/doctor/schedule?tab=setup"');
  });

  it("offers explicit clinical transitions only when a specialist binding exists", async () => {
    loadManagementWorkspaceMock.mockResolvedValue(workspace("00000000-0000-4000-8000-000000000004"));
    const html = renderToStaticMarkup(await ManagementPage());

    expect(html).toContain('href="/app/doctor"');
    expect(html).toContain('href="/app/doctor/schedule?tab=setup"');
  });

  it("makes the existing Team surface discoverable only when the entitlement is enabled", async () => {
    loadManagementWorkspaceMock.mockResolvedValue(workspace(null, true));
    const html = renderToStaticMarkup(await ManagementPage());

    expect(html).toContain('href="/app/settings?tab=team"');
  });

  it("uses the server-safe button variant module", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('from "@/shared/ui/doctor/primitives/button-variants"');
    expect(source).not.toContain('from "@/shared/ui/doctor/primitives/button"');
  });
});
