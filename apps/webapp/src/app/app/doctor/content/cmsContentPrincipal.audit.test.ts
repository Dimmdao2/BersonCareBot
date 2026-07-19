import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const cmsLegacyActionFiles = [
  "src/app/app/doctor/content/actions.ts",
  "src/app/app/doctor/content/sections/actions.ts",
];

describe("CMS content legacy actions workspace principal coverage", () => {
  it.each(cmsLegacyActionFiles)("%s uses selected workspace principal for legacy write actions", (file) => {
    const src = readSource(file);
    expect(src).not.toContain("requireDoctorAccess");
    expect(src).toContain("requireDoctorWorkspaceContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it("content page writes require principal-aware mutation transactions and org stamps", () => {
    const src = readSource("src/infra/repos/pgContentPages.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
    expect(src).not.toContain("db.transaction(async");
  });

  it("content section writes require principal-aware mutation transactions and org stamps", () => {
    const src = readSource("src/infra/repos/pgContentSections.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
    expect(src).not.toContain("db.transaction(async");
  });

  it("bounds two-organization page reads while retaining the anonymous public fallback", () => {
    const src = readSource("src/infra/repos/pgContentPages.ts");
    expect(src).toContain("function currentReadOrganizationId()");
    expect(src).toContain("eq(contentPages.organizationId, organizationId)");
    expect(src).toContain("async listBySection(section, opts?: ListContentPagesBySectionOpts)");
    expect(src).toContain("async getBySlug(slug)");
    expect(src).toContain("async getById(id)");
    expect(src).toContain("async listAll()");
    expect(src).toContain("...(organizationId ? [eq(contentPages.organizationId, organizationId)] : [])");
  });

  it("bounds two-organization section and slug-history reads while retaining the anonymous public fallback", () => {
    const src = readSource("src/infra/repos/pgContentSections.ts");
    expect(src).toContain("function currentReadOrganizationId()");
    expect(src).toContain("eq(contentSections.organizationId, organizationId)");
    expect(src).toContain("eq(contentSectionSlugHistory.organizationId, organizationId)");
    expect(src).toContain("async listVisible(opts?: ListVisibleContentSectionsOpts)");
    expect(src).toContain("async listAll(filter?: ContentSectionsListFilter)");
    expect(src).toContain("async getBySlug(slug)");
  });

  it("gates CMS list, direct pages and formerly ungated actions with cms_pages", () => {
    const paths = [
      "src/app/app/doctor/content/page.tsx",
      "src/app/app/doctor/content/new/page.tsx",
      "src/app/app/doctor/content/edit/[id]/page.tsx",
      "src/app/app/doctor/content/sections/new/page.tsx",
      "src/app/app/doctor/content/sections/edit/[slug]/page.tsx",
      "src/app/app/doctor/content/contentPageAuthActions.ts",
      "src/app/app/doctor/content/reorderContentPages.ts",
      "src/app/app/doctor/content/sections/reorderContentSections.ts",
      "src/app/app/doctor/content/sections/sectionVisibilityActions.ts",
    ];
    for (const path of paths) {
      const src = readSource(path);
      expect(src).toContain("requireDoctorWorkspaceContext");
      expect(src).toContain('requireEntitlementForAction(workspace, "cms_pages")');
    }
  });

  it("keeps the content master pane navigation-only and opens forms in the workspace", () => {
    const nav = readSource("src/app/app/doctor/content/ContentNav.tsx");
    const hub = readSource("src/app/app/doctor/content/ContentHubShell.tsx");
    expect(nav).not.toContain('label="Разделы"');
    expect(nav).not.toContain("Медиа");
    expect(nav).toContain("onCreateSection");
    expect(hub).toContain("<SectionForm onSaved");
    expect(hub).toContain("<ContentForm");
    expect(hub).toContain("onCreatePage");
    expect(hub).toContain("← К разделам");
  });
});
