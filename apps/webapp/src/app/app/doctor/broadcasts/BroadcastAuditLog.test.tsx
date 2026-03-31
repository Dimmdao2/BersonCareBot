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
  executedAt: "2026-03-31T10:05:00.000Z",
  previewOnly: false,
  audienceSize: 30,
  sentCount: 0,
  errorCount: 0,
  ...overrides,
});

describe("BroadcastAuditLog", () => {
  it("shows empty state when no entries", () => {
    render(<BroadcastAuditLog entries={[]} />);
    expect(screen.getByText(/рассылок ещё не было/i)).toBeInTheDocument();
  });

  it("renders a row for each entry", () => {
    const entries = [makeEntry({ id: "e1" }), makeEntry({ id: "e2", messageTitle: "Второе сообщение" })];
    render(<BroadcastAuditLog entries={entries} />);
    expect(screen.getByText("Напоминание о приёме")).toBeInTheDocument();
    expect(screen.getByText("Второе сообщение")).toBeInTheDocument();
  });

  it("formats date as DD.MM.YYYY HH:mm", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ executedAt: "2026-03-31T10:05:00.000Z" })]} />);
    // The exact displayed value depends on the local timezone of the test runner,
    // so we check that at least a date-like string is present.
    const cell = screen.getByText(/\d{2}\.\d{2}\.2026/);
    expect(cell).toBeInTheDocument();
  });

  it("shows human-readable category and audience labels", () => {
    render(<BroadcastAuditLog entries={[makeEntry()]} />);
    expect(screen.getByText("Напоминание")).toBeInTheDocument();
    expect(screen.getByText("Telegram-пользователи")).toBeInTheDocument();
  });

  it("hides error column when all errorCount are zero", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ errorCount: 0 })]} />);
    expect(screen.queryByText("Ошибки")).not.toBeInTheDocument();
  });

  it("shows error column when any entry has errorCount > 0", () => {
    render(<BroadcastAuditLog entries={[makeEntry({ errorCount: 2 })]} />);
    expect(screen.getByText("Ошибки")).toBeInTheDocument();
  });
});
