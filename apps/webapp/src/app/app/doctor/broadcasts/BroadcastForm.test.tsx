/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const previewBroadcastAction = vi.fn();
const executeBroadcastAction = vi.fn();
const loadDraftAction = vi.fn();
const saveDraftAction = vi.fn();
const getChannelCountsAction = vi.fn();

vi.mock("./actions", () => ({
  previewBroadcastAction: (...args: unknown[]) => previewBroadcastAction(...args),
  executeBroadcastAction: (...args: unknown[]) => executeBroadcastAction(...args),
  loadDraftAction: (...args: unknown[]) => loadDraftAction(...args),
  saveDraftAction: (...args: unknown[]) => saveDraftAction(...args),
  getChannelCountsAction: (...args: unknown[]) => getChannelCountsAction(...args),
}));

import { BroadcastForm } from "./BroadcastForm";
import type { BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
import { deriveBroadcastDeliveryPolicy } from "@/modules/doctor-broadcasts/broadcastEligible";

/** Минимальный ответ превью, совместимый с `BroadcastConfirmStep`. */
function previewResult(
  base: Omit<BroadcastPreviewResult, "deliveryPolicyKind" | "deliveryPolicyDescriptionRu">,
): BroadcastPreviewResult {
  const policy = deriveBroadcastDeliveryPolicy(base.audienceFilter, base.channels);
  return {
    ...base,
    deliveryPolicyKind: policy.kind,
    deliveryPolicyDescriptionRu: policy.descriptionRu,
  };
}

/** Click the «Напоминание» category chip + pick audience + fill title/body. */
async function fillValidForm() {
  // Category chip "Напоминание" (reminder)
  await userEvent.click(screen.getByRole("button", { name: "Напоминание" }));
  // Audience select
  await userEvent.selectOptions(screen.getByLabelText(/аудитория/i), "with_telegram");
  await userEvent.type(screen.getByLabelText(/заголовок/i), "Заголовок теста");
  await userEvent.type(screen.getByLabelText(/текст сообщения/i), "Достаточно длинный текст");
}

describe("BroadcastForm", () => {
  beforeEach(() => {
    previewBroadcastAction.mockReset();
    executeBroadcastAction.mockReset();
    loadDraftAction.mockResolvedValue(null);
    saveDraftAction.mockResolvedValue(undefined);
    getChannelCountsAction.mockResolvedValue({ bot_message: 42, sms: 15, push: 0 });
  });

  it("does not call preview action when required fields are incomplete (preview button disabled)", async () => {
    render(<BroadcastForm />);
    const previewBtn = screen.getByRole("button", { name: /предпросмотр/i });
    expect(previewBtn).toBeDisabled();
    await userEvent.click(previewBtn);
    expect(previewBroadcastAction).not.toHaveBeenCalled();
  });

  it("calls previewBroadcastAction with correct BroadcastCommand when form is valid", async () => {
    previewBroadcastAction.mockResolvedValue(
      previewResult({
        audienceSize: 30,
        category: "reminder",
        audienceFilter: "with_telegram",
        channels: ["bot_message", "sms"],
      }),
    );

    render(<BroadcastForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /предпросмотр/i }));

    await waitFor(() => {
      expect(previewBroadcastAction).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "reminder",
          audienceFilter: "with_telegram",
          message: { title: "Заголовок теста", body: "Достаточно длинный текст" },
          attachMenuAfterSend: false,
        }),
      );
    });
  });

  it("category chips toggle correctly: clicking selected chip deselects it", async () => {
    render(<BroadcastForm />);
    const chip = screen.getByRole("button", { name: "Напоминание" });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("disables preview button while previewing", async () => {
    let resolvePreview!: (v: unknown) => void;
    const previewPromise = new Promise((resolve) => {
      resolvePreview = resolve;
    });
    previewBroadcastAction.mockReturnValue(previewPromise);

    render(<BroadcastForm />);
    await fillValidForm();
    const previewBtn = screen.getByRole("button", { name: /предпросмотр/i });
    expect(previewBtn).not.toBeDisabled();
    await userEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /загрузка/i })).toBeDisabled();
    });

    resolvePreview!(
      previewResult({
        audienceSize: 5,
        category: "reminder",
        audienceFilter: "with_telegram",
        channels: ["bot_message", "sms"],
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /подтверждение рассылки/i })).toBeInTheDocument();
    });
  });

  it("shows audience form warning only for approximate segments", async () => {
    render(<BroadcastForm />);
    await userEvent.selectOptions(screen.getByLabelText(/аудитория/i), "inactive");
    expect(document.getElementById("broadcast-audience-form-warning")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/аудитория/i), "with_telegram");
    expect(document.getElementById("broadcast-audience-form-warning")).not.toBeInTheDocument();
  });

  it("after successful preview renders confirm step with audience size", async () => {
    previewBroadcastAction.mockResolvedValue(
      previewResult({
        audienceSize: 99,
        category: "reminder",
        audienceFilter: "with_telegram",
        channels: ["bot_message", "sms"],
      }),
    );

    render(<BroadcastForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /предпросмотр/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /подтверждение рассылки/i })).toBeInTheDocument();
    });
    expect(document.getElementById("broadcast-audience-size")).toHaveTextContent("99");
  });

  it("after confirm shows sent message", async () => {
    previewBroadcastAction.mockResolvedValue(
      previewResult({
        audienceSize: 2,
        category: "reminder",
        audienceFilter: "with_telegram",
        channels: ["bot_message", "sms"],
      }),
    );
    executeBroadcastAction.mockResolvedValue({
      auditEntry: {
        id: "a1",
        actorId: "doctor-1",
        category: "reminder",
        audienceFilter: "with_telegram",
        messageTitle: "Заголовок теста",
        messageBody: "",
        channels: ["bot_message", "sms"],
        executedAt: new Date().toISOString(),
        previewOnly: false,
        audienceSize: 2,
        deliveryJobsTotal: 0,
        sentCount: 0,
        errorCount: 0,
        blockedRecipientCount: 0,
        attachMenuAfterSend: false,
      },
    });

    render(<BroadcastForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /предпросмотр/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /отправить/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));
    await waitFor(() => {
      expect(screen.getByText(/рассылка запущена/i)).toBeInTheDocument();
    });
    expect(document.getElementById("broadcast-sent-message")).toBeInTheDocument();
  });

  it("shows draft save button and calls saveDraftAction on click", async () => {
    render(<BroadcastForm />);
    const draftBtn = screen.getByRole("button", { name: /сохранить черновик/i });
    expect(draftBtn).toBeInTheDocument();
    await userEvent.click(draftBtn);
    await waitFor(() => {
      expect(saveDraftAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: "", body: "" }),
      );
    });
  });

  it("loads draft from loadDraftAction on mount", async () => {
    loadDraftAction.mockResolvedValue({
      category: "service",
      audience: "all",
      channels: ["sms"],
      title: "Черновик заголовок",
      body: "Черновик текст",
    });

    render(<BroadcastForm />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Черновик заголовок")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Черновик текст")).toBeInTheDocument();
  });

  it("shows channel counts from getChannelCountsAction", async () => {
    getChannelCountsAction.mockResolvedValue({ bot_message: 77, sms: 33, push: 0 });
    render(<BroadcastForm />);
    await waitFor(() => {
      expect(screen.getByText("77")).toBeInTheDocument();
      expect(screen.getByText("33")).toBeInTheDocument();
    });
  });
});
