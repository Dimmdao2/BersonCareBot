import { describe, expect, it } from "vitest";
import { getUpcomingAppointments } from "./service";

describe("appointments service", () => {
  it("returns array", () => {
    const list = getUpcomingAppointments();
    expect(Array.isArray(list)).toBe(true);
  });
});
