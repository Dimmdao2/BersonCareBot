/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstanceEditorStageOrderDialog } from "./InstanceEditorStageOrderDialog";

const setStageOrder = vi.fn();

vi.mock("./InstanceEditorDraftContext", () => ({
  useInstanceEditorDraft: () => ({ setStageOrder }),
}));

vi.mock("./programInstanceMutationGuard", () => ({
  isProgramInstanceEditLocked: (status: string) => status === "completed",
}));

vi.mock("./TreatmentProgramDndUi", () => ({
  TreatmentProgramPipelineStagesDnd: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stage-order-dnd">{children}</div>
  ),
  TreatmentProgramSortablePipelineStage: ({
    children,
    id,
  }: {
    children: (handle: React.ReactNode) => React.ReactNode;
    id: string;
  }) => <div data-stage-order-id={id}>{children(<span data-testid="drag-handle" />)}</div>,
}));

const STAGE_ZERO = "00000000-0000-4000-8000-000000000001";
const STAGE_A = "00000000-0000-4000-8000-000000000002";
const STAGE_B = "00000000-0000-4000-8000-000000000003";

describe("InstanceEditorStageOrderDialog", () => {
  beforeEach(() => {
    setStageOrder.mockReset();
  });

  it("saves pipeline order into draft and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <InstanceEditorStageOrderDialog
        open
        onOpenChange={onOpenChange}
        programStatus="active"
        stageZeroId={STAGE_ZERO}
        pipelineStages={[
          { id: STAGE_A, title: "Этап A" },
          { id: STAGE_B, title: "Этап B" },
        ]}
      />,
    );

    expect(screen.getByText("Этап A")).toBeInTheDocument();
    expect(screen.getByText("Этап B")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^сохранить порядок$/i }));

    expect(setStageOrder).toHaveBeenCalledWith([STAGE_ZERO, STAGE_A, STAGE_B]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables save when program is completed", () => {
    render(
      <InstanceEditorStageOrderDialog
        open
        onOpenChange={vi.fn()}
        programStatus="completed"
        stageZeroId={STAGE_ZERO}
        pipelineStages={[{ id: STAGE_A, title: "Этап A" }]}
      />,
    );

    expect(screen.getByRole("button", { name: /^сохранить порядок$/i })).toBeDisabled();
  });

  it("refreshes pipeline list from latest props on open", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <InstanceEditorStageOrderDialog
        open={false}
        onOpenChange={onOpenChange}
        programStatus="active"
        stageZeroId={STAGE_ZERO}
        pipelineStages={[{ id: STAGE_A, title: "Этап A" }]}
      />,
    );

    rerender(
      <InstanceEditorStageOrderDialog
        open
        onOpenChange={onOpenChange}
        programStatus="active"
        stageZeroId={STAGE_ZERO}
        pipelineStages={[
          { id: STAGE_A, title: "Этап A" },
          { id: STAGE_B, title: "Этап B" },
        ]}
      />,
    );

    expect(screen.getByText("Этап A")).toBeInTheDocument();
    expect(screen.getByText("Этап B")).toBeInTheDocument();
  });
});
