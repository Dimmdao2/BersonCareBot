/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks — прогрев чанков (webapp-tests-lean)
// ---------------------------------------------------------------------------

// FullCalendar — тяжёлый, мокаем stub
vi.mock("@fullcalendar/react", () => ({
  default: ({
    navLinkDayClick,
    dateClick,
    select,
  }: {
    navLinkDayClick?: (date: Date) => void;
    dateClick?: (arg: { date: Date; allDay: boolean }) => void;
    select?: (arg: { start: Date; end?: Date }) => void;
  }) => (
    <div data-testid="fullcalendar">
      <button
        data-testid="fc-day-header-click"
        onClick={() => navLinkDayClick?.(new Date("2026-06-15T00:00:00Z"))}
      >
        день-header
      </button>
      <button
        data-testid="fc-timegrid-click"
        onClick={() =>
          dateClick?.({ date: new Date("2026-06-17T11:00:00Z"), allDay: false })
        }
      >
        timegrid-click
      </button>
      <button
        data-testid="fc-allday-click"
        onClick={() =>
          dateClick?.({ date: new Date("2026-06-17T00:00:00Z"), allDay: true })
        }
      >
        allday-click
      </button>
      <button
        data-testid="fc-select"
        onClick={() => select?.({ start: new Date("2026-06-17T14:00:00Z"), end: new Date("2026-06-17T15:00:00Z") })}
      >
        select
      </button>
      {/* CR-2: click in post-shift nonworking zone (18:30 Moscow = 15:30 UTC) */}
      <button
        data-testid="fc-nonworking-click"
        onClick={() =>
          dateClick?.({ date: new Date("2026-06-17T15:30:00Z"), allDay: false })
        }
      >
        nonworking-click
      </button>
      {/* #228: drag select in nonworking zone — start at 09:30 UTC (before working hours 10:00 UTC) */}
      <button
        data-testid="fc-select-nonworking"
        onClick={() => select?.({ start: new Date("2026-06-17T09:30:00Z"), end: new Date("2026-06-17T10:00:00Z") })}
      >
        select-nonworking
      </button>
    </div>
  ),
}));
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/interaction", () => ({ default: {} }));
vi.mock("@fullcalendar/core/locales/ru", () => ({ default: {} }));

// DoctorCalendarEventPanel — мокаем stub
vi.mock("../../calendar/DoctorCalendarEventPanel", () => ({
  DoctorCalendarEventPanel: ({
    selected,
    onClose,
    onChanged,
    startInCreate,
    createInitialStart,
  }: {
    selected: unknown;
    onClose: () => void;
    onChanged?: () => void;
    startInCreate?: boolean;
    createInitialStart?: string | null;
  }) => (
    <div
      data-testid="event-panel"
      data-start-in-create={startInCreate ? "true" : "false"}
      data-create-initial-start={createInitialStart ?? ""}
    >
      {selected ? (
        <button data-testid="panel-close" onClick={onClose}>
          close
        </button>
      ) : (
        <span data-testid="panel-empty">empty</span>
      )}
      <button data-testid="panel-changed" onClick={onChanged}>
        changed
      </button>
    </div>
  ),
}));

// DoctorCalendarRescheduleDialog — мокаем stub (тяжёлый, не нужен в этих тестах)
vi.mock("../../calendar/DoctorCalendarRescheduleDialog", () => ({
  DoctorCalendarRescheduleDialog: () => null,
}));

// KpiPreviewModal — мокаем stub с data-testid, чтобы проверять items в тестах
vi.mock("@/shared/ui/doctor/KpiPreviewModal", () => ({
  KpiPreviewModal: ({
    open,
    title,
    count,
    items,
  }: {
    open: boolean;
    title: string;
    count: number;
    items: { id: string }[];
  }) =>
    open ? (
      <div data-testid="kpi-modal" data-title={title} data-count={count}>
        {items.map((item) => (
          <div key={item.id} data-testid={`modal-item-${item.id}`} />
        ))}
      </div>
    ) : null,
}));

// DoctorCalendarToolbarFilter
vi.mock("../../calendar/DoctorCalendarToolbarFilter", () => ({
  DoctorCalendarToolbarFilter: ({
    noneLabel,
    onChange,
  }: {
    noneLabel: string;
    onChange: (v: string | null) => void;
  }) => (
    <button data-testid={`filter-${noneLabel}`} onClick={() => onChange("branch-1")}>
      {noneLabel}
    </button>
  ),
}));

// resolveCalendarCreateFieldValue
vi.mock("@/modules/booking-calendar/calendarCreateFieldMode", () => ({
  resolveCalendarCreateFieldValue: vi.fn(
    (_opts: unknown, _active: unknown, prev: string | null) => prev,
  ),
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

const makeCalendarResponse = (events: object[] = [], workingBounds?: object) => ({
  ok: true,
  view: "3days",
  anchorDate: "2026-06-13",
  timeZone: "Europe/Moscow",
  events,
  filters: { specialists: [], branches: [], rooms: [], services: [] },
  showWorkingHours: true,
  workingBounds: workingBounds ?? null,
});

const makeKpisResponse = (firstVisitIds: string[] = []) => ({
  ok: true,
  kpis: {
    recordsInPeriod: 5,
    pastInPeriod: 2,
    futureInPeriod: 3,
    bySubscriptionInPeriod: 1,
    firstVisitInPeriod: firstVisitIds.length || 4,
    firstVisitIds,
    repeatVisitInPeriod: firstVisitIds.length ? 5 - firstVisitIds.length : 1,
    uniquePatientsInPeriod: 4,
    cancellationsInPeriod: 0,
    reschedulesInPeriod: 0,
  },
});

function setupFetchMock(
  calResponse: object,
  kpisResponse?: object,
  nearestWindowResponse?: object,
) {
  vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/doctor/schedule-kpis")) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(kpisResponse ?? makeKpisResponse())),
        json: () => Promise.resolve(kpisResponse ?? makeKpisResponse()),
      } as Response);
    }
    if (url.includes("/api/doctor/schedule/nearest-free-window")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            nearestWindowResponse ?? { ok: true, window: { from: "2026-06-13T11:00:00", to: "2026-06-13T12:00:00" } },
          ),
        text: () =>
          Promise.resolve(
            JSON.stringify(
              nearestWindowResponse ?? {
                ok: true,
                window: { from: "2026-06-13T11:00:00", to: "2026-06-13T12:00:00" },
              },
            ),
          ),
      } as Response);
    }
    // Default: calendar feed
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(calResponse)),
      json: () => Promise.resolve(calResponse),
    } as Response);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScheduleCalendarTab — v26 rebuild", () => {
  async function setup() {
    const { ScheduleCalendarTab } = await import("./ScheduleCalendarTab");
    return ScheduleCalendarTab;
  }

  // ─── D1: Тулбар — переключатель видов ───────────────────────────────────────

  describe("D1 — toolbar view switcher", () => {
    it("renders 3 view switcher buttons: 3days/weekgrid/month (no feed)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("view-btn-3days")).toBeInTheDocument();
        expect(screen.getByTestId("view-btn-weekgrid")).toBeInTheDocument();
        expect(screen.getByTestId("view-btn-month")).toBeInTheDocument();
        // feed button must be gone
        expect(screen.queryByTestId("view-btn-feed")).not.toBeInTheDocument();
      });
    });

    it("does NOT render a 'day' button in the view switcher", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.queryByTestId("view-btn-day")).not.toBeInTheDocument();
      });
    });

    it("defaults to 3days view and renders FullCalendar", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("view-btn-3days")).toBeInTheDocument();
        expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
      });
    });

    it("switching to weekgrid calls onDeepLinkChange(view, weekgrid)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

      await waitFor(() => screen.getByTestId("view-btn-weekgrid"));
      await user.click(screen.getByTestId("view-btn-weekgrid"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("view", "weekgrid");
    });

    it("switching to month calls onDeepLinkChange(view, month)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

      await waitFor(() => screen.getByTestId("view-btn-month"));
      await user.click(screen.getByTestId("view-btn-month"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("view", "month");
    });

    it("shows period label + arrows in 3days view", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("period-label")).toBeInTheDocument();
        expect(screen.getByTestId("period-prev")).toBeInTheDocument();
        expect(screen.getByTestId("period-next")).toBeInTheDocument();
      });
    });

    it("renders + Создать запись button always", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("create-appointment-btn")).toBeInTheDocument();
      });
    });

    it("renders filter buttons for Локация and Услуга", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("filter-Локация")).toBeInTheDocument();
        expect(screen.getByTestId("filter-Услуга")).toBeInTheDocument();
      });
    });
  });

  // ─── D1b: Тумблер Календарь/Список ──────────────────────────────────────────

  describe("D1b — render mode toggle (calendar / list)", () => {
    it("renders both calendar and list toggle buttons in toolbar", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("render-btn-calendar")).toBeInTheDocument();
        expect(screen.getByTestId("render-btn-list")).toBeInTheDocument();
      });
    });

    it("defaults to calendar mode — fullcalendar visible, list-view absent", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
        expect(screen.queryByTestId("list-view")).not.toBeInTheDocument();
      });
    });

    it("switching to list mode shows list-view and hides fullcalendar", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      await waitFor(() => {
        expect(screen.getByTestId("list-view")).toBeInTheDocument();
        expect(screen.queryByTestId("fullcalendar")).not.toBeInTheDocument();
      });
    });

    it("switching back to calendar from list restores fullcalendar", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));
      await waitFor(() => screen.getByTestId("list-view"));
      await user.click(screen.getByTestId("render-btn-calendar"));

      await waitFor(() => {
        expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
        expect(screen.queryByTestId("list-view")).not.toBeInTheDocument();
      });
    });

    it("toggle buttons are visible in day drill-down view too", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ view: "day" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("render-btn-calendar")).toBeInTheDocument();
        expect(screen.getByTestId("render-btn-list")).toBeInTheDocument();
      });
    });

    it("switching to list calls onDeepLinkChange(render, list)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("render", "list");
    });

    it("initialises from deepLinkParams.render=list", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ render: "list" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("list-view")).toBeInTheDocument();
        expect(screen.queryByTestId("fullcalendar")).not.toBeInTheDocument();
      });
    });
  });

  // ─── D1c: List view groups by day ────────────────────────────────────────────

  describe("D1c — list view groups appointments by day", () => {
    it("list view shows day cards for days with appointments", async () => {
      const events = [
        {
          kind: "appointment",
          id: "appt-1",
          startAt: "2026-06-13T10:00:00+03:00",
          endAt: "2026-06-13T11:00:00+03:00",
          status: "confirmed",
          patientName: "Иванов Иван",
          branchTitle: "Центр",
        },
        {
          kind: "appointment",
          id: "appt-2",
          startAt: "2026-06-14T09:00:00+03:00",
          endAt: "2026-06-14T10:00:00+03:00",
          status: "confirmed",
          patientName: "Петрова Анна",
          branchTitle: null,
        },
      ];
      setupFetchMock(makeCalendarResponse(events));
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      await waitFor(() => {
        // Day cards for each day that has appointments
        expect(screen.getByTestId("list-day-2026-06-13")).toBeInTheDocument();
        expect(screen.getByTestId("list-day-2026-06-14")).toBeInTheDocument();
        // Appointment buttons
        expect(screen.getByTestId("list-appt-appt-1")).toBeInTheDocument();
        expect(screen.getByTestId("list-appt-appt-2")).toBeInTheDocument();
      });
    });

    // Регресс §3.5-LIST: canonical-порт (pgBookingCalendar) отдаёт startAt/endAt
    // прямо из Postgres timestamptz — формат "2026-06-13 10:00:00+02" (пробел, не "T").
    // Строгий DateTime.fromISO его не парсил → список был пуст, хотя FullCalendar показывал
    // записи. Фид с этим форматом должен по-прежнему группироваться по дням.
    it("list view groups appointments with Postgres timestamptz format (space, short offset)", async () => {
      const events = [
        {
          kind: "appointment",
          id: "appt-pg-1",
          startAt: "2026-06-13 10:00:00+02",
          endAt: "2026-06-13 11:00:00+02",
          status: "confirmed",
          patientName: "Иванов Иван",
          branchTitle: "Центр",
        },
        {
          kind: "appointment",
          id: "appt-pg-2",
          startAt: "2026-06-14 09:00:00+02",
          endAt: "2026-06-14 10:00:00+02",
          status: "confirmed",
          patientName: "Петрова Анна",
          branchTitle: null,
        },
      ];
      setupFetchMock(makeCalendarResponse(events));
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      await waitFor(() => {
        expect(screen.getByTestId("list-day-2026-06-13")).toBeInTheDocument();
        expect(screen.getByTestId("list-day-2026-06-14")).toBeInTheDocument();
        expect(screen.getByTestId("list-appt-appt-pg-1")).toBeInTheDocument();
        expect(screen.getByTestId("list-appt-appt-pg-2")).toBeInTheDocument();
      });
    });

    it("list view shows empty state when no appointments in period", async () => {
      setupFetchMock(makeCalendarResponse([]));
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      await waitFor(() => {
        expect(screen.getByTestId("list-empty")).toBeInTheDocument();
      });
    });

    it("clicking appointment in list view calls onDeepLinkChange(appt, id)", async () => {
      const appt = {
        kind: "appointment",
        id: "appt-99",
        startAt: "2026-06-13T10:00:00+03:00",
        endAt: "2026-06-13T11:00:00+03:00",
        status: "confirmed",
        patientName: "Тест",
        branchTitle: null,
      };
      setupFetchMock(makeCalendarResponse([appt]));
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={onDeepLinkChange} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      await waitFor(() => screen.getByTestId("list-appt-appt-99"));
      await user.click(screen.getByTestId("list-appt-appt-99"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("appt", "appt-99");
    });

    it("list view has no load-more buttons (was feed-only)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("render-btn-list"));
      await user.click(screen.getByTestId("render-btn-list"));

      await waitFor(() => {
        expect(screen.queryByTestId("feed-load-past")).not.toBeInTheDocument();
        expect(screen.queryByTestId("feed-load-future")).not.toBeInTheDocument();
      });
    });
  });

  // ─── D2: KPI ──────────────────────────────────────────────────────────────

  describe("D2 — KPI row visibility", () => {
    it("shows KPI row in 3days view", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("cal-kpi-row")).toBeInTheDocument();
      });
    });

    it("shows KPI row in weekgrid view", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ view: "weekgrid" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("cal-kpi-row")).toBeInTheDocument();
      });
    });

    it("shows KPI row in month view", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ view: "month" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("cal-kpi-row")).toBeInTheDocument();
      });
    });

    it("HIDES KPI row in day (drill-down) view", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ view: "day" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.queryByTestId("cal-kpi-row")).not.toBeInTheDocument();
      });
    });

    it("renders all 9 KPI cards", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("kpi-recordsInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-pastInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-futureInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-bySubscriptionInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-firstVisitInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-repeatVisitInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-uniquePatientsInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-cancellationsInPeriod")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-reschedulesInPeriod")).toBeInTheDocument();
      });
    });

    it("KPI shows value 0 when kpis null after load (zeros)", async () => {
      setupFetchMock(makeCalendarResponse(), {
        ok: true,
        kpis: {
          recordsInPeriod: 0,
          pastInPeriod: 0,
          futureInPeriod: 0,
          bySubscriptionInPeriod: 0,
          firstVisitInPeriod: 0,
          firstVisitIds: [],
          repeatVisitInPeriod: 0,
          uniquePatientsInPeriod: 0,
          cancellationsInPeriod: 0,
          reschedulesInPeriod: 0,
        },
      });
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        const kpiEl = screen.getByTestId("kpi-recordsInPeriod");
        // Zero should render "0" not "—"
        expect(kpiEl.textContent).toContain("0");
      });
    });
  });

  // ─── D3: Drill-down day ───────────────────────────────────────────────────

  describe("D3 — drill-down day view", () => {
    it("shows '← Назад' button in day view", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ view: "day" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("drill-back-btn")).toBeInTheDocument();
      });
    });

    it("'← Назад' is NOT shown in 3days/weekgrid/month", async () => {
      for (const v of ["3days", "weekgrid", "month"] as const) {
        setupFetchMock(makeCalendarResponse());
        const Tab = await setup();
        const { unmount } = render(
          <Tab deepLinkParams={{ view: v }} onDeepLinkChange={vi.fn()} />,
        );
        await waitFor(() => {
          expect(screen.queryByTestId("drill-back-btn")).not.toBeInTheDocument();
        });
        unmount();
      }
    });

    it("clicking '← Назад' in day view calls onDeepLinkChange(view, from-view)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      // Simulate drill-down from weekgrid: deepLinkParams has from=weekgrid
      render(
        <Tab
          deepLinkParams={{ view: "day", date: "2026-06-15", from: "weekgrid" }}
          onDeepLinkChange={onDeepLinkChange}
        />,
      );

      await waitFor(() => screen.getByTestId("drill-back-btn"));
      await user.click(screen.getByTestId("drill-back-btn"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("view", "weekgrid");
      expect(onDeepLinkChange).toHaveBeenCalledWith("from", null);
    });

    it("clicking '← Назад' without from falls back to 3days", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Tab deepLinkParams={{ view: "day" }} onDeepLinkChange={onDeepLinkChange} />,
      );

      await waitFor(() => screen.getByTestId("drill-back-btn"));
      await user.click(screen.getByTestId("drill-back-btn"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("view", "3days");
    });
  });

  // ─── D4: Calendar renders (non-list mode) ────────────────────────────────────

  describe("D4 — calendar render mode", () => {
    it("calendar mode renders FullCalendar for 3days/weekgrid/month/day", async () => {
      for (const v of ["3days", "weekgrid", "month", "day"] as const) {
        setupFetchMock(makeCalendarResponse());
        const Tab = await setup();
        const { unmount } = render(
          <Tab deepLinkParams={{ view: v }} onDeepLinkChange={vi.fn()} />,
        );
        await waitFor(() => {
          expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
        });
        unmount();
      }
    });
  });

  // ─── D5: Right panel ─────────────────────────────────────────────────────

  describe("D5 — right panel stub / event panel", () => {
    it("shows empty stub when no appointment selected", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("right-panel-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("event-panel")).not.toBeInTheDocument();
      });
    });

    it("empty stub does NOT have a '+ Создать запись' button (it's in toolbar now)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        // The right-panel-create-btn is gone from stub
        expect(screen.queryByTestId("right-panel-create-btn")).not.toBeInTheDocument();
        // But toolbar CTA is still there
        expect(screen.getByTestId("create-appointment-btn")).toBeInTheDocument();
      });
    });

    it("clicking CTA in toolbar shows DoctorCalendarEventPanel", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("create-appointment-btn"));
      await user.click(screen.getByTestId("create-appointment-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("event-panel")).toBeInTheDocument();
        expect(screen.queryByTestId("right-panel-empty")).not.toBeInTheDocument();
      });
    });

    // §3.6 — панель открывается сразу в режиме создания (startInCreate=true)
    it("§3.6: CTA toolbar passes startInCreate=true to DoctorCalendarEventPanel", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("create-appointment-btn"));
      await user.click(screen.getByTestId("create-appointment-btn"));

      await waitFor(() => {
        const panel = screen.getByTestId("event-panel");
        expect(panel).toBeInTheDocument();
        expect(panel.getAttribute("data-start-in-create")).toBe("true");
      });
    });
  });

  // ─── D6: Deep-link ───────────────────────────────────────────────────────

  describe("D6 — deep-link sync", () => {
    it("initializes from deepLinkParams.view=weekgrid", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(<Tab deepLinkParams={{ view: "weekgrid" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId("fullcalendar")).toBeInTheDocument();
        // KPI visible in weekgrid
        expect(screen.getByTestId("cal-kpi-row")).toBeInTheDocument();
      });
    });

    it("deepLinkParams.date passed as anchor — period label contains June", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      render(
        <Tab
          deepLinkParams={{ view: "3days", date: "2026-06-13" }}
          onDeepLinkChange={vi.fn()}
        />,
      );
      await waitFor(() => {
        const label = screen.getByTestId("period-label");
        expect(label.textContent).toMatch(/июн/i);
      });
    });

    it("onDeepLinkChange called with date when navigating with arrows", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Tab
          deepLinkParams={{ date: "2026-06-13" }}
          onDeepLinkChange={onDeepLinkChange}
        />,
      );

      await waitFor(() => screen.getByTestId("period-next"));
      await user.click(screen.getByTestId("period-next"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("date", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    });
  });

  // ─── #228: dateClick = сброс выбора (НЕ создание), создание только через drag ─

  describe("#228 — dateClick resets selection (no longer opens create)", () => {
    it("clicking time-grid slot closes the create panel (does NOT open it)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      // Сначала открываем панель через + Создать запись
      await waitFor(() => screen.getByTestId("create-appointment-btn"));
      await user.click(screen.getByTestId("create-appointment-btn"));
      await waitFor(() => screen.getByTestId("event-panel"));

      // Клик по пустому месту — панель должна закрыться
      await user.click(screen.getByTestId("fc-timegrid-click"));
      await waitFor(() => {
        expect(screen.queryByTestId("event-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("right-panel-empty")).toBeInTheDocument();
      });
    });

    it("select (drag) opens create panel with start time (#228: only drag creates)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("fullcalendar"));
      await user.click(screen.getByTestId("fc-select"));

      await waitFor(() => {
        const panel = screen.getByTestId("event-panel");
        expect(panel).toBeInTheDocument();
        expect(panel.getAttribute("data-start-in-create")).toBe("true");
        // Fixed by #225-TZ: 14:00 UTC → 17:00 Moscow (UTC+3).
        expect(panel.getAttribute("data-create-initial-start")).toBe("2026-06-17T17:00");
      });
    });

    it("dateClick calls onDeepLinkChange(appt, null) to reset deep-link", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

      await waitFor(() => screen.getByTestId("fullcalendar"));
      await user.click(screen.getByTestId("fc-timegrid-click"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("appt", null);
    });
  });

  // ─── #227: onChanged снимает панель и выделение ──────────────────────────

  describe("#227 — onChanged closes panel (unselect on successful create)", () => {
    it("onChanged hides the event panel and shows empty stub", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={vi.fn()} />);

      // Открываем панель создания через drag (onSelect)
      await waitFor(() => screen.getByTestId("fullcalendar"));
      await user.click(screen.getByTestId("fc-select"));
      await waitFor(() => screen.getByTestId("event-panel"));

      // Симулируем успешное создание (onChanged)
      await user.click(screen.getByTestId("panel-changed"));

      await waitFor(() => {
        expect(screen.queryByTestId("event-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("right-panel-empty")).toBeInTheDocument();
      });
    });

    it("onChanged calls onDeepLinkChange(appt, null)", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const onDeepLinkChange = vi.fn();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{}} onDeepLinkChange={onDeepLinkChange} />);

      await waitFor(() => screen.getByTestId("fullcalendar"));
      await user.click(screen.getByTestId("fc-select"));
      await waitFor(() => screen.getByTestId("event-panel"));

      onDeepLinkChange.mockClear();
      await user.click(screen.getByTestId("panel-changed"));

      expect(onDeepLinkChange).toHaveBeenCalledWith("appt", null);
    });
  });

  // ─── CR-2: dateClick non-working zone guard ───────────────────────────────

  // ─── CR-2 / #228: dateClick всегда = сброс (никогда не открывает создание) ──

  describe("CR-2 / #228 — dateClick never opens create panel (only drag does)", () => {
    it("click in any area (working or non-working) does NOT open create panel", async () => {
      setupFetchMock(makeCalendarResponse());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-17" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("fullcalendar"));

      // Both working and non-working clicks must NOT open the create panel
      await user.click(screen.getByTestId("fc-timegrid-click"));
      await new Promise((r) => setTimeout(r, 100));
      expect(screen.queryByTestId("event-panel")).not.toBeInTheDocument();
      expect(screen.getByTestId("right-panel-empty")).toBeInTheDocument();

      await user.click(screen.getByTestId("fc-nonworking-click"));
      await new Promise((r) => setTimeout(r, 100));
      expect(screen.queryByTestId("event-panel")).not.toBeInTheDocument();
    });
  });

  // ─── #228: onSelect guard — нерабочая зона не открывает создание ─────────

  describe("#228 — onSelect guard: drag in nonworking zone does not open create panel", () => {
    // Helper: response with a working event 10:00-18:00 UTC on 2026-06-17.
    // Non-working zone includes 09:00-10:00 UTC (before working hours).
    // fc-select-nonworking fires at 09:30 UTC (before 10:00 UTC working start).
    const makeResponseWithWorkingEvent = () => ({
      ok: true,
      view: "3days",
      anchorDate: "2026-06-17",
      timeZone: "UTC",
      events: [
        {
          kind: "working",
          id: "wk-1",
          startAt: "2026-06-17T10:00:00Z",
          endAt: "2026-06-17T18:00:00Z",
        },
      ],
      filters: { specialists: [], branches: [], rooms: [], services: [] },
      showWorkingHours: true,
      workingBounds: { minMinute: 540, maxMinute: 1080 }, // 09:00-18:00 slot
    });

    it("drag in nonworking zone (09:30 UTC, before working 10:00 UTC) does NOT open create panel", async () => {
      setupFetchMock(makeResponseWithWorkingEvent());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-17" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("fullcalendar"));
      // Wait for data to load (working events create nonworking fill)
      await new Promise((r) => setTimeout(r, 50));

      // Click fc-select-nonworking (09:30 UTC = before working 10:00 UTC)
      await user.click(screen.getByTestId("fc-select-nonworking"));

      await new Promise((r) => setTimeout(r, 100));
      // Panel must NOT be opened
      expect(screen.queryByTestId("event-panel")).not.toBeInTheDocument();
      expect(screen.getByTestId("right-panel-empty")).toBeInTheDocument();
    });

    it("drag in working zone (14:00 UTC, within 10:00-18:00) DOES open create panel", async () => {
      setupFetchMock(makeResponseWithWorkingEvent());
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-17" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("fullcalendar"));

      // fc-select fires at 14:00 UTC (inside working hours 10:00-18:00)
      await user.click(screen.getByTestId("fc-select"));

      await waitFor(() => {
        expect(screen.getByTestId("event-panel")).toBeInTheDocument();
      });
    });
  });

  // ─── deriveSlotTimes helper (#231 SHIFT/EXPAND) ──────────────────────────

  describe("deriveSlotTimes helper — #231 SHIFT/EXPAND window logic", () => {
    // Сценарий 1: нет данных → 9:00–19:00
    it("no data at all → default window 09:00–19:00", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      const result = deriveSlotTimes(null, [], "UTC");
      expect(result.slotMinTime).toBe("09:00:00");
      expect(result.slotMaxTime).toBe("19:00:00");
      expect(result.loMinute).toBe(540);
      expect(result.hiMinute).toBe(1140);
    });

    // Сценарий 2: одна запись 08:00–08:30 (ниже дефолта) → SHIFT вниз
    it("single appointment at 08:00–08:30 → SHIFT down (lo=480, hi=1080)", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      const events = [
        {
          kind: "appointment" as const, id: "e1",
          startAt: "2026-06-13T08:00:00Z", endAt: "2026-06-13T08:30:00Z",
          status: "confirmed" as const, patientName: "T", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
      ];
      // dataLo=480, dataHi=510, span=30 ≤ 600 → SHIFT вниз (480<540)
      // lo=480, hi=480+600=1080
      const result = deriveSlotTimes(null, events, "UTC");
      expect(result.slotMinTime).toBe("08:00:00");
      expect(result.slotMaxTime).toBe("18:00:00");
      expect(result.loMinute).toBe(480);
      expect(result.hiMinute).toBe(1080);
    });

    // Сценарий 3: одна запись 20:00–21:00 (выше дефолта) → SHIFT вверх
    it("single appointment at 20:00–21:00 → SHIFT up (lo=660, hi=1260)", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      const events = [
        {
          kind: "appointment" as const, id: "e2",
          startAt: "2026-06-13T20:00:00Z", endAt: "2026-06-13T21:00:00Z",
          status: "confirmed" as const, patientName: "T", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
      ];
      // dataLo=1200, dataHi=1260, span=60 ≤ 600 → SHIFT вверх (1260>1140)
      // hi=1260, lo=1260-600=660
      const result = deriveSlotTimes(null, events, "UTC");
      expect(result.slotMinTime).toBe("11:00:00");
      expect(result.slotMaxTime).toBe("21:00:00");
      expect(result.loMinute).toBe(660);
      expect(result.hiMinute).toBe(1260);
    });

    // Сценарий 4: записи 07:00 и 21:00 (span=14ч=840>600) → EXPAND
    it("appointments at 07:00 and 21:00 (span=840>600) → EXPAND", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      const events = [
        {
          kind: "appointment" as const, id: "e3",
          startAt: "2026-06-13T07:00:00Z", endAt: "2026-06-13T07:30:00Z",
          status: "confirmed" as const, patientName: "T", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
        {
          kind: "appointment" as const, id: "e4",
          startAt: "2026-06-13T21:00:00Z", endAt: "2026-06-13T21:30:00Z",
          status: "confirmed" as const, patientName: "T2", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
      ];
      // dataLo=420, dataHi=1290, span=870>600 → EXPAND
      // lo=min(420,540)=420, hi=max(1290,1140)=1290
      const result = deriveSlotTimes(null, events, "UTC");
      expect(result.slotMinTime).toBe("07:00:00");
      expect(result.slotMaxTime).toBe("21:30:00");
      expect(result.loMinute).toBe(420);
      expect(result.hiMinute).toBe(1290);
    });

    // Сценарий 5: рабочие часы 10:00–17:00 (уже дефолта) → SHIFT / остаётся 9–19
    it("workingBounds 10:00–17:00 (fits in default) → window stays 09:00–19:00", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      // dataLo=600, dataHi=1020, span=420 ≤ 600; внутри 540..1140 → 9–19
      const result = deriveSlotTimes({ minMinute: 600, maxMinute: 1020 }, [], "UTC");
      expect(result.slotMinTime).toBe("09:00:00");
      expect(result.slotMaxTime).toBe("19:00:00");
    });

    // Сценарий 6: рабочие часы 08:00–21:00 (span=780>600) → EXPAND
    it("workingBounds 08:00–21:00 (span=780>600) → EXPAND", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      // dataLo=480, dataHi=1260, span=780>600 → EXPAND
      // lo=min(480,540)=480, hi=max(1260,1140)=1260
      const result = deriveSlotTimes({ minMinute: 480, maxMinute: 1260 }, [], "UTC");
      expect(result.slotMinTime).toBe("08:00:00");
      expect(result.slotMaxTime).toBe("21:00:00");
      expect(result.loMinute).toBe(480);
      expect(result.hiMinute).toBe(1260);
    });

    // Сценарий 7: запись 10:00–18:00 (внутри дефолта) → ровно 9–19
    it("appointment at 10:00–18:00 (inside default) → exactly 09:00–19:00", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      const events = [
        {
          kind: "appointment" as const, id: "e5",
          startAt: "2026-06-13T10:00:00Z", endAt: "2026-06-13T18:00:00Z",
          status: "confirmed" as const, patientName: "T", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
      ];
      // dataLo=600, dataHi=1080, span=480 ≤ 600; внутри 540..1140 → 9–19
      const result = deriveSlotTimes(null, events, "UTC");
      expect(result.slotMinTime).toBe("09:00:00");
      expect(result.slotMaxTime).toBe("19:00:00");
    });

    // CAL-01 (legacy): 08:00 рабочие — SHIFT вниз (span=600=DEFAULT_SIZE)
    it("CAL-01: 08:00 working start (span==600) → SHIFT down → 08:00–18:00", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      // dataLo=480, dataHi=1080, span=600=DEFAULT_SIZE → SHIFT (480<540)
      // lo=480, hi=1080
      const result = deriveSlotTimes({ minMinute: 480, maxMinute: 1080 }, [], "UTC");
      expect(result.slotMinTime).toBe("08:00:00");
      expect(result.slotMaxTime).toBe("18:00:00");
    });

    // CAL-01: 09:00 рабочие — внутри дефолта → 9–19
    it("CAL-01: 09:00 working start → stays 09:00–19:00", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      // dataLo=540, dataHi=1080, span=540 ≤ 600; внутри 540..1140 → 9–19
      const result = deriveSlotTimes({ minMinute: 540, maxMinute: 1080 }, [], "UTC");
      expect(result.slotMinTime).toBe("09:00:00");
      expect(result.slotMaxTime).toBe("19:00:00");
    });

    // CAL-01: запись до рабочего периода → EXPAND (span > DEFAULT_SIZE)
    it("CAL-01: event at 07:30 before workingBounds 08:00–18:00 → EXPAND", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      // workingBounds.min=480 + event at 07:30=450 → dataLo=450, dataHi=1080
      // span=630 > 600 → EXPAND: lo=min(450,540)=450, hi=max(1080,1140)=1140
      const events = [
        {
          kind: "appointment" as const, id: "e1",
          startAt: "2026-06-13T07:30:00Z", endAt: "2026-06-13T08:00:00Z",
          status: "confirmed" as const, patientName: "Test", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
      ];
      const result = deriveSlotTimes({ minMinute: 480, maxMinute: 1080 }, events, "UTC");
      expect(result.slotMinTime).toBe("07:30:00");
      expect(result.slotMaxTime).toBe("19:00:00");
      expect(result.loMinute).toBe(450);
      expect(result.hiMinute).toBe(1140);
    });

    // Дополнительно: event at 07:00 без рабочих часов → SHIFT вниз
    it("event at 07:00–08:00 (no workingBounds) → SHIFT down (lo=420, hi=1020)", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      const events = [
        {
          kind: "appointment" as const, id: "e1",
          startAt: "2026-06-13T07:00:00Z", endAt: "2026-06-13T08:00:00Z",
          status: "confirmed" as const, patientName: "T", source: "test",
          specialistId: null, specialistName: null, branchId: null, branchTitle: null,
          roomId: null, roomTitle: null, serviceId: null, serviceTitle: null,
          platformUserId: null, patientPhone: null, bookingStatus: null,
          rubitimeId: null, rubitimeManageUrl: null, paymentStatus: null,
          prepaymentPending: false, packageUsageRef: null, packageTitle: null,
          rescheduleCount: 0, originalStartAt: null, formComments: [],
        },
      ];
      // dataLo=420, dataHi=480, span=60 ≤ 600 → SHIFT вниз (420<540)
      // lo=420, hi=420+600=1020
      const result = deriveSlotTimes(null, events, "UTC");
      expect(result.slotMinTime).toBe("07:00:00");
      expect(result.slotMaxTime).toBe("17:00:00");
      expect(result.loMinute).toBe(420);
      expect(result.hiMinute).toBe(1020);
    });

    // 08:30 рабочие → SHIFT вниз (без округления до часа в новой логике)
    it("08:30 working start → SHIFT down (lo=510, hi=1110)", async () => {
      const { deriveSlotTimes } = await import("./ScheduleCalendarTab");
      // dataLo=510, dataHi=1080, span=570 ≤ 600, 510<540 → SHIFT вниз
      const result = deriveSlotTimes({ minMinute: 510, maxMinute: 1080 }, [], "UTC");
      expect(result.slotMinTime).toBe("08:30:00");
      expect(result.slotMaxTime).toBe("18:30:00");
      expect(result.loMinute).toBe(510);
      expect(result.hiMinute).toBe(1110);
    });
  });

  // ─── KPI modal tile==modal invariant ─────────────────────────────────────
  //
  // Доказывает что число элементов в модалке для «Первичных» и «Повторных»
  // совпадает с числом на плитке KPI.
  //
  // Сценарий: фид содержит 3 записи (appt-1, appt-2, appt-3).
  // API возвращает firstVisitIds = ["appt-1", "appt-3"] (2 первичных).
  // Ожидание:
  //   - плитка «Первичных» = 2, модалка = {appt-1, appt-3}
  //   - плитка «Повторных» = 1, модалка = {appt-2}

  describe("KPI modal tile==modal invariant (firstVisit/repeatVisit)", () => {
    const makeThreeAppointmentsCalResponse = () =>
      makeCalendarResponse([
        {
          kind: "appointment",
          id: "appt-1",
          startAt: "2026-06-13T10:00:00+03:00",
          endAt: "2026-06-13T11:00:00+03:00",
          status: "confirmed",
          patientName: "Иванов Иван",
          platformUserId: "user-1",
          rescheduleCount: 0,
          packageUsageRef: null,
          packageTitle: null,
          branchTitle: null,
        },
        {
          kind: "appointment",
          id: "appt-2",
          startAt: "2026-06-13T12:00:00+03:00",
          endAt: "2026-06-13T13:00:00+03:00",
          status: "confirmed",
          patientName: "Петрова Анна",
          platformUserId: "user-2",
          rescheduleCount: 0,
          packageUsageRef: null,
          packageTitle: null,
          branchTitle: null,
        },
        {
          kind: "appointment",
          id: "appt-3",
          startAt: "2026-06-14T09:00:00+03:00",
          endAt: "2026-06-14T10:00:00+03:00",
          status: "confirmed",
          patientName: "Сидоров Пётр",
          platformUserId: "user-3",
          rescheduleCount: 0,
          packageUsageRef: null,
          packageTitle: null,
          branchTitle: null,
        },
      ]);

    it("firstVisitInPeriod tile click: modal shows exactly the firstVisitIds from API", async () => {
      // API says appt-1 and appt-3 are first visits
      const firstVisitIds = ["appt-1", "appt-3"];
      setupFetchMock(makeThreeAppointmentsCalResponse(), makeKpisResponse(firstVisitIds));
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("kpi-firstVisitInPeriod"));
      await user.click(screen.getByTestId("kpi-firstVisitInPeriod"));

      await waitFor(() => {
        const modal = screen.getByTestId("kpi-modal");
        expect(modal).toBeInTheDocument();
        // count attr matches tile value
        expect(modal.getAttribute("data-count")).toBe("2");
        // exactly the two first-visit appointments are shown
        expect(screen.getByTestId("modal-item-appt-1")).toBeInTheDocument();
        expect(screen.getByTestId("modal-item-appt-3")).toBeInTheDocument();
        // repeat-only appointment is NOT in the modal
        expect(screen.queryByTestId("modal-item-appt-2")).not.toBeInTheDocument();
      });
    });

    it("repeatVisitInPeriod tile click: modal shows appointments NOT in firstVisitIds", async () => {
      const firstVisitIds = ["appt-1", "appt-3"];
      setupFetchMock(makeThreeAppointmentsCalResponse(), makeKpisResponse(firstVisitIds));
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("kpi-repeatVisitInPeriod"));
      await user.click(screen.getByTestId("kpi-repeatVisitInPeriod"));

      await waitFor(() => {
        const modal = screen.getByTestId("kpi-modal");
        expect(modal).toBeInTheDocument();
        // count attr matches tile value (records - firstVisit = 3 - 2 = 1)
        expect(modal.getAttribute("data-count")).toBe("1");
        // only appt-2 (repeat patient) is in the modal
        expect(screen.getByTestId("modal-item-appt-2")).toBeInTheDocument();
        // first-visit appointments are NOT shown
        expect(screen.queryByTestId("modal-item-appt-1")).not.toBeInTheDocument();
        expect(screen.queryByTestId("modal-item-appt-3")).not.toBeInTheDocument();
      });
    });

    it("firstVisitInPeriod modal count matches tile KPI value", async () => {
      // Tile shows firstVisitInPeriod=2; modal must also show 2 items
      const firstVisitIds = ["appt-1", "appt-3"];
      setupFetchMock(makeThreeAppointmentsCalResponse(), makeKpisResponse(firstVisitIds));
      const Tab = await setup();
      const user = userEvent.setup();
      render(<Tab deepLinkParams={{ date: "2026-06-13" }} onDeepLinkChange={vi.fn()} />);

      await waitFor(() => screen.getByTestId("kpi-firstVisitInPeriod"));
      // Read tile value
      const tileEl = screen.getByTestId("kpi-firstVisitInPeriod");
      const tileValue = parseInt(tileEl.textContent?.replace(/\D/g, "") ?? "0", 10);

      await user.click(tileEl);

      await waitFor(() => {
        const modal = screen.getByTestId("kpi-modal");
        const modalCount = parseInt(modal.getAttribute("data-count") ?? "0", 10);
        expect(modalCount).toBe(tileValue);
      });
    });
  });

  // ─── visibleRange helper ──────────────────────────────────────────────────

  describe("visibleRange helper", () => {
    it("3days: from=today, to=today+3days", async () => {
      const { visibleRange } = await import("./ScheduleCalendarTab");
      const result = visibleRange("3days", "2026-06-13", "Europe/Moscow");
      expect(result.from).toContain("2026-06-13");
      // to should be 2026-06-16 (3 days later)
      expect(result.to).toContain("2026-06-16");
    });

    it("weekgrid: from=Monday, to=next-Monday", async () => {
      const { visibleRange } = await import("./ScheduleCalendarTab");
      // 2026-06-13 is a Saturday — week starts Mon 2026-06-08
      const result = visibleRange("weekgrid", "2026-06-13", "Europe/Moscow");
      expect(result.from).toContain("2026-06-08");
      expect(result.to).toContain("2026-06-15");
    });

    it("month: from=2026-06-01, to=2026-07-01", async () => {
      const { visibleRange } = await import("./ScheduleCalendarTab");
      const result = visibleRange("month", "2026-06-13", "Europe/Moscow");
      expect(result.from).toContain("2026-06-01");
      expect(result.to).toContain("2026-07-01");
    });

    it("day: from=anchor, to=anchor+1", async () => {
      const { visibleRange } = await import("./ScheduleCalendarTab");
      const result = visibleRange("day", "2026-06-13", "Europe/Moscow");
      expect(result.from).toContain("2026-06-13");
      expect(result.to).toContain("2026-06-14");
    });
  });
});
