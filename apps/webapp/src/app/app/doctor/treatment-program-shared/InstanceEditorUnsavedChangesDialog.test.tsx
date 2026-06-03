/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  InstanceEditorDraftProvider,
  useInstanceEditorDraft,
} from "./InstanceEditorDraftContext";
import { useInstanceEditorUnsavedGate } from "./InstanceEditorUnsavedChangesDialog";
import { flushInstanceEditorDraft } from "./flushInstanceEditorDraft";

vi.mock("./flushInstanceEditorDraft", () => ({
  flushInstanceEditorDraft: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("react-hot-toast", () => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });
  return { default: toastFn };
});

function minimalDetail(): TreatmentProgramInstanceDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    title: "План",
    status: "active",
    assignmentSource: "doctor",
    assignedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        status: "available",
        skipReason: null,
        localComment: null,
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [],
      },
    ],
  };
}

function GateHarness(props: { onAction: () => void; dirtyMode: "structural" | "metadata" | "none" }) {
  const { addStageCreate, patchStageMetadata } = useInstanceEditorDraft();
  const { runOrPromptSave, unsavedDialog } = useInstanceEditorUnsavedGate();

  const markDirty = () => {
    if (props.dirtyMode === "structural") {
      addStageCreate({ title: "Draft stage" });
    } else if (props.dirtyMode === "metadata") {
      patchStageMetadata("22222222-2222-4222-8222-222222222222", { title: "Renamed" });
    }
  };

  return (
    <>
      <button type="button" onClick={markDirty}>
        Mark dirty
      </button>
      <button type="button" onClick={() => runOrPromptSave(props.onAction)}>
        Сменить статус
      </button>
      {unsavedDialog}
    </>
  );
}

function renderGate(dirtyMode: "structural" | "metadata" | "none", onAction = vi.fn()) {
  return render(
    <InstanceEditorDraftProvider baseline={minimalDetail()} programStatus="active" onBaselineSynced={vi.fn(async () => {})}>
      <GateHarness dirtyMode={dirtyMode} onAction={onAction} />
    </InstanceEditorDraftProvider>,
  );
}

describe("useInstanceEditorUnsavedGate", () => {
  beforeEach(() => {
    vi.mocked(flushInstanceEditorDraft).mockResolvedValue({ ok: true as const });
  });
  it("structural-only dirty runs status action without dialog", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderGate("structural", onAction);

    await user.click(screen.getByRole("button", { name: /mark dirty/i }));
    await user.click(screen.getByRole("button", { name: /сменить статус/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("flushable metadata dirty opens dialog and blocks status action", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderGate("metadata", onAction);

    await user.click(screen.getByRole("button", { name: /mark dirty/i }));
    await user.click(screen.getByRole("button", { name: /сменить статус/i }));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/для изменения статуса этапа \(программы\) необходимо сохранить изменения/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^сохранить$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /вернуться к редактированию/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /отменить изменения/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^закрыть$/i })).not.toBeInTheDocument();
  });

  it("save runs action after successful flush", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderGate("metadata", onAction);

    await user.click(screen.getByRole("button", { name: /mark dirty/i }));
    await user.click(screen.getByRole("button", { name: /сменить статус/i }));
    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("return to editing clears pending action without proceeding", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderGate("metadata", onAction);

    await user.click(screen.getByRole("button", { name: /mark dirty/i }));
    await user.click(screen.getByRole("button", { name: /сменить статус/i }));
    await user.click(screen.getByRole("button", { name: /вернуться к редактированию/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /сменить статус/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows toast and keeps dialog open when save fails", async () => {
    vi.mocked(flushInstanceEditorDraft).mockResolvedValueOnce({ ok: false, error: "Ошибка сохранения" });
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderGate("metadata", onAction);

    await user.click(screen.getByRole("button", { name: /mark dirty/i }));
    await user.click(screen.getByRole("button", { name: /сменить статус/i }));
    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Ошибка сохранения");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });
});
