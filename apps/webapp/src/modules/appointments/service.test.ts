import { describe, expect, it } from "vitest";
import { getUpcomingAppointments } from "./service";

describe("appointments service", () => {
  it("returns array", () => {
    const list = getUpcomingAppointments("user-1");
    expect(Array.isArray(list)).toBe(true);
  });

  it("returns items with id, label, link", () => {
    const list = getUpcomingAppointments("user-1");
    list.forEach((item) => {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("link");
    });
  });
});
