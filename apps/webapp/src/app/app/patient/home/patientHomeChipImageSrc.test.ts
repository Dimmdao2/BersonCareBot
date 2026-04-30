/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { patientHomeChipFallbackImageSrc, patientHomeChipImageSrc } from "./patientHomeChipImageSrc";

describe("patientHomeChipImageSrc", () => {
  it("appends preview/sm for bare /api/media/uuid", () => {
    const id = "aaaaaaaa-bbbb-4ccc-8ccc-aaaaaaaaaaaa";
    expect(patientHomeChipImageSrc(`/api/media/${id}`)).toBe(`/api/media/${id}/preview/sm`);
    expect(patientHomeChipImageSrc(`/api/media/${id}/`)).toBe(`/api/media/${id}/preview/sm`);
    expect(patientHomeChipFallbackImageSrc(`/api/media/${id}`)).toBe(`/api/media/${id}`);
  });

  it("leaves non-matching URLs unchanged", () => {
    expect(patientHomeChipImageSrc("https://cdn.example.com/x.png")).toBe("https://cdn.example.com/x.png");
    expect(patientHomeChipImageSrc("/api/media/not-a-uuid")).toBe("/api/media/not-a-uuid");
    expect(patientHomeChipFallbackImageSrc("https://cdn.example.com/x.png")).toBe(null);
    expect(patientHomeChipImageSrc(null)).toBe(null);
    expect(patientHomeChipImageSrc(undefined)).toBe(undefined);
  });
});
