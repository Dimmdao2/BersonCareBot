/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useInstanceEditorPipelineStageExpansion } from "./useInstanceEditorPipelineStageExpansion";

const pipelineStages = [
  { id: "stage-a", sortOrder: 1, status: "available" as const },
  { id: "stage-b", sortOrder: 2, status: "locked" as const },
];

describe("useInstanceEditorPipelineStageExpansion", () => {
  it("initializes default expanded stage synchronously when pipeline is present on mount", () => {
    const { result } = renderHook(() => useInstanceEditorPipelineStageExpansion(pipelineStages));

    expect(result.current.isStageExpanded("stage-a")).toBe(true);
    expect(result.current.isStageExpanded("stage-b")).toBe(false);
  });

  it("initializes default expanded stage once on mount", async () => {
    const { result } = renderHook(({ stages }) => useInstanceEditorPipelineStageExpansion(stages), {
      initialProps: { stages: pipelineStages },
    });

    await waitFor(() => {
      expect(result.current.isStageExpanded("stage-a")).toBe(true);
    });
    expect(result.current.isStageExpanded("stage-b")).toBe(false);
  });

  it("initializes when pipeline stages arrive after an empty mount", async () => {
    const { result, rerender } = renderHook(({ stages }) => useInstanceEditorPipelineStageExpansion(stages), {
      initialProps: { stages: [] as typeof pipelineStages },
    });

    expect(result.current.isStageExpanded("stage-a")).toBe(false);

    rerender({ stages: pipelineStages });

    await waitFor(() => {
      expect(result.current.isStageExpanded("stage-a")).toBe(true);
    });
  });

  it("does not reset expansion when pipelineStages reference updates", async () => {
    const { result, rerender } = renderHook(({ stages }) => useInstanceEditorPipelineStageExpansion(stages), {
      initialProps: { stages: pipelineStages },
    });

    await waitFor(() => {
      expect(result.current.isStageExpanded("stage-a")).toBe(true);
    });

    act(() => {
      result.current.setStageExpanded("stage-b", true);
      result.current.setStageExpanded("stage-a", false);
    });

    rerender({ stages: [...pipelineStages] });

    expect(result.current.isStageExpanded("stage-a")).toBe(false);
    expect(result.current.isStageExpanded("stage-b")).toBe(true);
  });

  it("toggles stages independently", async () => {
    const { result } = renderHook(() => useInstanceEditorPipelineStageExpansion(pipelineStages));

    await waitFor(() => {
      expect(result.current.isStageExpanded("stage-a")).toBe(true);
    });

    act(() => {
      result.current.setStageExpanded("stage-b", true);
    });
    expect(result.current.isStageExpanded("stage-a")).toBe(true);
    expect(result.current.isStageExpanded("stage-b")).toBe(true);

    act(() => {
      result.current.setStageExpanded("stage-a", false);
    });
    expect(result.current.isStageExpanded("stage-a")).toBe(false);
  });
});
