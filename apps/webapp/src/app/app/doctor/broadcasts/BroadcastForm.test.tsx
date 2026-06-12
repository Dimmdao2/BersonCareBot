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

/**
 * Fill a valid form.
 * - Category defaults to "organizational" (pre-selected chip).
 * - Audience: click combobox, then pick "Все клиенты".
 * - Title and body via typing.
 */
async function fillValidForm() {
  // Audience: click combobox to open, then pick an option
  const audienceInput = screen.getByRole("combobox");
  await userEvent.click(audienceInput);
  await waitFor(() => {
    expect(audienceInput).toHaveAttribute("aria-expanded", "true");
  });
  await userEvent.click(screen.getByRole("button", { name: "Все клиенты" }));
  await userEvent.type(screen.getByLabelText(/заголовок/i), "Заголовок теста");
  await userEvent.type(screen.getByLabelText(/текст сообщения/i), "Достаточно длинный текст");
}

describe("BroadcastForm", () => {
  beforeEach(() => {
    previewBroadcastAction.mockReset();
    executeBroadcastAction.mockReset();
    loadDraftAction.mockResolvedValue(null);
    saveDraftAction.mockResolvedValue(undefined);
    getChannelCountsAction.mockResolvedValue({
      bot_message: 42,
      telegram: 42,
      max: 18,
      sms: 15,
      push: 10,
      email: 25,
    });
  });

  it("does not call preview action when required fields are incomplete (preview button disabled)", async () => {
    render(<BroadcastForm />);
    const previewBtn = screen.getByRole("button", { name: /предпросмотр/i });
    expect(previewBtn).toBeDisabled();
    await userEvent.click(previewBtn);
    expect(previewBroadcastAction).not.toHaveBeenCalled();
  });

  it("renders 4 category chips in correct order: Организационное · Важное · Сервисное · Рекламное", () => {
    render(<BroadcastForm />);
    const chips = ["Организационное", "Важное", "Сервисное", "Рекламное"];
    const buttons = chips.map((name) => screen.getByRole("button", { name }));
    expect(buttons).toHaveLength(4);
    // Verify order: position of Организационное < Важное < Сервисное < Рекламное
    const allText = buttons.map((b) => b.textContent);
    expect(allText).toEqual(chips);
  });

  it("default category is 'organizational' (Организационное chip is pre-selected)", () => {
    render(<BroadcastForm />);
    const orgChip = screen.getByRole("button", { name: "Организационное" });
    expect(orgChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Важное" })).toHaveAttribute("aria-pressed", "false");
  });

  it("legacy category chips (Напоминание, etc.) are not rendered in form", () => {
    render(<BroadcastForm />);
    expect(screen.queryByRole("button", { name: "Напоминание" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Маркетинговое" })).not.toBeInTheDocument();
  });

  it("calls previewBroadcastAction with correct BroadcastCommand when form is valid", async () => {
    previewBroadcastAction.mockResolvedValue(
      previewResult({
        audienceSize: 30,
        category: "organizational",
        audienceFilter: "all",
        channels: ["telegram", "max", "push"],
      }),
    );

    render(<BroadcastForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /предпросмотр/i }));

    await waitFor(() => {
      expect(previewBroadcastAction).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "organizational",
          audienceFilter: "all",
          message: { title: "Заголовок теста", body: "Достаточно длинный текст" },
          attachMenuAfterSend: false,
        }),
      );
    });
    // Default channels should be telegram/max/push, not bot_message/sms
    const call = previewBroadcastAction.mock.calls[0]?.[0];
    expect(call.channels).toContain("telegram");
    expect(call.channels).toContain("max");
    expect(call.channels).toContain("push");
    expect(call.channels).not.toContain("bot_message");
  });

  it("category chips toggle correctly: clicking selected chip deselects it", async () => {
    render(<BroadcastForm />);
    const chip = screen.getByRole("button", { name: "Организационное" });
    expect(chip).toHaveAttribute("aria-pressed", "true"); // pre-selected by default
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
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
        category: "organizational",
        audienceFilter: "all",
        channels: ["telegram", "max", "push"],
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /подтверждение рассылки/i })).toBeInTheDocument();
    });
  });

  it("shows audience form warning only for approximate segments", async () => {
    render(<BroadcastForm />);
    const audienceInput = screen.getByRole("combobox");
    // Open dropdown and pick "inactive"
    await userEvent.click(audienceInput);
    await waitFor(() => {
      expect(audienceInput).toHaveAttribute("aria-expanded", "true");
    });
    await userEvent.click(
      screen.getByRole("button", { name: /неактивные.*90.*дней/i }),
    );
    expect(document.getElementById("broadcast-audience-form-warning")).toBeInTheDocument();
    // Now pick a non-approximate option
    await userEvent.click(audienceInput);
    await waitFor(() => {
      expect(audienceInput).toHaveAttribute("aria-expanded", "true");
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Все клиенты" }),
    );
    expect(document.getElementById("broadcast-audience-form-warning")).not.toBeInTheDocument();
  });

  it("after successful preview renders confirm step with audience size", async () => {
    previewBroadcastAction.mockResolvedValue(
      previewResult({
        audienceSize: 99,
        category: "organizational",
        audienceFilter: "all",
        channels: ["telegram", "max", "push"],
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
        category: "organizational",
        audienceFilter: "all",
        channels: ["telegram", "max", "push"],
      }),
    );
    executeBroadcastAction.mockResolvedValue({
      auditEntry: {
        id: "a1",
        actorId: "doctor-1",
        category: "organizational",
        audienceFilter: "all",
        messageTitle: "Заголовок теста",
        messageBody: "",
        channels: ["telegram", "max", "push"],
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

  it("loads draft from loadDraftAction on mount (draft category takes priority over default)", async () => {
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
    // Draft category "service" overrides default "organizational"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Сервисное" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(screen.getByRole("button", { name: "Организационное" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows channel counts from getChannelCountsAction", async () => {
    getChannelCountsAction.mockResolvedValue({
      bot_message: 42,
      telegram: 77,
      max: 33,
      sms: 15,
      push: 10,
      email: 25,
    });
    render(<BroadcastForm />);
    await waitFor(() => {
      expect(screen.getByText("77")).toBeInTheDocument();
      expect(screen.getByText("33")).toBeInTheDocument();
    });
  });
});
