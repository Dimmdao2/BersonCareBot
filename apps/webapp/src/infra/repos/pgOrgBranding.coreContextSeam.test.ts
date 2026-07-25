/**
 * The core-context read of the PostgreSQL branding port must go through the 0238 SECURITY DEFINER
 * accessor and must NOT touch any table the calling role may not hold privileges on.
 *
 * Why this test exists: the independent adversarial audit (2026-07-25, HIGH 1) proved the shipped
 * version read `public.be_organizations` directly, which is impossible for app_patient (SQLSTATE
 * 42501 — no privileges) and returns zero rows even with a grant (FORCE RLS, read policies for
 * {app_staff} / {app_platform_settings} only). The resolver would then have thrown
 * `org_branding_core_context_unavailable` instead of degrading to platform visuals + the canonical
 * organization name, i.e. the exact §3.3 invariant the contract forbids breaking.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgText = vi.fn();
const runWebappTransaction = vi.fn();

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgText(...args),
  runWebappTransaction: (...args: unknown[]) => runWebappTransaction(...args),
}));

const { createPgOrgBrandingPort } = await import("@/infra/repos/pgOrgBranding");

const ORG = "aaaa0000-0000-4000-8000-00000000000a";

beforeEach(() => {
  runWebappPgText.mockReset();
  runWebappTransaction.mockReset();
});

describe("pgOrgBranding.getCoreContext", () => {
  it("reads the canonical organization name through app.read_org_brand_core_context()", async () => {
    runWebappPgText.mockResolvedValue({
      rows: [{ organization_id: ORG, display_name: "Clinic A canonical core name", is_active: true }],
    });

    const core = await createPgOrgBrandingPort().getCoreContext(ORG);

    expect(core).toEqual({
      organizationId: ORG,
      displayName: "Clinic A canonical core name",
      isActive: true,
    });
    const [sqlText, params] = runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("app.read_org_brand_core_context($1::uuid)");
    // No caller-privilege dependency: no direct read of be_organizations (or any other table).
    expect(sqlText).not.toContain("be_organizations");
    expect(sqlText).not.toMatch(/\borg_enrollments\b/);
    expect(params).toEqual([ORG]);
  });

  it("stays fail-closed: zero rows from the accessor means 'no core context', not a guess", async () => {
    runWebappPgText.mockResolvedValue({ rows: [] });
    await expect(createPgOrgBrandingPort().getCoreContext(ORG)).resolves.toBeNull();
  });
});
