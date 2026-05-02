import { describe, expect, it } from "vitest";
import {
  doctorDifficulty1to10ClampedInt,
  doctorDifficulty1to10EndpointLabelColor,
  doctorDifficulty1to10TrackFill,
} from "./doctorDifficulty1to10";

describe("doctorDifficulty1to10", () => {
  it("clamps to 1..10", () => {
    expect(doctorDifficulty1to10ClampedInt(0)).toBe(1);
    expect(doctorDifficulty1to10ClampedInt(11)).toBe(10);
    expect(doctorDifficulty1to10ClampedInt(4.4)).toBe(4);
  });

  it("track fill and endpoint colors are hsl strings", () => {
    expect(doctorDifficulty1to10TrackFill(5)).toMatch(/^hsl\(/);
    expect(doctorDifficulty1to10EndpointLabelColor(1)).toMatch(/^hsl\(/);
    expect(doctorDifficulty1to10EndpointLabelColor(10)).toMatch(/^hsl\(/);
  });
});
