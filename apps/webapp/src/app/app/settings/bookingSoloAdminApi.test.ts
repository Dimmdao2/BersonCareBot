import { beforeEach, describe, expect, it, vi } from "vitest";

const apiJsonMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/apiJson", () => ({
  apiJson: apiJsonMock,
}));

import {
  countServicesWithoutAvailability,
  hasScheduleOnUpcomingDays,
  isServiceAvailableAtLocation,
  minorToRublesInput,
  parseRublesInput,
  pickDefaultSpecialist,
  rublesToMinor,
  setServiceLocationAvailability,
  slugCityCode,
  slugFieldKey,
} from "./bookingSoloAdminApi";

describe("bookingSoloAdminApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts rubles and minor units", () => {
    expect(rublesToMinor(5000)).toBe(500000);
    expect(minorToRublesInput(500000)).toBe("5000");
    expect(parseRublesInput("10 000,5")).toBe(10000.5);
  });

  it("slugCityCode derives from title", () => {
    expect(slugCityCode("Москва центр").length).toBeGreaterThan(1);
    expect(slugCityCode("")).toMatch(/^loc-/);
  });

  it("slugFieldKey deduplicates", () => {
    expect(slugFieldKey("Имя", [])).toBeTruthy();
    expect(slugFieldKey("Имя", ["имя"])).toMatch(/_2$/);
  });

  it("isServiceAvailableAtLocation preserves canonical OR for partial legacy rows", () => {
    const overview = {
      specialists: [{ id: "s1", fullName: "Doc", isActive: true }],
      locationAvailability: [{ id: "l1", serviceId: "svc", branchId: "br", isActive: true }],
      specialistAvailability: [
        { id: "a1", specialistId: "s1", serviceId: "svc", branchId: "br", isActive: true },
      ],
    };
    expect(isServiceAvailableAtLocation(overview, "svc", "br")).toBe(true);
    expect(isServiceAvailableAtLocation(overview, "svc", "other")).toBe(false);
    expect(
      isServiceAvailableAtLocation(
        {
          ...overview,
          specialistAvailability: [],
        },
        "svc",
        "br",
      ),
    ).toBe(true);
    expect(
      isServiceAvailableAtLocation(
        {
          ...overview,
          locationAvailability: [],
        },
        "svc",
        "br",
      ),
    ).toBe(true);
    expect(
      isServiceAvailableAtLocation(
        {
          ...overview,
          locationAvailability: [],
          specialistAvailability: [
            { id: "a2", specialistId: "s1", serviceId: "svc", branchId: null, isActive: true },
          ],
        },
        "svc",
        "br",
      ),
    ).toBe(false);
  });

  it("normalizes both solo availability rows through one server command", async () => {
    apiJsonMock.mockResolvedValue({ ok: true });

    await setServiceLocationAvailability("svc", "branch", true, "specialist");

    expect(apiJsonMock).toHaveBeenCalledOnce();
    expect(apiJsonMock).toHaveBeenCalledWith(
      "/api/admin/booking-engine/availability",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          kind: "solo_service_location",
          specialistId: "specialist",
          serviceId: "svc",
          branchId: "branch",
          isActive: true,
        }),
      }),
    );
  });

  it("countServicesWithoutAvailability counts services with no enabled location", () => {
    const overview = {
      specialists: [{ id: "s1", fullName: "Doc", isActive: true }],
      locationAvailability: [{ id: "l1", serviceId: "svc1", branchId: "br", isActive: true }],
      specialistAvailability: [
        { id: "a1", specialistId: "s1", serviceId: "svc1", branchId: "br", isActive: true },
      ],
    };
    expect(
      countServicesWithoutAvailability(
        [{ id: "svc1" }, { id: "svc2" }],
        new Set(["br"]),
        overview,
      ),
    ).toBe(1);
  });

  it("hasScheduleOnUpcomingDays checks weekdays in range", () => {
    const monday = new Date("2026-06-01T12:00:00.000Z");
    expect(hasScheduleOnUpcomingDays([{ weekday: 1, isActive: true }], 7, monday)).toBe(true);
    expect(hasScheduleOnUpcomingDays([{ weekday: 3, isActive: false }], 7, monday)).toBe(false);
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
