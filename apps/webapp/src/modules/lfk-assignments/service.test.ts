import { describe, expect, it, vi } from "vitest";
import { createLfkAssignmentsService } from "./service";
import type { LfkAssignmentsPort } from "./ports";

describe("lfk-assignments service", () => {
  it("assignTemplateToPatient delegates to port", async () => {
    const port: LfkAssignmentsPort = {
      assignPublishedTemplateToPatient: vi.fn().mockResolvedValue({
        assignmentId: "a1",
        complexId: "c1",
      }),
    };
    const svc = createLfkAssignmentsService(port);
    const r = await svc.assignTemplateToPatient({
      templateId: "t1",
      patientUserId: "p1",
      assignedBy: "doc",
    });
    expect(r.complexId).toBe("c1");
    expect(port.assignPublishedTemplateToPatient).toHaveBeenCalledWith({
      templateId: "t1",
      patientUserId: "p1",
      assignedBy: "doc",
    });
  });

  it("rejects empty ids", async () => {
    const port: LfkAssignmentsPort = {
      assignPublishedTemplateToPatient: vi.fn(),
    };
    const svc = createLfkAssignmentsService(port);
    await expect(
      svc.assignTemplateToPatient({ templateId: "", patientUserId: "p", assignedBy: null })
    ).rejects.toThrow(/Некорректные/);
  });

  it("assignTemplateToPatient can be invoked twice (idempotency at DB layer)", async () => {
    const port: LfkAssignmentsPort = {
      assignPublishedTemplateToPatient: vi
        .fn()
        .mockResolvedValueOnce({ assignmentId: "a1", complexId: "c1" })
        .mockResolvedValueOnce({ assignmentId: "a1", complexId: "c2" }),
    };
    const svc = createLfkAssignmentsService(port);
    await svc.assignTemplateToPatient({
      templateId: "t1",
      patientUserId: "p1",
      assignedBy: "doc",
    });
    await svc.assignTemplateToPatient({
      templateId: "t1",
      patientUserId: "p1",
      assignedBy: "doc",
    });
    expect(port.assignPublishedTemplateToPatient).toHaveBeenCalledTimes(2);
  });
});
