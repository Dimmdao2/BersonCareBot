/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks (webapp-tests-lean: тяжёлые импорты в beforeAll)
// ---------------------------------------------------------------------------

vi.mock("@/app/app/settings/bookingSoloAdminApi", () => ({
  apiJson: vi.fn(),
  fetchSoloOverview: vi.fn(),
  ensureDefaultSpecialist: vi.fn(async () => "spec-1"),
  minuteToTimeLabel: (m: number) => {
    const h = Math.floor(m / 60);
    const mn = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
  },
  timeLabelToMinute: (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  },
}));

// Bootstrap: the component uses fetchDoctorScheduleBootstrap (not fetchSoloOverview)
vi.mock("../doctorScheduleApi", () => ({
  fetchDoctorScheduleBootstrap: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockBranch = {
  id: string;
  title: string;
  shortTitle: string | null;
  isActive: boolean;
  cityCode: string;
  address: null;
  timezone: string;
  sortOrder: number;
};

const BRANCHES: MockBranch[] = [
  { id: "branch-spb", title: "Санкт-Петербург", shortTitle: "СПб", isActive: true, cityCode: "spb", address: null, timezone: "Europe/Moscow", sortOrder: 0 },
  { id: "branch-msk", title: "Москва", shortTitle: "Мск", isActive: true, cityCode: "msk", address: null, timezone: "Europe/Moscow", sortOrder: 1 },
];

const WORKING_DAY_ROWS = [
  {
    id: "wd-1",
    workDate: "2026-06-02",
    startMinute: 660,   // 11:00
    endMinute: 1140,    // 19:00
    breaks: [],
    isClosed: false,
    branchId: "branch-spb",
  },
];

const TEMPLATES = [
  {
    id: "tpl-1",
    name: "СПб день · 11–19",
    startMinute: 660,
    endMinute: 1140,
    breaks: [],
    branchId: "branch-spb",
    sortOrder: 0,
    isActive: true,
  },
];

// ---------------------------------------------------------------------------
// Прогрев чанков в beforeAll (webapp-tests-lean)
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await import("./ScheduleWorkTab");
}, 10_000);

// ---------------------------------------------------------------------------
// Shared setup helper
// ---------------------------------------------------------------------------

async function renderWorkTab(deepLinkParams: Record<string, string> = {}) {
  const { fetchDoctorScheduleBootstrap } = await import("../doctorScheduleApi");
  (fetchDoctorScheduleBootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
    organizationTitle: "Клиника",
    branches: BRANCHES.filter((b) => b.isActive),
    specialistId: "spec-1",
  });

  const { apiJson } = await import("@/app/app/settings/bookingSoloAdminApi");
  (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (url.includes("working-days")) return { ok: true, rows: WORKING_DAY_ROWS };
    if (url.includes("working-schedule-templates")) return { ok: true, rows: TEMPLATES };
    return { ok: true };
  });

  const { ScheduleWorkTab } = await import("./ScheduleWorkTab");
  const onDeepLinkChange = vi.fn();
  render(<ScheduleWorkTab deepLinkParams={deepLinkParams} onDeepLinkChange={onDeepLinkChange} />);
  return { onDeepLinkChange, apiJson: apiJson as ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScheduleWorkTab", () => {
  // ── E1: Раскладка двух колонок ──────────────────────────────────────────

  it("E1: renders month-grid, templates-panel, month-label (three zones)", async () => {
    await renderWorkTab({ month: "2026-06" });

    expect(screen.getByTestId("schedule-work-tab")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("month-label")).toHaveTextContent("Июнь 2026");
    });
    await waitFor(() => {
      expect(screen.getByTestId("month-grid")).toBeInTheDocument();
      expect(screen.getByTestId("templates-panel")).toBeInTheDocument();
    });
  });

  it("E1: hours panel absent before day selection, present after", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    // Panel absent before selection
    expect(screen.queryByTestId("hours-panel")).not.toBeInTheDocument();

    // Select a day
    const cell = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cell);

    await waitFor(() => {
      expect(screen.getByTestId("hours-panel")).toBeInTheDocument();
    });
  });

  // ── E2: Карточки дней ───────────────────────────────────────────────────

  it("E2: renders branch filter buttons with short titles", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => {
      expect(screen.getByTestId("branch-btn-branch-spb")).toBeInTheDocument();
      expect(screen.getByTestId("branch-btn-branch-msk")).toBeInTheDocument();
    });
    // Should show short title (СПб, Мск)
    expect(screen.getByTestId("branch-btn-branch-spb")).toHaveTextContent("СПб");
    expect(screen.getByTestId("branch-btn-branch-msk")).toHaveTextContent("Мск");
  });

  it("E2: day cell with schedule shows time", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => {
      // 2026-06-02 has schedule 11–19 in branch-spb
      const cell = screen.getByTestId("day-cell-2026-06-02");
      expect(cell).toBeInTheDocument();
      expect(cell.textContent).toContain("11–19");
    });
  });

  it("§3.15: «выходной»/isClosed label is gone — closed-shaped rows render without it", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());
    // No cell in the grid should surface the removed «выходной» state.
    expect(screen.queryByText("выходной")).not.toBeInTheDocument();
  });

  // ── E3: Реальный фильтр сетки ───────────────────────────────────────────

  it("E3: «Все» filter button is present and active by default", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => {
      expect(screen.getByTestId("branch-filter-all")).toBeInTheDocument();
    });
  });

  it("E3: clicking a branch filter includes branchId in GET request", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("branch-btn-branch-spb")).toBeInTheDocument());

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    fireEvent.click(screen.getByTestId("branch-btn-branch-spb"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const getCall = calls.find((c) => typeof c[0] === "string" && (c[0] as string).includes("working-days") && (c[0] as string).includes("branchId=branch-spb"));
      expect(getCall).toBeTruthy();
    });
  });

  it("E3: clicking «Все» filter does NOT include branchId in GET request", async () => {
    // First select a branch, then reset to "all"
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("branch-filter-all")).toBeInTheDocument());

    // select branch-spb
    fireEvent.click(screen.getByTestId("branch-btn-branch-spb"));

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    // reset to all
    fireEvent.click(screen.getByTestId("branch-filter-all"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const getCall = calls.find((c) => typeof c[0] === "string" && (c[0] as string).includes("working-days"));
      expect(getCall).toBeTruthy();
      const url = getCall![0] as string;
      expect(url).not.toContain("branchId=");
    });
  });

  // ── E4: Панель часов с N перерывами ─────────────────────────────────────

  it("E4: panel shows + перерыв button and can add breaks", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cell);

    await waitFor(() => expect(screen.getByTestId("hours-panel")).toBeInTheDocument());

    // No break rows yet
    expect(screen.queryByTestId("break-row-0")).not.toBeInTheDocument();

    // Add a break
    const addBtn = screen.getByTestId("btn-add-break");
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByTestId("break-row-0")).toBeInTheDocument();
    });
  });

  it("E4: can remove a break row", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cell);

    await waitFor(() => expect(screen.getByTestId("btn-add-break")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("btn-add-break"));
    await waitFor(() => expect(screen.getByTestId("break-row-0")).toBeInTheDocument());

    // Remove it
    fireEvent.click(screen.getByTestId("break-remove-0"));
    await waitFor(() => {
      expect(screen.queryByTestId("break-row-0")).not.toBeInTheDocument();
    });
  });

  it("E4: PUT upsert sends breaks array (2 breaks)", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cell);

    await waitFor(() => expect(screen.getByTestId("hours-panel")).toBeInTheDocument());

    // Set start/end
    fireEvent.change(screen.getByTestId("panel-start"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByTestId("panel-end"), { target: { value: "18:00" } });

    // Add break 1
    fireEvent.click(screen.getByTestId("btn-add-break"));
    await waitFor(() => screen.getByTestId("break-from-0"));
    fireEvent.change(screen.getByTestId("break-from-0"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByTestId("break-to-0"), { target: { value: "13:00" } });

    // Add break 2
    fireEvent.click(screen.getByTestId("btn-add-break"));
    await waitFor(() => screen.getByTestId("break-from-1"));
    fireEvent.change(screen.getByTestId("break-from-1"), { target: { value: "15:00" } });
    fireEvent.change(screen.getByTestId("break-to-1"), { target: { value: "15:30" } });

    // Reset mock
    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/doctor/booking-engine/working-days") return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    fireEvent.click(screen.getByTestId("btn-save"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const putCall = calls.find(
        (call) => call[0] === "/api/doctor/booking-engine/working-days" &&
          (call[1] as RequestInit)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.action).toBe("upsert");
      expect(body.dates).toContain("2026-06-10");
      expect(body.startMinute).toBe(540);  // 9*60
      expect(body.endMinute).toBe(1080);   // 18*60
      expect(Array.isArray(body.breaks)).toBe(true);
      expect(body.breaks).toHaveLength(2);
      expect(body.breaks[0].startMinute).toBe(720);   // 12:00
      expect(body.breaks[0].endMinute).toBe(780);     // 13:00
      expect(body.breaks[1].startMinute).toBe(900);   // 15:00
      expect(body.breaks[1].endMinute).toBe(930);     // 15:30
    });
  });

  it("E4: PUT upsert with no breaks sends empty breaks array", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-12");
    fireEvent.click(cell);
    await waitFor(() => expect(screen.getByTestId("hours-panel")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("panel-start"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByTestId("panel-end"), { target: { value: "19:00" } });

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/doctor/booking-engine/working-days") return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    fireEvent.click(screen.getByTestId("btn-save"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const putCall = calls.find(
        (call) => call[0] === "/api/doctor/booking-engine/working-days" &&
          (call[1] as RequestInit)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.action).toBe("upsert");
      expect(body.breaks).toEqual([]);
    });
  });

  it("§3.15: PUT clear (delete day) with action:'clear' when «Очистить расписание» is clicked", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-15");
    fireEvent.click(cell);
    await waitFor(() => expect(screen.getByTestId("hours-panel")).toBeInTheDocument());

    // «Закрыть выбранные дни» is gone; «Очистить расписание» replaces it.
    expect(screen.queryByTestId("btn-close-days")).not.toBeInTheDocument();

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/doctor/booking-engine/working-days") return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    fireEvent.click(screen.getByTestId("btn-clear-schedule"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const putCall = calls.find(
        (call) => call[0] === "/api/doctor/booking-engine/working-days" &&
          (call[1] as RequestInit)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.action).toBe("clear");
      expect(body.dates).toContain("2026-06-15");
    });
  });

  it("E4: clearing selection hides hours panel", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cell);
    await waitFor(() => expect(screen.getByTestId("hours-panel")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("btn-clear-selection"));
    await waitFor(() => {
      expect(screen.queryByTestId("hours-panel")).not.toBeInTheDocument();
    });
  });

  // ── E5: Шаблоны с N перерывами ──────────────────────────────────────────

  it("E5: templates list renders with short branch label", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => {
      expect(screen.getByTestId("templates-panel")).toBeInTheDocument();
      expect(screen.getByTestId("template-tpl-1")).toBeInTheDocument();
    });
    expect(screen.getByText("СПб день · 11–19")).toBeInTheDocument();
    // Should show short branch label "СПб" somewhere in the template row
    const tplEl = screen.getByTestId("template-tpl-1");
    expect(tplEl.textContent).toContain("СПб");
  });

  it("E5: Применить шаблон → POST apply with selected dates", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    const cell = await screen.findByTestId("day-cell-2026-06-20");
    fireEvent.click(cell);

    await waitFor(() => {
      expect(screen.getByTestId("btn-apply-template-tpl-1")).toBeInTheDocument();
    });

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("working-schedule-templates?action=apply")) return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    fireEvent.click(screen.getByTestId("btn-apply-template-tpl-1"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const applyCall = calls.find(
        (call) => (call[0] as string).includes("?action=apply") &&
          (call[1] as RequestInit)?.method === "POST",
      );
      expect(applyCall).toBeTruthy();
      const body = JSON.parse((applyCall![1] as RequestInit).body as string);
      expect(body.templateId).toBe("tpl-1");
      expect(body.dates).toContain("2026-06-20");
    });
  });

  it("E5: template form shows add-break button and sends breaks on create", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("btn-create-template")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("btn-create-template"));

    await waitFor(() => {
      expect(screen.getByTestId("tpl-name")).toBeInTheDocument();
      expect(screen.getByTestId("tpl-btn-add-break")).toBeInTheDocument();
    });

    // Fill in name
    fireEvent.change(screen.getByTestId("tpl-name"), { target: { value: "Тест шаблон" } });
    fireEvent.change(screen.getByTestId("tpl-start"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByTestId("tpl-end"), { target: { value: "18:00" } });

    // Add one break
    fireEvent.click(screen.getByTestId("tpl-btn-add-break"));
    await waitFor(() => screen.getByTestId("break-from-0"));
    fireEvent.change(screen.getByTestId("break-from-0"), { target: { value: "13:00" } });
    fireEvent.change(screen.getByTestId("break-to-0"), { target: { value: "14:00" } });

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/doctor/booking-engine/working-schedule-templates") return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    fireEvent.click(screen.getByTestId("btn-create-template-submit"));

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const postCall = calls.find(
        (call) => call[0] === "/api/doctor/booking-engine/working-schedule-templates" &&
          (call[1] as RequestInit)?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.name).toBe("Тест шаблон");
      expect(body.startMinute).toBe(600);   // 10*60
      expect(body.endMinute).toBe(1080);    // 18*60
      expect(Array.isArray(body.breaks)).toBe(true);
      expect(body.breaks).toHaveLength(1);
      expect(body.breaks[0].startMinute).toBe(780);  // 13:00
      expect(body.breaks[0].endMinute).toBe(840);    // 14:00
    });
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  it("month nav prev calls onDeepLinkChange with correct month", async () => {
    const { onDeepLinkChange } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-label")).toHaveTextContent("Июнь 2026"));

    fireEvent.click(screen.getByTestId("month-prev"));
    expect(onDeepLinkChange).toHaveBeenCalledWith("month", "2026-05");
  });

  it("month nav next crosses year boundary", async () => {
    await renderWorkTab({ month: "2026-12" });
    await waitFor(() => expect(screen.getByTestId("month-label")).toHaveTextContent("Декабрь 2026"));

    fireEvent.click(screen.getByTestId("month-next"));
    await waitFor(() => expect(screen.getByTestId("month-label")).toHaveTextContent("Январь 2027"));
  });

  // ── CAL-02: always per-date mode (mode switcher removed in SCH-R-05) ──────

  it("CAL-02: month grid is always visible — mode switcher removed", async () => {
    await renderWorkTab({ month: "2026-06" });

    await waitFor(() => {
      expect(screen.getByTestId("month-grid")).toBeInTheDocument();
    });
    // Mode-switcher was removed in feat(SCH-R-05) — assert it's absent
    expect(screen.queryByTestId("mode-switcher")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mode-btn-per-date")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mode-btn-weekly")).not.toBeInTheDocument();
  });
});
