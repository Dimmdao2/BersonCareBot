import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(import.meta.dirname, "page.tsx");

describe("booking/new page (patient help links)", () => {
  it("shows city-aware address link immediately after BookingUpcomingSection when upcoming bookings exist", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("pickBookingCityCodeForAddressLinks");
    expect(src).toContain("cityCodeFromQuery");
    expect(src).toContain("cityCodeSnapshot");
    expect(src).toContain("resolvePatientAddressHref");
    expect(src).toContain("Адрес кабинета");
    expect(src).toMatch(
      /<BookingUpcomingSection[\s\S]*?records\.upcoming\.length > 0[\s\S]*?href=\{addressHref\}/,
    );
  });
});
