/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks (webapp-tests-lean: тяжёлые импорты в beforeAll)
// ---------------------------------------------------------------------------

// bookingSoloAdminApi — мокаем полностью, не грузим Luxon/fetch runtime
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockOverview = {
  organizationId: string;
  organization: { id: string; title: string } | null;
  branches: { id: string; title: string; isActive: boolean; cityCode: string; address: null; timezone: string; sortOrder: number }[];
  specialists: { id: string; fullName: string; isActive: boolean }[];
  services: never[];
  specialistAvailability: never[];
  locationAvailability: never[];
};

const BRANCHES = [
  { id: "branch-spb", title: "СПб", isActive: true, cityCode: "spb", address: null, timezone: "Europe/Moscow", sortOrder: 0 },
  { id: "branch-msk", title: "МСК", isActive: true, cityCode: "msk", address: null, timezone: "Europe/Moscow", sortOrder: 1 },
];

const OVERVIEW: MockOverview = {
  organizationId: "org-1",
  organization: { id: "org-1", title: "Клиника" },
  branches: BRANCHES,
  specialists: [{ id: "spec-1", fullName: "Иванов", isActive: true }],
  services: [],
  specialistAvailability: [],
  locationAvailability: [],
};

const WORKING_DAY_ROWS = [
  {
    id: "wd-1",
    workDate: "2026-06-02",
    startMinute: 660,   // 11:00
    endMinute: 1140,    // 19:00
    breakStartMinute: null,
    breakEndMinute: null,
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
    breakStartMinute: null,
    breakEndMinute: null,
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
  const { fetchSoloOverview, apiJson } = await import("@/app/app/settings/bookingSoloAdminApi");
  (fetchSoloOverview as ReturnType<typeof vi.fn>).mockResolvedValue(OVERVIEW);
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
  it("renders the month grid and branch switcher", async () => {
    await renderWorkTab({ month: "2026-06" });
    // Tab shell renders
    expect(screen.getByTestId("schedule-work-tab")).toBeInTheDocument();
    // Month label appears
    await waitFor(() => {
      expect(screen.getByTestId("month-label")).toHaveTextContent("Июнь 2026");
    });
    // Branch buttons appear after bootstrap
    await waitFor(() => {
      expect(screen.getByTestId("branch-btn-branch-spb")).toBeInTheDocument();
      expect(screen.getByTestId("branch-btn-branch-msk")).toBeInTheDocument();
    });
  });

  it("month nav buttons call onDeepLinkChange with correct month", async () => {
    const { onDeepLinkChange } = await renderWorkTab({ month: "2026-06" });
    const prevBtn = screen.getByTestId("month-prev");
    fireEvent.click(prevBtn);
    expect(onDeepLinkChange).toHaveBeenCalledWith("month", "2026-05");
  });

  it("shows hours panel when a day is selected and hides when cleared", async () => {
    await renderWorkTab({ month: "2026-06" });

    // Ensure grid is rendered
    await waitFor(() => {
      expect(screen.getByTestId("month-grid")).toBeInTheDocument();
    });

    // Clicking a day (June 10)
    const cellJun10 = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cellJun10);

    // Panel appears
    await waitFor(() => {
      expect(screen.getByTestId("hours-panel")).toBeInTheDocument();
    });

    // Clear selection
    const clearBtn = screen.getByTestId("btn-clear-selection");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("hours-panel")).not.toBeInTheDocument();
    });
  });

  it("PUT upsert with correct body when Сохранить is clicked", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    // Select June 10
    const cell = await screen.findByTestId("day-cell-2026-06-10");
    fireEvent.click(cell);

    await waitFor(() => {
      expect(screen.getByTestId("hours-panel")).toBeInTheDocument();
    });

    // Change start/end
    const startInput = screen.getByTestId("panel-start") as HTMLInputElement;
    const endInput = screen.getByTestId("panel-end") as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: "11:00" } });
    fireEvent.change(endInput, { target: { value: "19:00" } });

    // Reset mock to capture PUT call specifically
    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/admin/booking-engine/working-days") return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    // Click Save
    const saveBtn = screen.getByTestId("btn-save");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const putCall = calls.find(
        (call) => call[0] === "/api/admin/booking-engine/working-days" &&
          (call[1] as RequestInit)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.action).toBe("upsert");
      expect(body.dates).toContain("2026-06-10");
      expect(body.startMinute).toBe(660);   // 11*60
      expect(body.endMinute).toBe(1140);    // 19*60
    });
  });

  it("PUT close with action:'close' when Закрыть is clicked", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    // Select June 15
    const cell = await screen.findByTestId("day-cell-2026-06-15");
    fireEvent.click(cell);

    await waitFor(() => {
      expect(screen.getByTestId("hours-panel")).toBeInTheDocument();
    });

    (apiJson as ReturnType<typeof vi.fn>).mockClear();
    (apiJson as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/admin/booking-engine/working-days") return { ok: true };
      if (url.includes("working-days")) return { ok: true, rows: [] };
      if (url.includes("working-schedule-templates")) return { ok: true, rows: [] };
      return { ok: true };
    });

    const closeBtn = screen.getByTestId("btn-close-days");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      const calls = (apiJson as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const putCall = calls.find(
        (call) => call[0] === "/api/admin/booking-engine/working-days" &&
          (call[1] as RequestInit)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.action).toBe("close");
      expect(body.dates).toContain("2026-06-15");
    });
  });

  it("Применить шаблон → POST apply with selected dates", async () => {
    const { apiJson } = await renderWorkTab({ month: "2026-06" });
    await waitFor(() => expect(screen.getByTestId("month-grid")).toBeInTheDocument());

    // Select June 20
    const cell = await screen.findByTestId("day-cell-2026-06-20");
    fireEvent.click(cell);

    // Wait for template to render
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

    const applyBtn = screen.getByTestId("btn-apply-template-tpl-1");
    fireEvent.click(applyBtn);

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

  it("templates list renders and shows шаблоны panel", async () => {
    await renderWorkTab({ month: "2026-06" });
    await waitFor(() => {
      expect(screen.getByTestId("templates-panel")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("template-tpl-1")).toBeInTheDocument();
    });
    expect(screen.getByText("СПб день · 11–19")).toBeInTheDocument();
  });

  it("month prev/next navigates correctly", async () => {
    await renderWorkTab({ month: "2026-12" });
    await waitFor(() => expect(screen.getByTestId("month-label")).toHaveTextContent("Декабрь 2026"));

    fireEvent.click(screen.getByTestId("month-next"));
    await waitFor(() => expect(screen.getByTestId("month-label")).toHaveTextContent("Январь 2027"));
  });
});
