import { describe, expect, it } from "vitest";
import { mapBookingSlotsErrorCodeToRu } from "./bookingSlotsErrorMessages";

describe("mapBookingSlotsErrorCodeToRu", () => {
  it("maps slots_unavailable and catalog codes", () => {
    expect(mapBookingSlotsErrorCodeToRu("slots_unavailable")).toContain("Расписание");
    expect(mapBookingSlotsErrorCodeToRu("slots_unavailable")).toContain("Повторить");
    expect(mapBookingSlotsErrorCodeToRu("catalog_unavailable")).toContain("Каталог");
  });

  it("maps validation and not found", () => {
    expect(mapBookingSlotsErrorCodeToRu("branch_service_not_found")).toContain("Услуга");
    expect(mapBookingSlotsErrorCodeToRu("invalid_query")).toContain("Обновите");
  });

  it("fallback for unknown code", () => {
    expect(mapBookingSlotsErrorCodeToRu("unknown_xyz")).toContain("расписание");
  });

  it("empty code uses default", () => {
    expect(mapBookingSlotsErrorCodeToRu(undefined)).toContain("расписание");
  });
});
