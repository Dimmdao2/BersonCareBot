import { describe, expect, it } from "vitest";
import { isDoctorNavItemActive } from "./doctorNavLinks";

describe("isDoctorNavItemActive", () => {
  it("matches overview only on /app/doctor", () => {
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor/")).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor", "/app/doctor/clients")).toBe(false);
  });

  it("matches path prefix for nested routes", () => {
    expect(
      isDoctorNavItemActive("/app/doctor/clients?scope=appointments", "/app/doctor/clients"),
    ).toBe(true);
    expect(
      isDoctorNavItemActive("/app/doctor/clients?scope=appointments", "/app/doctor/clients/42"),
    ).toBe(true);
    expect(isDoctorNavItemActive("/app/doctor/stats", "/app/doctor/stats")).toBe(true);
  });
});
