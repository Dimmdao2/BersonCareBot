/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Напоминание")).toBeInTheDocument();
  });

  it("shows audience label in detail section", () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    expect(screen.getByText("Telegram-пользователи")).toBeInTheDocument();
  });

  it("shows channel labels in detail section", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ channels: ["sms"] })]} />);
    expect(screen.getByText(/SMS/)).toBeInTheDocument();
  });

  it("does not show error text when errorCount is zero", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ errorCount: 0 })]} />);
    expect(screen.queryByText(/Не удалось доставить/i)).not.toBeInTheDocument();
  });

  it("shows error count when errorCount > 0", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ errorCount: 2 })]} />);
    expect(screen.getByText(/Не удалось доставить: 2/i)).toBeInTheDocument();
  });

  it("shows menu line in details when attachMenuAfterSend", () => {
    render(
      <BroadcastAuditLog
        entries={[makeEntry({ attachMenuAfterSend: true, deliveryJobsTotal: 1, sentCount: 1 })]}
      />,
    );
    expect(screen.getByText("Меню в чате обновлялось.")).toBeInTheDocument();
  });

  it("does not show menu line when attachMenuAfterSend is false", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ attachMenuAfterSend: false })]} />);
    expect(screen.queryByText("Меню в чате обновлялось.")).not.toBeInTheDocument();
  });

  it("renders a <details> element per entry for accordion behavior", () => {
    const entries = [makeEntry({ id: "e1" }), makeEntry({ id: "e2", messageTitle: "Вторая" })];
    const { container } = render(<BroadcastAuditLog entries={entries} />);
    expect(container.querySelectorAll("details")).toHaveLength(2);
  });

  it("shows delivery progress in summary", () => {
    render(
      <BroadcastAuditLog
        entries={[makeEntry({ deliveryJobsTotal: 10, sentCount: 7, audienceSize: 10 })]}
      />,
    );
    expect(screen.getByText("7 из 10 доставлено")).toBeInTheDocument();
  });
});
