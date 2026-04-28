import { describe, expect, it } from "vitest";
import { parsePatientHomeMoodIcons } from "./patientHomeMoodIcons";

describe("parsePatientHomeMoodIcons", () => {
  it("returns defaults when null", () => {
    const out = parsePatientHomeMoodIcons(null);
    expect(out).toHaveLength(5);
    expect(out[0]?.score).toBe(1);
    expect(out[0]?.label).toBe("Очень плохо");
    expect(out[0]?.emoji).toBe("😣");
    expect(out[0]?.imageUrl).toBeNull();
  });

  it("merges labels and image URLs by score", () => {
    const out = parsePatientHomeMoodIcons({
      value: [
        { score: 1, label: "A", imageUrl: "/api/media/x" },
        { score: 5, label: "", imageUrl: null },
      ],
    });
    expect(out[0]?.label).toBe("A");
    expect(out[0]?.imageUrl).toBe("/api/media/x");
    expect(out[4]?.label).toBe("Отлично");
  });
});
