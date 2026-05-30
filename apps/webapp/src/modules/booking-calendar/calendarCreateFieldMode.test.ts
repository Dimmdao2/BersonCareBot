import { describe, expect, it } from "vitest";
import {
  calendarCreateFieldLabel,
  resolveCalendarCreateFieldMode,
  resolveCalendarCreateFieldValue,
} from "./calendarCreateFieldMode";

const options = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

describe("calendarCreateFieldMode", () => {
  it("hides empty catalogs", () => {
    expect(resolveCalendarCreateFieldMode([], null)).toBe("hidden");
  });

  it("fixes single option", () => {
    expect(resolveCalendarCreateFieldMode([{ id: "only", label: "Only" }], null)).toBe("fixed");
    expect(resolveCalendarCreateFieldValue([{ id: "only", label: "Only" }], null, null)).toBe("only");
  });

  it("fixes when calendar filter is active", () => {
    expect(resolveCalendarCreateFieldMode(options, "b")).toBe("fixed");
    expect(resolveCalendarCreateFieldValue(options, "b", "a")).toBe("b");
  });

  it("selects when multiple options and no filter", () => {
    expect(resolveCalendarCreateFieldMode(options, null)).toBe("select");
    expect(resolveCalendarCreateFieldValue(options, null, "a")).toBe("a");
  });

  it("formats label for fixed display", () => {
    expect(calendarCreateFieldLabel(options, "b", "Специалист")).toBe("Beta");
    expect(calendarCreateFieldLabel(options, null, "Специалист")).toBe("—");
  });
});
