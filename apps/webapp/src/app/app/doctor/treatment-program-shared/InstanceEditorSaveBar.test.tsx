/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { InstanceEditorSaveBar } from "./InstanceEditorSaveBar";

const saveDraft = vi.fn();
const discardDraft = vi.fn();

vi.mock("./InstanceEditorDraftContext", () => ({
  useInstanceEditorDraft: () => ({
    programStatus: "active",
    isDirty: true,
    saving: false,
    discardDraft,
    saveDraft,
  }),
}));

vi.mock("./programInstanceMutationGuard", () => ({
  isProgramInstanceEditLocked: () => false,
}));

vi.mock("react-hot-toast", () => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });
  return { default: toastFn };
});

describe("InstanceEditorSaveBar", () => {
  beforeEach(() => {
    saveDraft.mockReset();
    discardDraft.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast).mockReset();
  });

  it("structural-only save shows info toast", async () => {
    saveDraft.mockResolvedValue({ ok: false, structuralPending: true });
    const user = userEvent.setup();
    render(<InstanceEditorSaveBar />);

    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.stringContaining("batch-save"),
      expect.objectContaining({ icon: "ℹ️" }),
    );
  });

  it("metadata flush with structural left shows success hint", async () => {
    saveDraft.mockResolvedValue({ ok: true, structuralPending: true });
    const user = userEvent.setup();
    render(<InstanceEditorSaveBar />);

    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      expect.stringContaining("Структурные изменения"),
    );
  });
});
