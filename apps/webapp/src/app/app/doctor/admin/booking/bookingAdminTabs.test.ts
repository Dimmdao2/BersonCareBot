import { describe, expect, it } from "vitest";
import {
  BOOKING_ADMIN_BASE,
  BOOKING_ADMIN_TABS,
  bookingAdminTabFromPathname,
} from "./bookingAdminTabs";

describe("bookingAdminTabFromPathname", () => {
  it("maps base path to overview", () => {
    expect(bookingAdminTabFromPathname(BOOKING_ADMIN_BASE)).toBe("overview");
    expect(bookingAdminTabFromPathname(`${BOOKING_ADMIN_BASE}/`)).toBe("overview");
  });

  it("maps each tab href to its id", () => {
    for (const tab of BOOKING_ADMIN_TABS) {
      if (tab.id === "overview") continue;
      expect(bookingAdminTabFromPathname(tab.href)).toBe(tab.id);
      expect(bookingAdminTabFromPathname(`${tab.href}/extra`)).toBe(tab.id);
    }
  });

  it("has ten unique tab ids and hrefs", () => {
    expect(BOOKING_ADMIN_TABS).toHaveLength(10);
    const ids = new Set(BOOKING_ADMIN_TABS.map((t) => t.id));
    expect(ids.size).toBe(10);
    const hrefs = new Set(BOOKING_ADMIN_TABS.map((t) => t.href));
    expect(hrefs.size).toBe(10);
  });
});
