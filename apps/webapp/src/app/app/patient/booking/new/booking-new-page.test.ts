import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(import.meta.dirname, "page.tsx");

describe("booking/new page (patient help links)", () => {
  it("mounts CabinetInfoLinks with booking surface immediately after BookingUpcomingSection", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain('surface="booking"');
    expect(src).toContain("bookingCityCode={bookingCityCode}");
    expect(src).toContain("pickBookingCityCodeForAddressLinks");
    expect(src).toContain("cityCodeFromQuery");
    expect(src).toContain("cityCodeSnapshot");
    expect(src).toMatch(
      /<BookingUpcomingSection[\s\S]*?<CabinetInfoLinks[\s\S]*?surface="booking"/,
    );
  });
});
