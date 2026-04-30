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
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("PatientHomeNextReminderCard", () => {
  it("empty guest state links to login with next to reminders", () => {
    render(
      <PatientHomeNextReminderCard rule={null} scheduleLabel="" anonymousGuest personalTierOk={false} />,
    );
    const cta = screen.getByRole("link", { name: /Войти и открыть напоминания/i });
    expect(cta.getAttribute("href")).toContain(`${routePaths.root}?next=`);
    expect(cta.getAttribute("href")).toContain(encodeURIComponent(routePaths.patientReminders));
  });

  it("shows the calculated nearest occurrence label and link to reminders", () => {
    render(<PatientHomeNextReminderCard rule={baseRule()} scheduleLabel="ср, 10:15" />);
    expect(screen.getByText(/Ближайшее срабатывание:/i)).toBeInTheDocument();
    expect(screen.getByText("ср, 10:15")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Открыть напоминания/i })).toHaveAttribute("href", "/app/patient/reminders");
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
});
