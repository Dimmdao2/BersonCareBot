import { describe, expect, it } from "vitest";
import { routePaths } from "@/app-layer/routes/paths";
import { appLoginWithNextHref, hrefForPatientHomeDrilldown, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";

describe("patientHomeGuestNav", () => {
  it("appLoginWithNextHref encodes next", () => {
    expect(appLoginWithNextHref("/app/patient/booking")).toBe(
      `${routePaths.root}?next=${encodeURIComponent("/app/patient/booking")}`,
    );
  });

  it("hrefForPatientHomeDrilldown passes through when not anonymous", () => {
    expect(hrefForPatientHomeDrilldown("/app/patient/sections/x", false)).toBe("/app/patient/sections/x");
  });

  it("hrefForPatientHomeDrilldown wraps for anonymous guest", () => {
    expect(hrefForPatientHomeDrilldown("/app/patient/content/pg", true)).toBe(
      `${routePaths.root}?next=${encodeURIComponent("/app/patient/content/pg")}`,
    );
  });

  it("stripApiMediaForAnonymousGuest clears /api/media/ only for anonymous", () => {
    expect(stripApiMediaForAnonymousGuest("/api/media/uuid", false)).toBe("/api/media/uuid");
    expect(stripApiMediaForAnonymousGuest("/api/media/uuid", true)).toBe(null);
    expect(stripApiMediaForAnonymousGuest("https://cdn.example/x.jpg", true)).toBe("https://cdn.example/x.jpg");
  });
});
