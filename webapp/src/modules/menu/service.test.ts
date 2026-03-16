import { describe, expect, it } from "vitest";
import { getMenuForRole } from "./service";

describe("menu service", () => {
  it("returns patient menu for client", () => {
    const items = getMenuForRole("client");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.id === "lessons")).toBe(true);
    expect(items.some((i) => i.id === "emergency")).toBe(true);
    expect(items.some((i) => i.id === "cabinet")).toBe(false);
  });

  it("returns doctor menu for doctor", () => {
    const items = getMenuForRole("doctor");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.id === "doctor-workspace")).toBe(true);
  });

  it("returns patient menu for admin", () => {
    const items = getMenuForRole("admin");
    expect(items.some((i) => i.id === "lessons")).toBe(true);
  });
});
