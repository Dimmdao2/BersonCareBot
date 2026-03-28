import { describe, expect, it } from "vitest";
import { getMenuForRole } from "./service";

describe("menu service", () => {
  it("returns patient menu for client without hardcoded lesson links", () => {
    const items = getMenuForRole("client");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.id === "cabinet")).toBe(true);
    expect(items.some((i) => i.id === "diary")).toBe(true);
    expect(items.some((i) => i.id === "lfk")).toBe(false);
  });

  it("adds content section links when contentSections passed", () => {
    const items = getMenuForRole("client", {
      contentSections: [
        {
          id: "u1",
          slug: "emergency",
          title: "Скорая помощь",
          description: "",
          sortOrder: 1,
          isVisible: true,
        },
      ],
    });
    expect(items.some((i) => i.href === "/app/patient/sections/emergency")).toBe(true);
    expect(items.find((i) => i.id === "emergency")?.title).toBe("Скорая помощь");
  });

  it("returns doctor menu for doctor", () => {
    const items = getMenuForRole("doctor");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.id === "doctor-workspace")).toBe(true);
  });

  it("returns specialist menu for admin", () => {
    const items = getMenuForRole("admin");
    expect(items.some((i) => i.id === "doctor-workspace")).toBe(true);
  });
});
