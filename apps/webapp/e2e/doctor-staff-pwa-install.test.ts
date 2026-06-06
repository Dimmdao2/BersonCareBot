/**
 * Staff PWA §B: metadata на staff layouts + route manifest (без холодного import page).
 */
import { describe, expect, it } from "vitest";
import { STAFF_PWA_MANIFEST_PATH } from "@/shared/lib/pwa/staffPwaManifest";
import { staffPwaLayoutMetadata } from "@/shared/lib/pwa/staffPwaLayoutMetadata";
import { routePaths } from "@/app-layer/routes/paths";
import { GET } from "@/app/manifest-staff.webmanifest/route";

describe("staff PWA install (§B)", () => {
  it("doctor/settings/admin layouts use staff manifest metadata", async () => {
    const [doctor, settings, admin] = await Promise.all([
      import("@/app/app/doctor/layout"),
      import("@/app/app/settings/layout"),
      import("@/app/app/admin/layout"),
    ]);
    expect(doctor.metadata).toEqual(staffPwaLayoutMetadata);
    expect(settings.metadata).toEqual(staffPwaLayoutMetadata);
    expect(admin.metadata).toEqual(staffPwaLayoutMetadata);
    expect(staffPwaLayoutMetadata.manifest).toBe(STAFF_PWA_MANIFEST_PATH);
  });

  it("routePaths.doctorInstall matches install page path", () => {
    expect(routePaths.doctorInstall).toBe("/app/doctor/install");
  });

  it("manifest route returns staff start_url", async () => {
    const res = await GET();
    const body = (await res.json()) as { start_url?: string };
    expect(body.start_url).toBe("/app/doctor");
  });
});
