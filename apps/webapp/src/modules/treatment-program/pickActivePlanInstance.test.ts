import { describe, expect, it } from "vitest";
import { pickActivePlanInstance, pickActivePlanInstanceForPatientHome } from "./pickActivePlanInstance";
import type { TreatmentProgramInstanceSummary } from "./types";

function sum(partial: Partial<TreatmentProgramInstanceSummary> & Pick<TreatmentProgramInstanceSummary, "id">): TreatmentProgramInstanceSummary {
  return {
    id: partial.id,
    patientUserId: "p1",
    templateId: null,
    assignedBy: null,
    assignmentSource: partial.assignmentSource ?? "doctor",
    title: partial.title ?? "T",
    status: partial.status ?? "active",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
  };
}

describe("pickActivePlanInstance", () => {
  it("returns null when no active instances", () => {
    expect(pickActivePlanInstance([sum({ id: "a", status: "completed" })])).toBeNull();
    expect(pickActivePlanInstance([])).toBeNull();
  });

  it("picks newest updatedAt among active", () => {
    const a = sum({ id: "old", status: "active", updatedAt: "2026-01-01T00:00:00.000Z" });
    const b = sum({ id: "new", status: "active", updatedAt: "2026-02-01T00:00:00.000Z" });
    expect(pickActivePlanInstance([a, b])?.id).toBe("new");
    expect(pickActivePlanInstance([b, a])?.id).toBe("new");
  });
});

describe("pickActivePlanInstanceForPatientHome", () => {
  it("returns null for promo-only active instance", () => {
    expect(
      pickActivePlanInstanceForPatientHome([
        sum({ id: "promo", status: "active", assignmentSource: "promo" }),
      ]),
    ).toBeNull();
  });

  it("returns doctor or course active instance", () => {
    const promo = sum({ id: "promo", status: "active", assignmentSource: "promo", updatedAt: "2026-03-01T00:00:00.000Z" });
    const course = sum({ id: "course", status: "active", assignmentSource: "course", updatedAt: "2026-02-01T00:00:00.000Z" });
    const doctor = sum({ id: "doctor", status: "active", assignmentSource: "doctor", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(pickActivePlanInstanceForPatientHome([promo, course, doctor])?.id).toBe("course");
    expect(pickActivePlanInstanceForPatientHome([promo])).toBeNull();
    expect(pickActivePlanInstanceForPatientHome([doctor])?.id).toBe("doctor");
  });
});
