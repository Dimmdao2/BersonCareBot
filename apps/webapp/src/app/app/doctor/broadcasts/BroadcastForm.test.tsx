/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
import { getAudienceOptionLabel } from "./labels";
import type { BroadcastAuditEntry, BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
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
      screen.getByRole("button", { name: getAudienceOptionLabel("inactive") }),
    );
    await waitFor(() => {
      expect(document.getElementById("broadcast-audience-form-warning")).toBeInTheDocument();
    });
    // Now pick a non-approximate option
    await userEvent.click(audienceInput);
    await waitFor(() => {
      expect(audienceInput).toHaveAttribute("aria-expanded", "true");
    });
    await userEvent.click(
      screen.getByRole("button", { name: getAudienceOptionLabel("all") }),
    );
    await waitFor(() => {
      expect(document.getElementById("broadcast-audience-form-warning")).not.toBeInTheDocument();
    });
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

  // ----- Prefill (Создать на основе) -----

  const makePrefillEntry = (overrides: Partial<BroadcastAuditEntry> = {}): BroadcastAuditEntry => ({
    id: "pe1",
    actorId: "doctor-1",
    category: "important_notice",
    audienceFilter: "active_clients",
    messageTitle: "Важное сообщение",
    messageBody: "Текст важного сообщения для тестирования",
    channels: ["sms", "push"],
    executedAt: "2026-06-01T09:00:00.000Z",
    previewOnly: false,
    audienceSize: 50,
    deliveryJobsTotal: 50,
    sentCount: 50,
    errorCount: 0,
    blockedRecipientCount: 0,
    attachMenuAfterSend: false,
    ...overrides,
  });

  it("applies prefill entry data when prefill prop is provided (title, body, category, audience)", async () => {
    const entry = makePrefillEntry();
    render(<BroadcastForm prefill={{ entry, nonce: 1 }} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Важное сообщение")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Текст важного сообщения для тестирования")).toBeInTheDocument();
    // Category "important_notice" → "Важное"
    expect(screen.getByRole("button", { name: "Важное" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Организационное" })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies prefill channels (active channels from entry)", async () => {
    const entry = makePrefillEntry({ channels: ["sms", "email"] });
    render(<BroadcastForm prefill={{ entry, nonce: 1 }} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Важное сообщение")).toBeInTheDocument();
    });
    // SMS channel checkbox should be checked
    const smsLabel = screen.getByText("SMS").closest("label");
    expect(smsLabel?.querySelector('input[type="checkbox"]')).toBeChecked();
    // Telegram should NOT be checked (not in prefill channels)
    const telegramLabel = screen.getByText("Telegram").closest("label");
    expect(telegramLabel?.querySelector('input[type="checkbox"]')).not.toBeChecked();
  });

  it("re-applies prefill when nonce increments (idempotency: same entry, new nonce)", async () => {
    const entry = makePrefillEntry();
    const { rerender } = render(<BroadcastForm prefill={{ entry, nonce: 1 }} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Важное сообщение")).toBeInTheDocument();
    });

    // Simulate user clearing the title
    await userEvent.clear(screen.getByLabelText(/заголовок/i));
    expect(screen.getByLabelText(/заголовок/i)).toHaveValue("");

    // Re-click "Создать на основе" (same entry, new nonce)
    await act(async () => {
      rerender(<BroadcastForm prefill={{ entry, nonce: 2 }} />);
    });

    // Prefill should be re-applied
    await waitFor(() => {
      expect(screen.getByDisplayValue("Важное сообщение")).toBeInTheDocument();
    });
  });

  it("prefill overrides draft: draft does not overwrite prefill applied before draft loads", async () => {
    // Simulate slow draft load
    let resolveDraft!: (v: unknown) => void;
    loadDraftAction.mockReturnValue(new Promise((r) => { resolveDraft = r; }));

    const entry = makePrefillEntry();
    render(<BroadcastForm prefill={{ entry, nonce: 1 }} />);

    // Prefill is applied immediately (effect runs synchronously after mount)
    await waitFor(() => {
      expect(screen.getByDisplayValue("Важное сообщение")).toBeInTheDocument();
    });

    // Now resolve the draft with different data
    await act(async () => {
      resolveDraft({
        category: "service",
        audience: "all",
        channels: ["telegram"],
        title: "Черновик заголовок",
        body: "Черновик текст",
      });
    });

    // Draft should NOT overwrite the prefill
    expect(screen.getByDisplayValue("Важное сообщение")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Черновик заголовок")).not.toBeInTheDocument();
  });
});
