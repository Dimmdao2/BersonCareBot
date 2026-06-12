/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks — прогрев чанков (webapp-tests-lean)
// ---------------------------------------------------------------------------

// FullCalendar — тяжёлый, мокаем stub
vi.mock("@fullcalendar/react", () => ({
  default: () => <div data-testid="fullcalendar" />,
}));
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/interaction", () => ({ default: {} }));
vi.mock("@fullcalendar/core/locales/ru", () => ({ default: {} }));

// DoctorCalendarEventPanel — мокаем stub
vi.mock("../../calendar/DoctorCalendarEventPanel", () => ({
  DoctorCalendarEventPanel: ({ selected, onClose }: { selected: unknown; onClose: () => void }) => (
    <div data-testid="event-panel">
      {selected ? <button data-testid="panel-close" onClick={onClose}>close</button> : <span data-testid="panel-empty">empty</span>}
    </div>
  ),
}));

// DoctorCalendarToolbarFilter
vi.mock("../../calendar/DoctorCalendarToolbarFilter", () => ({
  DoctorCalendarToolbarFilter: ({ noneLabel, onChange }: { noneLabel: string; onChange: (v: string | null) => void }) => (
    <button data-testid={`filter-${noneLabel}`} onClick={() => onChange("branch-1")}>
      {noneLabel}
    </button>
  ),
}));

// patchAdminSetting
vi.mock("@/app/app/settings/patchAdminSetting", () => ({
  patchAdminSetting: vi.fn(async () => true),
}));

// resolveCalendarCreateFieldValue
vi.mock("@/modules/booking-calendar/calendarCreateFieldMode", () => ({
  resolveCalendarCreateFieldValue: vi.fn((_opts: unknown, _active: unknown, prev: string | null) => prev),
}));

// appointmentStatusLabel
vi.mock("@/modules/booking-calendar/appointmentStatusLabels", () => ({
  appointmentStatusLabel: (status: string) => `status:${status}`,
  isCancelledAppointmentStatus: () => false,
}));

// ---------------------------------------------------------------------------
// Прогрев чанков в beforeAll (правило webapp-tests-lean-no-bloat)
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await import("./ScheduleCalendarTab");
}, 10_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCalendarResponse = (events: object[] = []) => ({
  ok: true,
  view: "weeklist" as const,
  anchorDate: "2026-06-09",
  timeZone: "Europe/Moscow",
  events,
  filters: { specialists: [], branches: [], rooms: [], services: [] },
  showWorkingHours: true,
});

const makeAppointment = (id: string, date: string) => ({
  kind: "appointment" as const,
  id,
  startAt: `${date}T11:00:00.000Z`,
  endAt: `${date}T12:00:00.000Z`,
  status: "confirmed" as any,
  source: "manual",
  specialistId: null,
  specialistName: null,
  branchId: null,
  branchTitle: null,
  roomId: null,
  roomTitle: null,
  serviceId: null,
  serviceTitle: "Сеанс",
  platformUserId: null,
  patientName: "Тест Пациент",
  patientPhone: null,
  bookingStatus: null,
  rubitimeId: null,
  rubitimeManageUrl: null,
  paymentStatus: null,
  prepaymentPending: false,
  packageUsageRef: null,
  packageTitle: null,
  rescheduleCount: 0,
  originalStartAt: null,
  formComments: [],
});

function setupFetchMock(response: object) {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(JSON.stringify(response)),
    json: () => Promise.resolve(response),
  } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScheduleCalendarTab", () => {
  async function setup(deepLinkParams: Record<string, string> = {}) {
    const { ScheduleCalendarTab } = await import("./ScheduleCalendarTab");
    return ScheduleCalendarTab;
  }

  it("renders view switcher buttons for all 4 views", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    const onDeepLinkChange = vi.fn();
    render(<ScheduleCalendarTab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("view-btn-day")).toBeInTheDocument();
      expect(screen.getByTestId("view-btn-week")).toBeInTheDocument();
      expect(screen.getByTestId("view-btn-weeklist")).toBeInTheDocument();
      expect(screen.getByTestId("view-btn-month")).toBeInTheDocument();
    });
  });

  it("defaults to weeklist view (main working mode)", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

    // weeklist button should appear active (default variant)
    await waitFor(() => {
      const btn = screen.getByTestId("view-btn-weeklist");
      expect(btn).toBeInTheDocument();
    });
    // weeklist view renders weeklist-view when no events
    await waitFor(() => {
      expect(screen.getByTestId("weeklist-empty")).toBeInTheDocument();
    });
  });

  it("renders weeklist view when deepLinkParams.view is weeklist", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "weeklist" }} onDeepLinkChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByTestId("fullcalendar")).not.toBeInTheDocument();
      expect(screen.getByTestId("weeklist-empty")).toBeInTheDocument();
    });
  });

  it("renders FullCalendar when view is 'week'", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "week" }} onDeepLinkChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });
  });

  it("renders FullCalendar when view is 'day'", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "day" }} onDeepLinkChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });
  });

  it("renders FullCalendar when view is 'month'", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "month" }} onDeepLinkChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
    });
  });

  it("switching to 'week' view calls onDeepLinkChange with view=week", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    const onDeepLinkChange = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "weeklist" }} onDeepLinkChange={onDeepLinkChange} />);

    await waitFor(() => screen.getByTestId("view-btn-week"));
    await user.click(screen.getByTestId("view-btn-week"));

    expect(onDeepLinkChange).toHaveBeenCalledWith("view", "week");
  });

  it("switching to 'day' view calls onDeepLinkChange with view=day", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    const onDeepLinkChange = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "weeklist" }} onDeepLinkChange={onDeepLinkChange} />);

    await waitFor(() => screen.getByTestId("view-btn-day"));
    await user.click(screen.getByTestId("view-btn-day"));

    expect(onDeepLinkChange).toHaveBeenCalledWith("view", "day");
  });

  it("switching to 'month' view calls onDeepLinkChange with view=month", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    const onDeepLinkChange = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "weeklist" }} onDeepLinkChange={onDeepLinkChange} />);

    await waitFor(() => screen.getByTestId("view-btn-month"));
    await user.click(screen.getByTestId("view-btn-month"));

    expect(onDeepLinkChange).toHaveBeenCalledWith("view", "month");
  });

  it("renders weeklist day groups with appointment cards", async () => {
    const appt = makeAppointment("appt-1", "2026-06-11");
    setupFetchMock(makeCalendarResponse([appt]));
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{ view: "weeklist", date: "2026-06-09" }} onDeepLinkChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("weeklist-view")).toBeInTheDocument();
      expect(screen.getByTestId("weeklist-appt-appt-1")).toBeInTheDocument();
      expect(screen.getByText("Тест Пациент")).toBeInTheDocument();
    });
  });

  it("deep-link: deepLinkParams.date is passed to anchor", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(
      <ScheduleCalendarTab
        deepLinkParams={{ view: "weeklist", date: "2026-06-15" }}
        onDeepLinkChange={vi.fn()}
      />,
    );
    // Verify period label contains June (anchor in June 2026, week of 15th = 15–21)
    await waitFor(() => {
      const label = screen.getByTestId("period-label");
      expect(label.textContent).toMatch(/июн/i);
    });
  });

  it("renders right panel (event panel)", async () => {
    setupFetchMock(makeCalendarResponse());
    const ScheduleCalendarTab = await setup();
    render(<ScheduleCalendarTab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("event-panel")).toBeInTheDocument();
    });
  });
});
