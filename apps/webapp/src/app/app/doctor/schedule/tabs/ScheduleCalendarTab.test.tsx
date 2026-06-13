/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks — прогрев чанков (webapp-tests-lean)
// ---------------------------------------------------------------------------

// FullCalendar — тяжёлый, мокаем stub
vi.mock("@fullcalendar/react", () => ({
  default: ({ navLinkDayClick }: { navLinkDayClick?: (date: Date) => void }) => (
    <div data-testid="fullcalendar">
      <button
        data-testid="fc-day-header-click"
        onClick={() => navLinkDayClick?.(new Date("2026-06-15T00:00:00Z"))}
      >
        день-header
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
    startInCreate,
  }: {
    selected: unknown;
    onClose: () => void;
    startInCreate?: boolean;
  }) => (
    <div data-testid="event-panel" data-start-in-create={startInCreate ? "true" : "false"}>
      {selected ? (
        <button data-testid="panel-close" onClick={onClose}>
          close
        </button>
      ) : (
        <span data-testid="panel-empty">empty</span>
      )}
    </div>
  ),
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

const makeKpisResponse = () => ({
  ok: true,
  kpis: {
    recordsInPeriod: 5,
    pastInPeriod: 2,
    futureInPeriod: 3,
    bySubscriptionInPeriod: 1,
    firstVisitInPeriod: 4,
    repeatVisitInPeriod: 1,
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
