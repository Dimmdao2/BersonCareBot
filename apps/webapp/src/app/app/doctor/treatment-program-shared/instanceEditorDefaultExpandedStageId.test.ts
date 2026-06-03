import { describe, expect, it } from "vitest";
import { pickDefaultExpandedPipelineStageId } from "./instanceEditorDefaultExpandedStageId";

describe("pickDefaultExpandedPipelineStageId", () => {
  it("returns null for empty pipeline", () => {
    expect(pickDefaultExpandedPipelineStageId([])).toBeNull();
  });

  it("prefers lowest sortOrder in_progress when several in_progress", () => {
    const id = pickDefaultExpandedPipelineStageId([
      { id: "a", sortOrder: 2, status: "in_progress" },
      { id: "b", sortOrder: 1, status: "in_progress" },
    ]);
    expect(id).toBe("b");
  });

  it("prefers lowest sortOrder available when several available", () => {
    const id = pickDefaultExpandedPipelineStageId([
      { id: "a", sortOrder: 3, status: "available" },
      { id: "b", sortOrder: 1, status: "available" },
      { id: "c", sortOrder: 2, status: "locked" },
    ]);
    expect(id).toBe("b");
  });

  it("prefers in_progress over available and locked", () => {
    const id = pickDefaultExpandedPipelineStageId([
      { id: "a", sortOrder: 1, status: "available" },
      { id: "b", sortOrder: 2, status: "in_progress" },
      { id: "c", sortOrder: 3, status: "locked" },
    ]);
    expect(id).toBe("b");
  });

  it("prefers available when no in_progress", () => {
    const id = pickDefaultExpandedPipelineStageId([
      { id: "a", sortOrder: 1, status: "locked" },
      { id: "b", sortOrder: 2, status: "available" },
      { id: "c", sortOrder: 3, status: "locked" },
    ]);
    expect(id).toBe("b");
  });

  it("picks first unfinished by sortOrder when no in_progress or available", () => {
    const id = pickDefaultExpandedPipelineStageId([
      { id: "a", sortOrder: 2, status: "locked" },
      { id: "b", sortOrder: 1, status: "locked" },
      { id: "c", sortOrder: 3, status: "completed" },
    ]);
    expect(id).toBe("b");
  });

  it("falls back to first stage when all completed or skipped", () => {
    const id = pickDefaultExpandedPipelineStageId([
      { id: "a", sortOrder: 2, status: "completed" },
      { id: "b", sortOrder: 1, status: "skipped" },
    ]);
    expect(id).toBe("b");
  });
});
