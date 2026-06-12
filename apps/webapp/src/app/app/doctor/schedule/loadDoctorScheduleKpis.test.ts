import { describe, expect, it, vi, beforeAll } from "vitest";

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: async () => "Europe/Moscow",
}));

let resolveSchedulePeriodPreset: typeof import("./loadDoctorScheduleKpis").resolveSchedulePeriodPreset;
let loadDoctorScheduleKpis: typeof import("./loadDoctorScheduleKpis").loadDoctorScheduleKpis;

beforeAll(async () => {
  const mod = await import("./loadDoctorScheduleKpis");
  resolveSchedulePeriodPreset = mod.resolveSchedulePeriodPreset;
  loadDoctorScheduleKpis = mod.loadDoctorScheduleKpis;
});

describe("resolveSchedulePeriodPreset", () => {
  it("возвращает 'day' для строки 'day'", () => {
    expect(resolveSchedulePeriodPreset("day")).toBe("day");
  });

  it("возвращает 'week' для строки 'week'", () => {
    expect(resolveSchedulePeriodPreset("week")).toBe("week");
  });

  it("возвращает 'month' для строки 'month'", () => {
    expect(resolveSchedulePeriodPreset("month")).toBe("month");
  });

  it("fallback на 'month' для null", () => {
    expect(resolveSchedulePeriodPreset(null)).toBe("month");
  });

  it("fallback на 'month' для undefined", () => {
    expect(resolveSchedulePeriodPreset(undefined)).toBe("month");
  });

  it("fallback на 'month' для неизвестного значения", () => {
    expect(resolveSchedulePeriodPreset("calendar")).toBe("month");
    expect(resolveSchedulePeriodPreset("30d")).toBe("month");
    expect(resolveSchedulePeriodPreset("")).toBe("month");
  });
});

describe("loadDoctorScheduleKpis", () => {
  const mockKpis = {
    recordsInPeriod: 40,
    uniquePatientsInPeriod: 28,
    newPatientsInPeriod: 4,
    cancellationsInPeriod: 9,
    reschedulesInPeriod: 5,
  };

  const makeDeps = () => ({
    doctorAppointments: {
      getScheduleKpis: vi.fn().mockResolvedValue(mockKpis),
    },
  });

  it("вызывает getScheduleKpis с kind=preset и переданным пресетом", async () => {
    const deps = makeDeps();
    const result = await loadDoctorScheduleKpis(deps, "month");
    expect(deps.doctorAppointments.getScheduleKpis).toHaveBeenCalledWith(
      { kind: "preset", preset: "month" },
      undefined,
    );
    expect(result).toEqual(mockKpis);
  });

  it("передаёт audience в getScheduleKpis", async () => {
    const deps = makeDeps();
    const audience = { excludedUserIds: ["user-1", "user-2"] };
    await loadDoctorScheduleKpis(deps, "week", audience);
    expect(deps.doctorAppointments.getScheduleKpis).toHaveBeenCalledWith(
      { kind: "preset", preset: "week" },
      audience,
    );
  });

  it("работает для пресета 'day'", async () => {
    const deps = makeDeps();
    await loadDoctorScheduleKpis(deps, "day");
    expect(deps.doctorAppointments.getScheduleKpis).toHaveBeenCalledWith(
      { kind: "preset", preset: "day" },
      undefined,
    );
  });
});
