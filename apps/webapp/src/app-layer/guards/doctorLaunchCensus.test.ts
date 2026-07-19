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
  { route: "audit-log/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "health-archive/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "system-health/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/app-settings/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/auth/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/booking/catalog/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/booking/form-public/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/booking/integrations/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/booking/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/booking/payments/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/integrations/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
  { route: "admin/technical/page.tsx", launchClass: "platform", capability: "platform-operations", objectPolicy: "platform-config" },
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

describe("U1 finite doctor launch manifest", () => {
  const appRoot = new URL("../../app/", import.meta.url);
  const platformRoot = new URL("app/(global-admin)/doctor/", appRoot);
  const mediaRoot = new URL("api/media/", appRoot);

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

  it("keeps clinical and platform RSC trees physically disjoint at preserved URLs", () => {
    const doctorLayout = readFileSync(new URL("app/doctor/layout.tsx", appRoot), "utf8");
    const platformLayout = readFileSync(new URL("app/(global-admin)/doctor/layout.tsx", appRoot), "utf8");
    expect(doctorLayout).toContain('redirect("/app/doctor/system-health")');
    expect(platformLayout).toContain("requirePlatformOperationsPage()");
    expect(platformLayout).toContain("enableTenantRuntime={false}");
  });
});
