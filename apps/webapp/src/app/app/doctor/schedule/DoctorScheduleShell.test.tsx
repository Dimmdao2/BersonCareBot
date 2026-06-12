/** @vitest-environment jsdom */
/**
 * RTL-тест DoctorScheduleShell: монтаж активного таба + кэш уже открытых (keepMounted).
 * URL-sync: ?tab + под-параметры ↔ history.replaceState; restore при back/forward (popstate).
 *
 * webapp-tests-lean: тяжёлые компоненты табов замоканы; прогрев модуля Shell в beforeAll.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ScheduleTabProps } from "./scheduleTabRegistry";

// ── Мокаем тяжёлые зависимости ─────────────────────────────────────────────

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    // Немедленно возвращает компонент-заглушку, имитирующую реальный таб
    const LazyMock = (props: ScheduleTabProps & { "data-tabid"?: string }) => {
      // Находим id из среды вызова (получаем из deepLinkParams или по имени loader)
      return <div data-testid="tab-mock-inner" data-deeplink={JSON.stringify(props.deepLinkParams)} />;
    };
    LazyMock.displayName = "LazyTabMock";
    return LazyMock;
  },
}));

vi.mock("@/shared/ui/doctor/DoctorAppShell", () => ({
  DoctorAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="doctor-app-shell">{children}</div>
  ),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: vi.fn() }));

// Мок модуля system-settings (не нужен в клиентских тестах)
vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: async () => "Europe/Moscow",
}));

// ── Прогрев модуля ──────────────────────────────────────────────────────────

let DoctorScheduleShell: typeof import("./DoctorScheduleShell").DoctorScheduleShell;
let defaultKpis: import("@/modules/doctor-appointments/ports").ScheduleKpis;

beforeAll(async () => {
  const mod = await import("./DoctorScheduleShell");
  DoctorScheduleShell = mod.DoctorScheduleShell;
  defaultKpis = {
    recordsInPeriod: 40,
    pastInPeriod: 32,
    futureInPeriod: 8,
    bySubscriptionInPeriod: 3,
    firstVisitInPeriod: 4,
    repeatVisitInPeriod: 36,
    uniquePatientsInPeriod: 28,
    cancellationsInPeriod: 9,
    reschedulesInPeriod: 5,
  };
});

// ── helpers ─────────────────────────────────────────────────────────────────

function setup(props: Partial<React.ComponentProps<typeof DoctorScheduleShell>> = {}) {
  return render(
    <DoctorScheduleShell initialTab="cal" initialKpis={defaultKpis} {...props} />,
  );
}

// ── Тесты ───────────────────────────────────────────────────────────────────

describe("DoctorScheduleShell — базовый рендер", () => {
  it("рендерит DoctorAppShell", () => {
    setup();
    expect(screen.getByTestId("doctor-app-shell")).toBeDefined();
  });

  it("показывает KPI-строку с карточками", () => {
    setup();
    expect(screen.getByTestId("schedule-kpi-row")).toBeDefined();
    expect(screen.getByTestId("kpi-records")).toBeDefined();
    expect(screen.getByTestId("kpi-unique")).toBeDefined();
    expect(screen.getByTestId("kpi-first-visit")).toBeDefined();
    expect(screen.getByTestId("kpi-cancellations")).toBeDefined();
    expect(screen.getByTestId("kpi-reschedules")).toBeDefined();
    expect(screen.getByTestId("kpi-period")).toBeDefined();
  });

  it("показывает значения KPI из initialKpis", () => {
    setup();
    const kpiRow = screen.getByTestId("schedule-kpi-row");
    expect(kpiRow.textContent).toContain("40");   // recordsInPeriod
    expect(kpiRow.textContent).toContain("28");   // uniquePatientsInPeriod
    expect(kpiRow.textContent).toContain("4");    // firstVisitInPeriod
    expect(kpiRow.textContent).toContain("9");    // cancellationsInPeriod
    expect(kpiRow.textContent).toContain("5");    // reschedulesInPeriod
  });

  it("рендерит 3 кнопки табов (cal/work/setup)", () => {
    setup();
    expect(screen.getByTestId("tab-btn-cal")).toBeDefined();
    expect(screen.getByTestId("tab-btn-work")).toBeDefined();
    expect(screen.getByTestId("tab-btn-setup")).toBeDefined();
  });

  it("изначально показывает только активный таб (cal)", () => {
    setup({ initialTab: "cal" });
    const panelCal = screen.getByTestId("tab-panel-cal");
    expect(panelCal.hasAttribute("hidden")).toBe(false);
  });

  it("другие табы не монтированы изначально (keepMounted = lazy)", () => {
    setup({ initialTab: "cal" });
    expect(screen.queryByTestId("tab-panel-work")).toBeNull();
    expect(screen.queryByTestId("tab-panel-setup")).toBeNull();
  });
});

describe("DoctorScheduleShell — keepMounted при переключении", () => {
  it("монтирует и скрывает первый таб после перехода на второй", () => {
    setup({ initialTab: "cal" });
    const workBtn = screen.getByTestId("tab-btn-work");
    fireEvent.click(workBtn);

    // cal — скрыт (hidden атрибут), но всё ещё в DOM
    const panelCal = screen.getByTestId("tab-panel-cal");
    expect(panelCal.hasAttribute("hidden")).toBe(true);

    // work — видим
    const panelWork = screen.getByTestId("tab-panel-work");
    expect(panelWork.hasAttribute("hidden")).toBe(false);
  });

  it("ранее открытые табы остаются в DOM (keepMounted)", () => {
    setup({ initialTab: "cal" });
    fireEvent.click(screen.getByTestId("tab-btn-work"));
    fireEvent.click(screen.getByTestId("tab-btn-setup"));

    // все три должны быть в DOM
    expect(screen.getByTestId("tab-panel-cal")).toBeDefined();
    expect(screen.getByTestId("tab-panel-work")).toBeDefined();
    expect(screen.getByTestId("tab-panel-setup")).toBeDefined();

    // только setup видим
    expect(screen.getByTestId("tab-panel-cal").hasAttribute("hidden")).toBe(true);
    expect(screen.getByTestId("tab-panel-work").hasAttribute("hidden")).toBe(true);
    expect(screen.getByTestId("tab-panel-setup").hasAttribute("hidden")).toBe(false);
  });

  it("возврат на cal после work — cal снова активен", () => {
    setup({ initialTab: "cal" });
    fireEvent.click(screen.getByTestId("tab-btn-work"));
    fireEvent.click(screen.getByTestId("tab-btn-cal"));

    expect(screen.getByTestId("tab-panel-cal").hasAttribute("hidden")).toBe(false);
    expect(screen.getByTestId("tab-panel-work").hasAttribute("hidden")).toBe(true);
  });
});

describe("DoctorScheduleShell — URL-sync", () => {
  it("replaceState вызывается при переключении таба", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    setup({ initialTab: "cal" });
    spy.mockClear();

    fireEvent.click(screen.getByTestId("tab-btn-work"));

    expect(spy).toHaveBeenCalledOnce();
    const [, , url] = spy.mock.calls[0] ?? [];
    expect(String(url)).toContain("tab=work");
  });

  it("URL содержит ?tab=setup после перехода на setup", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    setup({ initialTab: "cal" });
    spy.mockClear();

    fireEvent.click(screen.getByTestId("tab-btn-setup"));

    const [, , url] = spy.mock.calls[0] ?? [];
    expect(String(url)).toContain("tab=setup");
  });
});

describe("DoctorScheduleShell — period selector", () => {
  it("показывает кнопки периода: Сегодня / 7 дн / 30 дн", () => {
    setup({ initialPeriod: "month" });
    const periodCard = screen.getByTestId("kpi-period");
    expect(periodCard.textContent).toContain("Сегодня");
    expect(periodCard.textContent).toContain("7 дн");
    expect(periodCard.textContent).toContain("30 дн");
  });

  it("initialPeriod=month → кнопка '30 дн' aria-pressed=true", () => {
    setup({ initialPeriod: "month" });
    const buttons = screen.getByTestId("kpi-period").querySelectorAll("button");
    const monthBtn = Array.from(buttons).find((b) => b.textContent?.includes("30 дн"));
    expect(monthBtn?.getAttribute("aria-pressed")).toBe("true");
  });
});
