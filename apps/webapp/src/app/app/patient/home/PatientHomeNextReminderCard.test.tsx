/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeNextReminderCard } from "./PatientHomeNextReminderCard";
import type { ReminderRule } from "@/modules/reminders/types";
import { routePaths } from "@/app-layer/routes/paths";

const baseRule = (): ReminderRule => ({
  id: "r1",
  integratorUserId: "u1",
  category: "lfk",
  enabled: true,
  timezone: "Europe/Moscow",
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111111",
  fallbackEnabled: true,
  linkedObjectType: "content_page",
  linkedObjectId: "p1",
  customTitle: null,
  customText: null,
  scheduleType: "interval_window",
  scheduleData: null,
  reminderIntent: "generic",
  displayTitle: null,
  displayDescription: null,
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("PatientHomeNextReminderCard", () => {
  it("empty guest state links to login with next to reminders", () => {
    render(
      <PatientHomeNextReminderCard
        rule={null}
        scheduleLabel="Напоминания не настроены"
        anonymousGuest
        personalTierOk={false}
      />,
    );
    const ctas = screen.getAllByRole("link", { name: /Войти/i });
    expect(ctas[0]?.getAttribute("href")).toContain(`${routePaths.root}?next=`);
    expect(ctas[0]?.getAttribute("href")).toContain(encodeURIComponent(routePaths.patientReminders));
  });

  it("shows the calculated nearest occurrence label and link to reminders", () => {
    render(<PatientHomeNextReminderCard rule={baseRule()} scheduleLabel="ср, 10:15" />);
    expect(screen.getAllByText("ср, 10:15").length).toBeGreaterThanOrEqual(1);
    const [mobileCta, desktopCta] = screen.getAllByRole("link", { name: /Изменить/i });
    expect(mobileCta).toHaveAttribute("href", "/app/patient/reminders");
    expect(mobileCta).toHaveClass("self-end");
    expect(mobileCta).toHaveClass("min-h-8");
    expect(mobileCta).toHaveClass("md:hidden");
    expect(desktopCta).toHaveClass("self-end");
    expect(desktopCta).toHaveClass("max-md:hidden");
  });

  it("renders custom leading icon when blockIconImageUrl is set", () => {
    const { container } = render(
      <PatientHomeNextReminderCard
        rule={baseRule()}
        scheduleLabel="ср, 10:15"
        blockIconImageUrl="/api/media/cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/media/cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });

  it("shows n/N when reminderDaySummary has plannedTotal > 0", () => {
    render(
      <PatientHomeNextReminderCard
        rule={baseRule()}
        scheduleLabel="ср, 10:15"
        reminderDaySummary={{
          done: 2,
          plannedTotal: 5,
          muted: false,
          muteRemainingLabel: null,
          hasConfiguredSchedule: true,
        }}
      />,
    );
    expect(screen.getByLabelText(/Сегодня: 2 из 5/i)).toBeInTheDocument();
  });

  it("shows empty copy when plannedTotal is 0 and schedule is configured", () => {
    render(
      <PatientHomeNextReminderCard
        rule={baseRule()}
        scheduleLabel="ср, 10:15"
        reminderDaySummary={{
          done: 0,
          plannedTotal: 0,
          muted: false,
          muteRemainingLabel: null,
          hasConfiguredSchedule: true,
        }}
      />,
    );
    expect(screen.getByText("На сегодня напоминаний нет")).toBeInTheDocument();
  });

  it("omits empty-today line when schedule is not configured", () => {
    render(
      <PatientHomeNextReminderCard
        rule={baseRule()}
        scheduleLabel="ср, 10:15"
        reminderDaySummary={{
          done: 0,
          plannedTotal: 0,
          muted: false,
          muteRemainingLabel: null,
          hasConfiguredSchedule: false,
        }}
      />,
    );
    expect(screen.queryByText("На сегодня напоминаний нет")).toBeNull();
  });

  it("shows mute copy with remaining duration", () => {
    render(
      <PatientHomeNextReminderCard
        rule={baseRule()}
        scheduleLabel="ср, 10:15"
        reminderDaySummary={{
          done: 0,
          plannedTotal: 0,
          muted: true,
          muteRemainingLabel: "3 часа",
          hasConfiguredSchedule: true,
        }}
      />,
    );
    expect(screen.getAllByText("Напоминания заглушены на 3 часа").length).toBeGreaterThanOrEqual(1);
  });
});
