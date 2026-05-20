import { describe, expect, it } from "vitest";
import {
  patientHomeGoalsFlameCaption,
  patientHomeGoalsFlameOpacity,
  resolvePatientHomeGoalsFlameState,
} from "./patientHomeGoalsFlame";

describe("resolvePatientHomeGoalsFlameState", () => {
  it("returns null when there is no daily goal", () => {
    expect(resolvePatientHomeGoalsFlameState({ doneTotal: 2, plannedTotal: 0 })).toBeNull();
  });

  it("classifies incomplete, met, and exceeded", () => {
    expect(resolvePatientHomeGoalsFlameState({ doneTotal: 1, plannedTotal: 3 })).toBe("incomplete");
    expect(resolvePatientHomeGoalsFlameState({ doneTotal: 3, plannedTotal: 3 })).toBe("met");
    expect(resolvePatientHomeGoalsFlameState({ doneTotal: 4, plannedTotal: 3 })).toBe("exceeded");
  });
});

describe("patientHomeGoalsFlameOpacity", () => {
  it("dims flame until goals are met or exceeded", () => {
    expect(patientHomeGoalsFlameOpacity("incomplete")).toBe(0.22);
    expect(patientHomeGoalsFlameOpacity(null)).toBe(0.22);
    expect(patientHomeGoalsFlameOpacity("met")).toBe(1);
    expect(patientHomeGoalsFlameOpacity("exceeded")).toBe(1);
  });
});

describe("patientHomeGoalsFlameCaption", () => {
  it("returns user-facing copy per state", () => {
    expect(patientHomeGoalsFlameCaption("incomplete")).toBe("Еще немного и все получится!");
    expect(patientHomeGoalsFlameCaption("met")).toBe("Все цели выполнены!");
    expect(patientHomeGoalsFlameCaption("exceeded")).toBe("Цели перевыполнены! Так держать!");
  });
});
