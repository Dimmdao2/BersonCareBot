import { describe, expect, it } from "vitest";
import {
  isServiceAvailableAtLocation,
  minorToRublesInput,
  parseRublesInput,
  pickDefaultSpecialist,
  rublesToMinor,
  slugCityCode,
} from "./bookingSoloAdminApi";

describe("bookingSoloAdminApi", () => {
  it("converts rubles and minor units", () => {
    expect(rublesToMinor(5000)).toBe(500000);
    expect(minorToRublesInput(500000)).toBe("5000");
    expect(parseRublesInput("10 000,5")).toBe(10000.5);
  });

  it("slugCityCode derives from title", () => {
    expect(slugCityCode("Москва центр").length).toBeGreaterThan(1);
    expect(slugCityCode("")).toMatch(/^loc-/);
  });

  it("isServiceAvailableAtLocation requires both rows", () => {
    const overview = {
      specialists: [{ id: "s1", fullName: "Doc", isActive: true }],
      locationAvailability: [{ id: "l1", serviceId: "svc", branchId: "br", isActive: true }],
      specialistAvailability: [
        { id: "a1", specialistId: "s1", serviceId: "svc", branchId: "br", isActive: true },
      ],
    };
    expect(isServiceAvailableAtLocation(overview, "svc", "br")).toBe(true);
    expect(isServiceAvailableAtLocation(overview, "svc", "other")).toBe(false);
  });

  it("pickDefaultSpecialist prefers active", () => {
    expect(
      pickDefaultSpecialist([
        { id: "1", fullName: "Off", isActive: false },
        { id: "2", fullName: "On", isActive: true },
      ])?.id,
    ).toBe("2");
  });
});
