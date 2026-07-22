/** @vitest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import { BroadcastAuditEntryDetail, BroadcastAuditLog } from "./BroadcastAuditLog";

const makeEntry = (overrides: Partial<BroadcastAuditEntry> = {}): BroadcastAuditEntry => ({
  id: "e1",
  actorId: "doctor-1",
  category: "reminder",
  audienceFilter: "with_telegram",
  messageTitle: "Напоминание о приёме",
  messageBody: "Полный текст напоминания\nсо второй строкой",
  deliveryJobsTotal: 10,
  channels: ["bot_message", "sms"],
  executedAt: "2026-03-31T10:05:00.000Z",
  previewOnly: false,
  audienceSize: 10,
  sentCount: 6,
  errorCount: 2,
  blockedRecipientCount: 1,
  attachMenuAfterSend: true,
  ...overrides,
});

describe("BroadcastAuditLog", () => {
  it("shows the empty state", () => {
    render(<BroadcastAuditLog entries={[]} onSelect={() => {}} />);
    expect(screen.getByText(/рассылок ещё не было/i)).toBeInTheDocument();
  });

  it("renders selectable rows with delivery, audience, and channel summaries", async () => {
    const onSelect = vi.fn();
    const entry = makeEntry();
    render(<BroadcastAuditLog entries={[entry]} selectedId={entry.id} onSelect={onSelect} />);

    const row = screen.getByRole("button", { name: /Напоминание о приёме/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveTextContent("6 из 10 доставлено");
    expect(row).toHaveTextContent("Telegram-пользователи");
    expect(row).toHaveTextContent("Сообщение в боте, SMS");

    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(entry);
  });
});

describe("BroadcastAuditEntryDetail", () => {
  it("shows title, full text, audience, channel, errors, and non-delivery metrics", () => {
    render(
      <BroadcastAuditEntryDetail
        entry={makeEntry()}
        onClose={() => {}}
        onOpenErrors={() => {}}
      />,
    );

    const detail = screen.getByTestId("broadcast-selected-detail");
    expect(within(detail).getByRole("heading", { name: "Напоминание о приёме" })).toBeInTheDocument();
    expect(within(detail).getByText(/Полный текст напоминания/)).toHaveClass(
      "whitespace-pre-wrap",
      "break-words",
    );
    expect(within(detail).getByText("Telegram-пользователи · 10")).toBeInTheDocument();
    expect(within(detail).getByText("Сообщение в боте, SMS")).toBeInTheDocument();
    expect(within(detail).getByText("Ошибки").nextElementSibling).toHaveTextContent("2");
    expect(within(detail).getByText("Недоставка").nextElementSibling).toHaveTextContent("4");
    expect(detail).not.toHaveClass("absolute");
  });

  it("keeps operational delivery states in one non-overlapping document flow", () => {
    render(
      <BroadcastAuditEntryDetail
        entry={makeEntry()}
        onClose={() => {}}
        onOpenErrors={() => {}}
      />,
    );

    expect(screen.getByText("6 из 10 доставлено")).toBeInTheDocument();
    expect(screen.getByText("Меню в чате обновлялось.")).toBeInTheDocument();
    expect(screen.getByText("Бот заблокирован: 1")).toBeInTheDocument();
    expect(screen.getByText("Не удалось доставить: 2")).toBeInTheDocument();
    expect(screen.getByText(/В очереди: 1/)).toBeInTheDocument();
  });

  it("has exactly one close control in the top panel", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <BroadcastAuditEntryDetail
        entry={makeEntry()}
        onClose={onClose}
        onOpenErrors={() => {}}
      />,
    );

    const closeButtons = screen.getAllByRole("button", { name: "Закрыть просмотр рассылки" });
    expect(closeButtons).toHaveLength(1);
    expect(container.querySelector("section > div:first-child")?.contains(closeButtons[0])).toBe(true);
    await userEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens the error log and can create a new broadcast from the selected entry", async () => {
    const entry = makeEntry();
    const onOpenErrors = vi.fn();
    const onCreateFrom = vi.fn();
    render(
      <BroadcastAuditEntryDetail
        entry={entry}
        onClose={() => {}}
        onOpenErrors={onOpenErrors}
        onCreateFrom={onCreateFrom}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Лог ошибок" }));
    expect(onOpenErrors).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Создать на основе" }));
    expect(onCreateFrom).toHaveBeenCalledWith(entry);
  });
});
