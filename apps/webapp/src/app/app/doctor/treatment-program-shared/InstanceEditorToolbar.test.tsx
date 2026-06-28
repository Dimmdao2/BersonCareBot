/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { InstanceEditorToolbar } from "./InstanceEditorToolbar";

const saveDraft = vi.fn();
const discardDraft = vi.fn();

const draftState = vi.hoisted(() => ({
  isDirty: true,
  saving: false,
  editLocked: false,
}));

vi.mock("./InstanceEditorDraftContext", () => ({
  useInstanceEditorDraft: () => ({
    isDirty: draftState.isDirty,
    saving: draftState.saving,
    discardDraft,
    saveDraft,
  }),
}));

vi.mock("./programInstanceMutationGuard", () => ({
  isProgramInstanceEditLocked: () => draftState.editLocked,
}));

 
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("react-hot-toast", () => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });
  return { default: toastFn };
});

describe("InstanceEditorToolbar", () => {
  beforeEach(() => {
    draftState.isDirty = true;
    draftState.saving = false;
    draftState.editLocked = false;
    saveDraft.mockReset();
    discardDraft.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  const baseProps = {
    programTitle: "План реабилитации",
    programStatus: "active" as const,
    pipelineStageCount: 0,
    onAddStageClick: vi.fn(),
    onChangeStageOrderClick: vi.fn(),
  };

  it("renders sticky full-bleed toolbar with program title and status badge", () => {
    render(<InstanceEditorToolbar {...baseProps} />);

    const toolbar = screen.getByTestId("instance-editor-toolbar");
    expect(toolbar).toHaveClass("sticky", "-mx-3");
    // Canonical context-aware sticky offset (0 on desktop, mobile-header height on <md) — task #49.
    expect(toolbar.className).toMatch(/top-\[var\(--doctor-sticky-offset\)\]/);

    expect(screen.getByRole("heading", { name: /план реабилитации/i })).toBeInTheDocument();
    expect(screen.queryByTestId("instance-editor-comments")).not.toBeInTheDocument();
    expect(screen.getByTestId("instance-editor-add-stage")).toBeInTheDocument();
    expect(screen.getByTestId("instance-editor-change-stage-order")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/несохранённые изменения/i);
  });

  it("enables change-order when at least two pipeline stages", () => {
    render(<InstanceEditorToolbar {...baseProps} pipelineStageCount={2} />);
    expect(screen.getByTestId("instance-editor-change-stage-order")).toBeEnabled();
  });

  it("locks editor actions when program is completed", () => {
    draftState.editLocked = true;
    render(<InstanceEditorToolbar {...baseProps} programStatus="completed" pipelineStageCount={2} />);

    expect(screen.getByTestId("instance-editor-add-stage")).toBeDisabled();
    expect(screen.getByTestId("instance-editor-change-stage-order")).toBeDisabled();
    expect(screen.getByRole("button", { name: /^сохранить изменения$/i })).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hides dirty hint and cancel when draft is clean", () => {
    draftState.isDirty = false;
    render(<InstanceEditorToolbar {...baseProps} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^отменить$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^сохранить изменения$/i })).toBeDisabled();
  });

  it("successful save shows success toast", async () => {
    saveDraft.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<InstanceEditorToolbar {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /^сохранить изменения$/i }));

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Изменения сохранены");
  });

  it("failed save shows error toast", async () => {
    saveDraft.mockResolvedValue({ ok: false, error: "Ошибка сохранения" });
    const user = userEvent.setup();
    render(<InstanceEditorToolbar {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /^сохранить изменения$/i }));

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Ошибка сохранения");
  });

  it("discard resets draft", async () => {
    const user = userEvent.setup();
    render(<InstanceEditorToolbar {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /^отменить$/i }));
    expect(discardDraft).toHaveBeenCalledTimes(1);
  });

  it("routes toolbar callbacks", async () => {
    const onAddStageClick = vi.fn();
    const onChangeStageOrderClick = vi.fn();
    const user = userEvent.setup();
    render(
      <InstanceEditorToolbar
        {...baseProps}
        pipelineStageCount={2}
        onAddStageClick={onAddStageClick}
        onChangeStageOrderClick={onChangeStageOrderClick}
      />,
    );

    await user.click(screen.getByTestId("instance-editor-add-stage"));
    await user.click(screen.getByTestId("instance-editor-change-stage-order"));

    expect(onAddStageClick).toHaveBeenCalledTimes(1);
    expect(onChangeStageOrderClick).toHaveBeenCalledTimes(1);
  });
});
