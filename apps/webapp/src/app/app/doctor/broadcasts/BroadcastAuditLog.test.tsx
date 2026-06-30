/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BroadcastAuditLog } from "./BroadcastAuditLog";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";

const makeEntry = (overrides: Partial<BroadcastAuditEntry> = {}): BroadcastAuditEntry => ({
  id: "e1",
  actorId: "doctor-1",
  category: "reminder",
  audienceFilter: "with_telegram",
  messageTitle: "Напоминание о приёме",
  messageBody: "",
  deliveryJobsTotal: 0,
  channels: ["bot_message", "sms"],
  executedAt: "2026-03-31T10:05:00.000Z",
  previewOnly: false,
  audienceSize: 30,
  sentCount: 0,
  errorCount: 0,
  blockedRecipientCount: 0,
  attachMenuAfterSend: false,
  ...overrides,
});

describe("BroadcastAuditLog", () => {
  it("shows empty state when no entries", () => {
    render(<BroadcastAuditLog entries={[]} />);
    expect(screen.getByText(/рассылок ещё не было/i)).toBeInTheDocument();
  });

  it("renders a summary row for each entry", () => {
    const entries = [makeEntry({ id: "e1" }), makeEntry({ id: "e2", messageTitle: "Второе сообщение" })];
    render(<BroadcastAuditLog entries={entries} />);
    expect(screen.getByText("Напоминание о приёме")).toBeInTheDocument();
    expect(screen.getByText("Второе сообщение")).toBeInTheDocument();
  });

  it("formats date as DD.MM.YYYY HH:mm in summary", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ executedAt: "2026-03-31T10:05:00.000Z" })]} />);
    expect(screen.getByText(/\d{2}\.\d{2}\.2026/)).toBeInTheDocument();
  });

  it("shows human-readable category label in summary", () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    expect(screen.getAllByText("Напоминание")[0]).toBeInTheDocument();
  });

  it("shows audience label in summary row (collapsed)", () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    // Summary contains audience label
    expect(screen.getAllByText(/Telegram-пользователи/)[0]).toBeInTheDocument();
  });

  it("shows channel labels in summary row (collapsed)", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ channels: ["sms"] })]} />);
    expect(screen.getAllByText(/SMS/)[0]).toBeInTheDocument();
  });

  it("does not show error text when errorCount is zero", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ errorCount: 0 })]} />);
    expect(screen.queryByText(/Не удалось доставить/i)).not.toBeInTheDocument();
  });

  it("shows error count when errorCount > 0 (expanded)", async () => {
    render(<BroadcastAuditLog entries={[makeEntry({ errorCount: 2 })]} />);
    // expand the row
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    expect(screen.getByText(/Не удалось доставить: 2/i)).toBeInTheDocument();
  });

  it("shows menu line in details when attachMenuAfterSend (expanded)", async () => {
    render(
      <BroadcastAuditLog
        entries={[makeEntry({ attachMenuAfterSend: true, deliveryJobsTotal: 1, sentCount: 1 })]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    expect(screen.getByText("Меню в чате обновлялось.")).toBeInTheDocument();
  });

  it("does not show menu line when attachMenuAfterSend is false", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ attachMenuAfterSend: false })]} />);
    expect(screen.queryByText("Меню в чате обновлялось.")).not.toBeInTheDocument();
  });

  it("renders a button per entry for accordion behavior", () => {
    const entries = [makeEntry({ id: "e1" }), makeEntry({ id: "e2", messageTitle: "Вторая" })];
    const { container } = render(<BroadcastAuditLog entries={entries} />);
    // Each entry has an expand button
    expect(container.querySelectorAll("button[aria-expanded]")).toHaveLength(2);
  });

  it("shows delivery progress in summary", () => {
    render(
      <BroadcastAuditLog
        entries={[makeEntry({ deliveryJobsTotal: 10, sentCount: 7, audienceSize: 10 })]}
      />,
    );
    expect(screen.getByText("7 из 10 доставлено")).toBeInTheDocument();
  });

  // ----- Single-open accordion -----

  it("single-open: opening one row collapses another", async () => {
    const entries = [
      makeEntry({ id: "e1", messageTitle: "Первое", messageBody: "Уникальный текст первого" }),
      makeEntry({ id: "e2", messageTitle: "Второе", deliveryJobsTotal: 5, sentCount: 5 }),
    ];
    render(<BroadcastAuditLog entries={entries} />);

    const btn1 = screen.getByRole("button", { name: /Первое/ });
    const btn2 = screen.getByRole("button", { name: /Второе/ });

    await userEvent.click(btn1);
    expect(btn1).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Уникальный текст первого/)).toBeInTheDocument();

    await userEvent.click(btn2);
    expect(btn2).toHaveAttribute("aria-expanded", "true");
    expect(btn1).toHaveAttribute("aria-expanded", "false");
    // detail block of first entry is gone
    expect(screen.queryByText(/Уникальный текст первого/)).not.toBeInTheDocument();
  });

  it("single-open: clicking open row again collapses it", async () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    const btn = screen.getByRole("button", { name: /Напоминание о приёме/ });

    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  // ----- Full text (no truncation when open) -----

  it("shows full messageBody (no truncation) when entry is expanded", async () => {
    const longBody = "A".repeat(300);
    render(<BroadcastAuditLog entries={[makeEntry({ messageBody: longBody })]} />);
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    expect(screen.getByText(longBody)).toBeInTheDocument();
  });

  // ----- Audience + channels in summary -----

  it("shows audience and channels summary in collapsed row", () => {
    render(
      <BroadcastAuditLog
        entries={[makeEntry({ audienceFilter: "all", channels: ["telegram", "push"] })]}
      />,
    );
    // The summary span should contain both audience and channel labels
    expect(screen.getByText(/Все клиенты/)).toBeInTheDocument();
    expect(screen.getByText(/Telegram/)).toBeInTheDocument();
  });

  // ----- "Открыть ошибки →" action -----

  it("does not render 'Открыть ошибки' when onArchive is not provided", async () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    expect(screen.queryByText(/Открыть ошибки/i)).not.toBeInTheDocument();
  });

  it("renders 'Открыть ошибки →' in expanded block when onArchive is provided", async () => {
    const onArchive = vi.fn();
    render(<BroadcastAuditLog entries={[makeEntry()]} onArchive={onArchive} />);
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    const link = screen.getByRole("button", { name: /Открыть ошибки/i });
    expect(link).toBeInTheDocument();
  });

  it("calls onArchive when 'Открыть ошибки →' is clicked", async () => {
    const onArchive = vi.fn();
    render(<BroadcastAuditLog entries={[makeEntry()]} onArchive={onArchive} />);
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    await userEvent.click(screen.getByRole("button", { name: /Открыть ошибки/i }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  // ----- "Создать на основе" -----

  it("does not render 'Создать на основе' when onCreateFrom is not provided", async () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    expect(screen.queryByText(/Создать на основе/i)).not.toBeInTheDocument();
  });

  it("renders 'Создать на основе' in expanded block when onCreateFrom is provided", async () => {
    const onCreateFrom = vi.fn();
    render(<BroadcastAuditLog entries={[makeEntry()]} onCreateFrom={onCreateFrom} />);
    await userEvent.click(screen.getByRole("button", { name: /Напоминание о приёме/ }));
    expect(screen.getByRole("button", { name: /Создать на основе/i })).toBeInTheDocument();
  });

  it("calls onCreateFrom with the entry when 'Создать на основе' is clicked", async () => {
    const onCreateFrom = vi.fn();
    const entry = makeEntry({ id: "e-test", messageTitle: "Тест рассылки" });
    render(<BroadcastAuditLog entries={[entry]} onCreateFrom={onCreateFrom} />);
    await userEvent.click(screen.getByRole("button", { name: /Тест рассылки/ }));
    await userEvent.click(screen.getByRole("button", { name: /Создать на основе/i }));
    expect(onCreateFrom).toHaveBeenCalledTimes(1);
    expect(onCreateFrom).toHaveBeenCalledWith(entry);
  });
});
