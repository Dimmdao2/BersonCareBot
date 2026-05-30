import { describe, expect, it } from "vitest";
import { isDoctorClientSearchQueryAllowed, matchesDoctorClientSearch } from "./clientSearchMatch";

describe("clientSearchMatch", () => {
  const item = {
    displayName: "Demo Client",
    phone: "+79990000001",
    bindings: { telegramId: "tg123", maxId: null },
  };

  it("matches by name", () => {
    expect(matchesDoctorClientSearch(item, "demo")).toBe(true);
  });

  it("matches phone by digits without country code", () => {
    expect(matchesDoctorClientSearch(item, "9990000001")).toBe(true);
    expect(matchesDoctorClientSearch(item, "90000001")).toBe(true);
  });

  it("allows short digit-only queries from 3 digits", () => {
    expect(isDoctorClientSearchQueryAllowed("999")).toBe(true);
    expect(isDoctorClientSearchQueryAllowed("de")).toBe(true);
    expect(isDoctorClientSearchQueryAllowed("9")).toBe(false);
  });
});
