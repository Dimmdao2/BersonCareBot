import { describe, expect, it } from "vitest";
import { routePaths } from "@/app-layer/routes/paths";
import {
  getPatientPrimaryNavActiveId,
  isPatientHeaderProfileRoute,
  isPatientPrimaryNavRoute,
} from "@/app-layer/routes/navigation";

describe("isPatientHeaderProfileRoute", () => {
  it("returns true only for root primary nav tab URLs", () => {
    expect(isPatientHeaderProfileRoute(routePaths.patient)).toBe(true);
    expect(isPatientHeaderProfileRoute(routePaths.patientTreatmentPrograms)).toBe(true);
    expect(isPatientHeaderProfileRoute(routePaths.diary)).toBe(true);
    expect(isPatientHeaderProfileRoute(routePaths.bookingNew)).toBe(true);
    expect(isPatientHeaderProfileRoute(routePaths.patientMessages)).toBe(true);
  });

  it("returns false for subpages even when bottom nav tab is active", () => {
    expect(isPatientHeaderProfileRoute(routePaths.profile)).toBe(false);
    expect(isPatientHeaderProfileRoute(routePaths.notifications)).toBe(false);
    expect(isPatientHeaderProfileRoute(routePaths.patientReminders)).toBe(false);
    expect(isPatientHeaderProfileRoute("/app/patient/content/foo")).toBe(false);
    expect(
      isPatientHeaderProfileRoute("/app/patient/treatment/11111111-1111-4111-8111-111111111111"),
    ).toBe(false);
    expect(isPatientHeaderProfileRoute(routePaths.diaryLfkJournal)).toBe(false);
    expect(isPatientHeaderProfileRoute(`${routePaths.bookingNew}/service`)).toBe(false);
  });

  it("isPatientPrimaryNavRoute aliases isPatientHeaderProfileRoute", () => {
    expect(isPatientPrimaryNavRoute(routePaths.patient)).toBe(true);
    expect(isPatientPrimaryNavRoute(routePaths.profile)).toBe(false);
  });

  it("keeps prefix-based active id for bottom nav highlight on subpaths", () => {
    expect(getPatientPrimaryNavActiveId(routePaths.patientMessages)).toBe("messages");
    expect(
      getPatientPrimaryNavActiveId("/app/patient/treatment/11111111-1111-4111-8111-111111111111"),
    ).toBe("plan");
    expect(getPatientPrimaryNavActiveId(`${routePaths.bookingNew}/service`)).toBe("booking");
  });
});
