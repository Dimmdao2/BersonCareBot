/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstanceEditorAddStageDialog } from "./InstanceEditorAddStageDialog";

const addStageCreate = vi.fn();

vi.mock("./InstanceEditorDraftContext", () => ({
  useInstanceEditorDraft: () => ({ addStageCreate }),
}));

vi.mock("./programInstanceMutationGuard", () => ({
  isProgramInstanceEditLocked: (status: string) => status === "completed",
}));

describe("InstanceEditorAddStageDialog", () => {
  beforeEach(() => {
    addStageCreate.mockReset();
  });

  it("creates pipeline stage in draft and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <InstanceEditorAddStageDialog open programStatus="active" onOpenChange={onOpenChange} />,
    );

    await user.type(screen.getByLabelText(/название/i), "Этап 2");
    await user.click(screen.getByRole("button", { name: /^добавить$/i }));

    expect(addStageCreate).toHaveBeenCalledWith({ title: "Этап 2" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables submit when program is completed", () => {
    render(
      <InstanceEditorAddStageDialog open programStatus="completed" onOpenChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /^добавить$/i })).toBeDisabled();
  });
});
