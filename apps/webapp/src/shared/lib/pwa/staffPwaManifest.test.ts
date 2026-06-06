import { describe, expect, it } from "vitest";
import {
  STAFF_PWA_ICON_192,
  STAFF_PWA_MANIFEST_PATH,
  buildStaffPwaManifest,
} from "./staffPwaManifest";

describe("staffPwaManifest", () => {
  it("buildStaffPwaManifest uses doctor hub and staff icons", () => {
    const m = buildStaffPwaManifest();
    expect(m.id).toBe("/app-staff");
    expect(m.start_url).toBe("/app/doctor");
    expect(m.scope).toBe("/app");
    expect(m.icons?.[0]?.src).toBe(STAFF_PWA_ICON_192);
  });

  it("STAFF_PWA_MANIFEST_PATH matches route", () => {
    expect(STAFF_PWA_MANIFEST_PATH).toBe("/manifest-staff.webmanifest");
  });
});
