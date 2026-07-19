import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type LaunchClass = "platform" | "organization-management" | "clinical" | "account-self";

function collectFiles(dir: URL, suffix: string, result: URL[] = []): URL[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) collectFiles(child, suffix, result);
    else if (entry.name === suffix) result.push(child);
  }
  return result;
}

const guardRegistry: ReadonlyArray<{ launchClass: LaunchClass; call: string; wrapper?: string; proof?: string }> = [
  { launchClass: "clinical", call: "requireDoctorWorkspaceApiContext(" },
  {
    launchClass: "clinical",
    call: "requireDoctorBookingEngine(",
    wrapper: "api/doctor/booking-engine/_requireDoctorBookingEngine.ts",
    proof: "requireDoctorWorkspaceApiContext(",
  },
  {
    launchClass: "clinical",
    call: "requireAdminBookingEngine(",
    wrapper: "api/admin/booking-engine/_requireAdminBookingEngine.ts",
    proof: "requireDoctorWorkspaceApiContext(",
  },
  { launchClass: "account-self", call: "requireDoctorApiSession(" },
  { launchClass: "organization-management", call: "requireClinicManagementApiContext(" },
  { launchClass: "organization-management", call: "requireClinicManagementBookingCatalogRead(" },
  {
    launchClass: "organization-management",
    call: "requireClinicManagementBookingEngine(",
    wrapper: "api/admin/booking-engine/_requireAdminBookingEngine.ts",
    proof: "requireClinicManagementApiContext(",
  },
  { launchClass: "organization-management", call: "requireAdminWorkspaceApiContext(" },
  { launchClass: "platform", call: "requireAdminModeSession(" },
  { launchClass: "platform", call: "requireAdminBookingCatalog(" },
];

const platformPages = new Set([
  "admin/app-settings/page.tsx",
  "admin/auth/page.tsx",
  "admin/booking/catalog/page.tsx",
  "admin/booking/form-public/page.tsx",
  "admin/booking/integrations/page.tsx",
  "admin/booking/page.tsx",
  "admin/booking/payments/page.tsx",
  "admin/integrations/page.tsx",
  "admin/technical/page.tsx",
  "analytics/clients/page.tsx",
  "analytics/notifications/page.tsx",
  "analytics/page.tsx",
  "audit-log/page.tsx",
  "booking-merge/page.tsx",
  "health-archive/page.tsx",
  "system-health/page.tsx",
  "usage/page.tsx",
]);

describe("U1 doctor launch census", () => {
  const appRoot = new URL("../../app/", import.meta.url);
  const apiRoutes = collectFiles(new URL("api/doctor/", appRoot), "route.ts");
  const mediaRoutes = collectFiles(new URL("api/media/", appRoot), "route.ts");
  const clinicalPages = collectFiles(new URL("app/doctor/", appRoot), "page.tsx");
  const platformRoot = new URL("app/(global-admin)/doctor/", appRoot);
  const discoveredPlatformPages = collectFiles(platformRoot, "page.tsx");

  it("uses only a finite, proven guard registry for every doctor API route", () => {
    for (const entry of guardRegistry.filter((entry) => entry.wrapper != null)) {
      const wrapper = readFileSync(new URL(entry.wrapper!, appRoot), "utf8");
      expect(wrapper, entry.wrapper).toContain(entry.proof!);
    }

    const classes = new Map<LaunchClass, number>();
    for (const file of apiRoutes) {
      const path = fileURLToPath(file);
      const source = readFileSync(file, "utf8");
      const matches = guardRegistry.filter((entry) => source.includes(entry.call));
      expect(matches.length, path).toBeGreaterThan(0);
      expect(source, path).not.toMatch(/getCurrentSession\(\)[\s\S]{0,240}canAccessDoctor\(/);
      const launchClass = matches.find((entry) => entry.launchClass === "clinical")?.launchClass ?? matches[0]!.launchClass;
      classes.set(launchClass, (classes.get(launchClass) ?? 0) + 1);
    }

    expect(apiRoutes.length).toBeGreaterThan(150);
    expect(classes.get("clinical")).toBeGreaterThan(0);
    expect(classes.get("platform")).toBeGreaterThan(0);
    expect(classes.get("account-self")).toBeGreaterThan(0);

    const legacyArchive = readFileSync(new URL("api/admin/users/[userId]/archive/route.ts", appRoot), "utf8");
    expect(legacyArchive).toContain("requireAdminWorkspaceApiContext(");
    expect(legacyArchive).not.toContain("getCurrentSession(");
  });

  it("covers every mutable media route with the same clinical workspace guard", () => {
    const expected = new Set([
      "[id]/hls/[[...path]]/route.ts",
      "[id]/playback/events/route.ts",
      "[id]/playback/route.ts",
      "[id]/preview/[size]/route.ts",
      "[id]/route.ts",
      "confirm/route.ts",
      "multipart/abort/route.ts",
      "multipart/complete/route.ts",
      "multipart/init/route.ts",
      "multipart/part-url/route.ts",
      "presign/route.ts",
      "s3-status/route.ts",
      "upload/route.ts",
    ]);
    const mediaRoot = new URL("api/media/", appRoot);
    const discovered = new Set(mediaRoutes.map((file) => fileURLToPath(file).replace(fileURLToPath(mediaRoot), "")));
    expect(discovered).toEqual(expected);
    const mutable = new Set([
      "multipart/abort/route.ts",
      "multipart/complete/route.ts",
      "multipart/init/route.ts",
      "multipart/part-url/route.ts",
      "upload/route.ts",
    ]);
    for (const file of mediaRoutes.filter((file) => mutable.has(fileURLToPath(file).replace(fileURLToPath(mediaRoot), "")))) {
      const source = readFileSync(file, "utf8");
      expect(source, fileURLToPath(file)).toContain("requireDoctorWorkspaceApiContext(");
    }
  });

  it("keeps clinical and platform RSC trees physically disjoint at the preserved URLs", () => {
    const doctorLayout = readFileSync(new URL("app/doctor/layout.tsx", appRoot), "utf8");
    expect(doctorLayout).toContain('redirect("/app/doctor/system-health")');
    expect(doctorLayout).toContain("requireOrganizationWorkspaceContext()");

    for (const file of clinicalPages) {
      const source = readFileSync(file, "utf8");
      expect(source, fileURLToPath(file)).not.toContain("requirePlatformOperationsPage(");
    }

    const discovered = new Set(
      discoveredPlatformPages.map((file) => fileURLToPath(file).replace(fileURLToPath(platformRoot), "")),
    );
    expect(discovered).toEqual(platformPages);
    const platformLayout = readFileSync(new URL("app/(global-admin)/doctor/layout.tsx", appRoot), "utf8");
    expect(platformLayout).toContain("requirePlatformOperationsPage()");
    expect(platformLayout).toContain("enableTenantRuntime={false}");
  });

  it("keeps the legacy doctor root free of binding/provisioning writes and redirects bindingless staff safely", () => {
    const layout = readFileSync(new URL("app/doctor/layout.tsx", appRoot), "utf8");
    const guard = readFileSync(new URL("requireRole.ts", import.meta.url), "utf8");
    expect(layout).not.toContain("ensureOwnBookableSpecialist");
    expect(guard).toContain('redirect("/app/settings")');
  });
});
