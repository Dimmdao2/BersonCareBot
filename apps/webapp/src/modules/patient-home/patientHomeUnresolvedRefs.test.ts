import { describe, expect, it } from "vitest";
import { describePatientHomeUnresolvedRef } from "@/modules/patient-home/patientHomeUnresolvedRefs";

describe("describePatientHomeUnresolvedRef", () => {
  it("formats missing_target", () => {
    expect(describePatientHomeUnresolvedRef({ kind: "missing_target", targetKey: "x" })).toMatch(/Цель не найдена/);
    expect(describePatientHomeUnresolvedRef({ kind: "missing_target", targetKey: "x" })).toContain("x");
  });

  it("formats course_unpublished", () => {
    expect(describePatientHomeUnresolvedRef({ kind: "course_unpublished" })).toMatch(/не опубликован/i);
  });

  it("formats block_hidden", () => {
    expect(describePatientHomeUnresolvedRef({ kind: "block_hidden" })).toMatch(/скрыт/i);
  });
});
