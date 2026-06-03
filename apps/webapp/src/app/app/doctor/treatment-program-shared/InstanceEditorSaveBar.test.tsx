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
    vi.mocked(toast.error).mockReset();
  });

  it("successful save shows success toast", async () => {
    saveDraft.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<InstanceEditorSaveBar />);

    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Изменения сохранены");
  });

  it("failed save shows error toast", async () => {
    saveDraft.mockResolvedValue({ ok: false, error: "Ошибка" });
    const user = userEvent.setup();
    render(<InstanceEditorSaveBar />);

    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Ошибка");
  });
});
