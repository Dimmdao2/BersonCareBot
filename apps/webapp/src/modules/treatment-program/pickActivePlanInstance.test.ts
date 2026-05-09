import { describe, expect, it } from "vitest";
import { pickActivePlanInstance } from "./pickActivePlanInstance";
import type { TreatmentProgramInstanceSummary } from "./types";

function sum(partial: Partial<TreatmentProgramInstanceSummary> & Pick<TreatmentProgramInstanceSummary, "id">): TreatmentProgramInstanceSummary {
  return {
    id: partial.id,
    patientUserId: "p1",
    templateId: null,
    assignedBy: null,
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
