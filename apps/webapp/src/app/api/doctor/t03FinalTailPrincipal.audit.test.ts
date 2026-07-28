import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const apiRoots = ["src/app/api/doctor", "src/app/api/admin"];

const allowedUncovered: Record<string, string> = {
  // The 2026-07-28 guard wave moved 23 routes onto approved audience-specific guards (13 admin
  // plus 10 doctor/patient). For this doctor/admin mutation census, three former admin exceptions
  // — google-calendar/start, mode and smtp-test — now carry
  // `requirePlatformOperationsApiContext` and therefore leave this explicit uncovered set.
  // The other changed doctor/admin routes were already covered entries; patient routes are outside
  // this audit's two roots. The five remaining exceptions below retain their reviewed class.
  "src/app/api/admin/users/[userId]/archive/route.ts":
    "admin user lifecycle route sharing patient archive helper; kept as explicit admin lifecycle exception",
  "src/app/api/doctor/account/email/route.ts":
    "staff account identity self-service, global platform user lifecycle",
  "src/app/api/doctor/account/timezone/route.ts":
    "staff account preference self-service, global platform user lifecycle",
  "src/app/api/doctor/web-push/subscribe/route.ts":
    "staff account/channel preference self-service",
  "src/app/api/doctor/web-push/unsubscribe/route.ts":
    "staff account/channel preference self-service",
};

const coveredMarkers = [
  "requireDoctorWorkspaceApiContext",
  "withDoctorWorkspacePrincipal",
  "requireDoctorWorkspaceContext",
  "requireDoctorBookingEngine",
  "requireAdminBookingEngine",
  "withAdminBookingCatalogPrincipal",
  "requireAdminBookingCatalogContext",
  "requireClinicManagementApiContext",
  "requirePlatformOperationsApiContext",
  "requireAdminModeSession",
];

function walk(dir: string): string[] {
  const abs = join(repoRoot, dir);
  return readdirSync(abs).flatMap((name) => {
    const child = join(abs, name);
    const rel = relative(repoRoot, child);
    if (statSync(child).isDirectory()) return walk(rel);
    return child.endsWith(".ts") ? [rel] : [];
  });
}

function hasMutationExport(src: string): boolean {
  return /export\s+async\s+function\s+(POST|PATCH|DELETE|PUT)\b/.test(src);
}

function hasCoverageMarker(src: string): boolean {
  return coveredMarkers.some((marker) => src.includes(marker));
}

describe("T0.3 final doctor/admin write-path tail audit", () => {
  it("keeps uncovered mutating doctor/admin route files explicitly classified", () => {
    const mutatingRouteFiles = apiRoots
      .flatMap(walk)
      .filter((path) => path.endsWith("/route.ts"))
      .filter((path) => hasMutationExport(readFileSync(join(repoRoot, path), "utf8")))
      .map((path) => path.replaceAll("\\", "/"))
      .sort();

    const uncovered = mutatingRouteFiles.filter((path) => {
      const src = readFileSync(join(repoRoot, path), "utf8");
      return !hasCoverageMarker(src);
    });

    expect(uncovered).toEqual(Object.keys(allowedUncovered).sort());
    for (const reason of Object.values(allowedUncovered)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
