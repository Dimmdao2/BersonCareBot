/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReminderRule } from "@/modules/reminders/types";
import { formatReminderScheduleLabel, PatientHomeNextReminderCard } from "./PatientHomeNextReminderCard";

describe("formatReminderScheduleLabel", () => {
  it("formats interval, window and days", () => {
    const rule = {
      id: "1",
      integratorUserId: "u",
      category: "lfk" as const,
      enabled: true,
      intervalMinutes: 120,
      windowStartMinute: 9 * 60,
      windowEndMinute: 21 * 60,
      daysMask: "1111111",
      fallbackEnabled: true,
      linkedObjectType: "custom" as const,
      linkedObjectId: null,
      customTitle: "T",
      customText: null,
      updatedAt: "",
    } satisfies ReminderRule;
    const s = formatReminderScheduleLabel(rule);
    expect(s).toContain("120");
    expect(s).toContain("09:00");
    expect(s).toContain("каждый день");
  });
});

describe("PatientHomeNextReminderCard", () => {
  it("links to reminders with warning action", () => {
    render(
      <PatientHomeNextReminderCard
        ruleLabel="Разминки"
        scheduleLabel="каждые 60 мин · 08:00–22:00 · каждый день"
        remindersHref="/app/patient/reminders"
      />,
    );
    expect(screen.getByText("Разминки")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Открыть напоминания/i })).toHaveAttribute(
      "href",
      "/app/patient/reminders",
    );
  });
});
