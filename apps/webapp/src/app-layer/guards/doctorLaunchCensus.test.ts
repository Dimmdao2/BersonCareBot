import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type LaunchClass = "platform" | "clinical";
type ObjectPolicy = "platform-config" | "platform-neutral-no-pii" | "workspace-media" | "workspace-clinical";

type LaunchManifestEntry = Readonly<{
  route: string;
  launchClass: LaunchClass;
  capability: "platform-operations" | "doctor-workspace";
  objectPolicy: ObjectPolicy;
}>;

function collectFiles(dir: URL, suffix: string, result: URL[] = []): URL[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) collectFiles(child, suffix, result);
    else if (entry.name === suffix) result.push(child);
  }
  return result;
}

function hasUseServerDirective(source: string): boolean {
  return /^\uFEFF?\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))\s*)*["']use server["'];?/.test(source);
}

function collectServerActionFiles(dir: URL, result: URL[] = []): URL[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) collectServerActionFiles(child, result);
    else if (/\.tsx?$/.test(entry.name) && hasUseServerDirective(readFileSync(child, "utf8"))) result.push(child);
  }
  return result;
}

/**
 * Finite U1 launch proof. It deliberately records the public surface and object policy,
 * instead of inferring authority from source text or route counts.
 */
const launchManifest: readonly LaunchManifestEntry[] = [
  { route: "usage/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-neutral-no-pii" },
  { route: "booking-merge/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-neutral-no-pii" },
  { route: "analytics/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "analytics/clients/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "analytics/notifications/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  // audit-log and health-archive moved to app/platform/ in slice 2 (PLAT-01…09); system-health
  // moved in slice 1, commercial in slice 3, the whole admin/* subtree in slice 4 — see
  // newPlatformLaunchManifest.
];

/**
 * PLAT-01…09: the platform shell's own route tree, disjoint from `(global-admin)/doctor/`.
 * Slice 1 (2026-07-26) moved `system-health` here; slice 2 (2026-07-26) adds `health-archive`
 * and `audit-log`; slice 3 (2026-07-26) adds `commercial`; slice 4 (2026-07-26) adds the whole
 * `admin/*` subtree (app-settings, auth, booking + its 4 sub-pages, integrations, technical).
 * Slices 5-7 add the rest of `launchManifest` above as each page physically moves.
 *
 * Owner ruling 2026-07-26 (final home): the whole tree above renamed from `app/platform/` to
 * `app/admin/`, merging with the pre-existing `admin/promo` (a legacy redirect stub, added to
 * this manifest below) and flattening the nested `admin/*` settings subtree one level (no
 * `admin/admin/*` route paths).
 */
const newPlatformLaunchManifest: readonly LaunchManifestEntry[] = [
  { route: "system-health/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "health-archive/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "audit-log/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "commercial/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "app-settings/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "auth/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "booking/catalog/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "booking/form-public/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  // Rubitime retirement permanently removed booking/integrations/page.tsx; it did not move to
  // another platform route, so the finite launch manifest deliberately has no replacement entry.
  { route: "booking/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "booking/payments/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "integrations/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "technical/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  // Pre-existing legacy redirect stub, unrelated to the PLAT-01…09 moves — kept as-is (see
  // promo/page.tsx and the owner report on its zero inbound links). It renders nothing itself
  // (`redirect()` only), so "platform-neutral-no-pii" like the other redirect-only entries above.
  { route: "promo/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-neutral-no-pii" },
];

const mutableMediaManifest: readonly LaunchManifestEntry[] = [
  { route: "multipart/abort/route.ts", launchClass: "clinical", capability: "doctor-workspace", objectPolicy: "workspace-media" },
  { route: "multipart/complete/route.ts", launchClass: "clinical", capability: "doctor-workspace", objectPolicy: "workspace-media" },
  { route: "multipart/init/route.ts", launchClass: "clinical", capability: "doctor-workspace", objectPolicy: "workspace-media" },
  { route: "multipart/part-url/route.ts", launchClass: "clinical", capability: "doctor-workspace", objectPolicy: "workspace-media" },
  { route: "upload/route.ts", launchClass: "clinical", capability: "doctor-workspace", objectPolicy: "workspace-media" },
];

const rejectedPlatformRepairRoutes = [
  "clients/merge-user-search/route.ts",
  "clients/merge-preview/route.ts",
  "clients/merge/route.ts",
] as const;

const doctorServerActionManifest = [
  "broadcasts/actions.ts",
  "clinical-tests/actions.ts",
  "clinical-tests/actionsInline.ts",
  "content/actions.ts",
  "content/contentPageAuthActions.ts",
  "content/inlineEditorActions.ts",
  "content/lifecycleActions.ts",
  "content/motivation/actions.ts",
  "content/reorderContentPages.ts",
  "content/sections/actions.ts",
  "content/sections/reorderContentSections.ts",
  "content/sections/sectionVisibilityActions.ts",
  "exercises/actions.ts",
  "exercises/actionsInline.ts",
  "lfk-templates/actions.ts",
  "patient-home/patientHomeDoctorSettingsActions.ts",
  "recommendations/actions.ts",
  "recommendations/actionsInline.ts",
  "references/actions.ts",
  "test-sets/actions.ts",
  "test-sets/actionsInline.ts",
] as const;

const delegatedActionFiles = new Set(doctorServerActionManifest.filter((route) => route.endsWith("actionsInline.ts")));

const settingsServerActionPolicy = {
  "doctorNotificationPrefsActions.ts": "account-self",
  "patient-home/actions.ts": "doctor-workspace",
  // Added by ad9db8266 (clinic name and logo). Its authority is the organization-management
  // capability, not the clinical workspace and not the personal account — so it gets its own
  // policy value rather than being folded into one of the two above.
  "brandingActions.ts": "org-branding-management",
} as const;

describe("U1 finite doctor launch manifest", () => {
  const appRoot = new URL("../../app/", import.meta.url);
  const platformRoot = new URL("app/(global-admin)/doctor/", appRoot);
  const newPlatformRoot = new URL("app/admin/", appRoot);
  const doctorRoot = new URL("app/doctor/", appRoot);
  const settingsRoot = new URL("app/settings/", appRoot);
  const mediaRoot = new URL("api/media/", appRoot);

  it("recognizes valid Server Action directives despite harmless leading syntax", () => {
    expect(hasUseServerDirective('"use server";\nexport async function action() {}')).toBe(true);
    expect(hasUseServerDirective("  'use server';\nexport async function action() {}" )).toBe(true);
    expect(hasUseServerDirective('/* action module */\n"use server";\nexport async function action() {}')).toBe(true);
    expect(hasUseServerDirective('// action module\n"use server";\nexport async function action() {}')).toBe(true);
    expect(hasUseServerDirective('const marker = "use server";')).toBe(false);
  });

  it("is exact for platform URLs and marks analytics and repair as PII-free absence", () => {
    const discovered = new Set(
      collectFiles(platformRoot, "page.tsx").map((file) => fileURLToPath(file).replace(fileURLToPath(platformRoot), "")),
    );
    expect(discovered).toEqual(new Set(launchManifest.map((entry) => entry.route)));
    expect(launchManifest.filter((entry) => entry.objectPolicy === "platform-neutral-no-pii").map((entry) => entry.route)).toEqual([
      "usage/page.tsx",
      "booking-merge/page.tsx",
    ]);
  });

  it("is exact for the app/admin/ route tree (PLAT-01…09 slices 1-4, renamed from app/platform/ by owner ruling 2026-07-26, plus the pre-existing admin/promo stub)", () => {
    const discovered = new Set(
      collectFiles(newPlatformRoot, "page.tsx").map((file) =>
        fileURLToPath(file).replace(fileURLToPath(newPlatformRoot), ""),
      ),
    );
    expect(discovered).toEqual(new Set(newPlatformLaunchManifest.map((entry) => entry.route)));
  });

  it("has an exact mutable-media manifest and keeps its workspace guard", () => {
    const source = (route: string) => readFileSync(new URL(`api/media/${route}`, appRoot), "utf8");
    for (const entry of mutableMediaManifest) {
      expect(source(entry.route), entry.route).toContain("requireDoctorWorkspaceApiContext(");
    }
    const discoveredMutable = collectFiles(mediaRoot, "route.ts")
      .map((file) => fileURLToPath(file).replace(fileURLToPath(mediaRoot), ""))
      .filter((route) => mutableMediaManifest.some((entry) => entry.route === route));
    expect(new Set(discoveredMutable)).toEqual(new Set(mutableMediaManifest.map((entry) => entry.route)));
  });

  it("records rejected global patient repair handlers as absent executable capabilities", () => {
    for (const route of rejectedPlatformRepairRoutes) {
      const source = readFileSync(new URL(`api/doctor/${route}`, appRoot), "utf8");
      expect(source, route).toContain('error: "not_available"');
      expect(source, route).not.toContain("getPool(");
    }
  });

  it("has an exact Server Action manifest and forbids raw role/session authorization", () => {
    const discovered = collectServerActionFiles(doctorRoot).map((file) =>
      fileURLToPath(file).replace(fileURLToPath(doctorRoot), ""),
    );
    expect(new Set(discovered)).toEqual(new Set(doctorServerActionManifest));

    for (const route of doctorServerActionManifest) {
      const source = readFileSync(new URL(route, doctorRoot), "utf8");
      expect(source, route).not.toContain("getCurrentSession");
      expect(source, route).not.toContain("canAccessDoctor");
      if (!delegatedActionFiles.has(route)) {
        expect(
          source.includes("requireDoctorWorkspaceContext(") || source.includes("requireDoctorAccess("),
          route,
        ).toBe(true);
      }
    }
  });

  it("keeps personal-account actions separate from clinical settings actions", () => {
    const discovered = collectServerActionFiles(settingsRoot).map((file) =>
      fileURLToPath(file).replace(fileURLToPath(settingsRoot), ""),
    );
    expect(new Set(discovered)).toEqual(new Set(Object.keys(settingsServerActionPolicy)));

    for (const [route, policy] of Object.entries(settingsServerActionPolicy)) {
      const source = readFileSync(new URL(route, settingsRoot), "utf8");
      expect(source, route).not.toContain("getCurrentSession");
      expect(source, route).not.toContain("canAccessDoctor");
      if (policy === "account-self") {
        expect(source, route).toContain("requireStaffAccountPage(");
        expect(source, route).not.toContain("requireDoctorAccess(");
        expect(source, route).not.toContain("requireDoctorWorkspaceContext(");
      } else if (policy === "org-branding-management") {
        expect(source, route).toContain("requireOrgBrandingManagementContext(");
        expect(source, route).not.toContain("requireStaffAccountPage(");
        expect(source, route).not.toContain("requireDoctorWorkspaceContext(");
      } else {
        expect(source, route).toContain("requireDoctorWorkspaceContext(");
        expect(source, route).not.toContain("requireStaffAccountPage(");
      }
    }
  });

  it("keeps clinical and platform RSC trees physically disjoint at preserved URLs", () => {
    const doctorLayout = readFileSync(new URL("app/doctor/layout.tsx", appRoot), "utf8");
    const platformLayout = readFileSync(new URL("app/(global-admin)/doctor/layout.tsx", appRoot), "utf8");
    const adminLayout = readFileSync(new URL("app/admin/layout.tsx", appRoot), "utf8");
    const accountLayout = readFileSync(new URL("app/account/layout.tsx", appRoot), "utf8");
    expect(doctorLayout).toContain('redirect("/app/admin/system-health")');
    expect(platformLayout).toContain("requirePlatformOperationsPage()");
    expect(platformLayout).toContain("enableTenantRuntime={false}");
    expect(platformLayout).toContain('menuKind="platform"');
    // app/admin/layout.tsx is the owner-ruling-2026-07-26 merge of app/platform/layout.tsx
    // (deleted) with the pre-existing admin shell — same guard/shell contract as above.
    expect(adminLayout).toContain("requirePlatformOperationsPage()");
    expect(adminLayout).toContain("enableTenantRuntime={false}");
    expect(adminLayout).toContain('menuKind="platform"');
    expect(accountLayout).toContain('session.user.role === "admin" && session.adminMode === true');
    expect(accountLayout).toContain('menuKind={isPlatformConsole ? "platform" : "doctor"}');
  });
});
