import { describe, expect, it } from "vitest";
import { bookingNewHref } from "./bookingNewHref";

describe("bookingNewHref", () => {
  it("returns plain booking new without city", () => {
    expect(bookingNewHref()).toBe("/app/patient/booking/new");
    expect(bookingNewHref(null)).toBe("/app/patient/booking/new");
    expect(bookingNewHref("  ")).toBe("/app/patient/booking/new");
  });

  it("appends cityCode query when provided", () => {
    expect(bookingNewHref("msk")).toBe("/app/patient/booking/new?cityCode=msk");
    expect(bookingNewHref("spb")).toBe("/app/patient/booking/new?cityCode=spb");
  });
});
