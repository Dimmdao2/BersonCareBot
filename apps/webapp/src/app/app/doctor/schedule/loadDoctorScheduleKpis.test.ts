import { describe, expect, it, vi, beforeAll } from "vitest";

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: async () => "Europe/Moscow",
}));

let resolveSchedulePeriodPreset: typeof import("./loadDoctorScheduleKpis").resolveSchedulePeriodPreset;
let loadDoctorScheduleKpis: typeof import("./loadDoctorScheduleKpis").loadDoctorScheduleKpis;
let buildKpisQueryFromPreset: typeof import("./loadDoctorScheduleKpis").buildKpisQueryFromPreset;

beforeAll(async () => {
  const mod = await import("./loadDoctorScheduleKpis");
  resolveSchedulePeriodPreset = mod.resolveSchedulePeriodPreset;
  loadDoctorScheduleKpis = mod.loadDoctorScheduleKpis;
  buildKpisQueryFromPreset = mod.buildKpisQueryFromPreset;
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

describe("buildKpisQueryFromPreset", () => {
  const tz = "Europe/Moscow";

  it("day — from и to в формате ISO-datetime", () => {
    const q = buildKpisQueryFromPreset("day", tz);
    expect(q.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(q.to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("week — to на 7 дней позже from", () => {
    const q = buildKpisQueryFromPreset("week", tz);
    const fromDate = new Date(q.from + "Z");
    const toDate = new Date(q.to + "Z");
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it("month — to на 3 дня позже from (дефолт 3 дня)", () => {
    const q = buildKpisQueryFromPreset("month", tz);
    const fromDate = new Date(q.from + "Z");
    const toDate = new Date(q.to + "Z");
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(3);
  });

  it("не содержит branchId/serviceId по умолчанию", () => {
    const q = buildKpisQueryFromPreset("day", tz);
    expect(q.branchId).toBeUndefined();
    expect(q.serviceId).toBeUndefined();
  });
});

describe("loadDoctorScheduleKpis", () => {
  const mockKpis = {
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

  const makeDeps = () => ({
    doctorAppointments: {
      getScheduleKpis: vi.fn().mockResolvedValue(mockKpis),
    },
  });

  it("вызывает getScheduleKpis с объектом query {from,to}", async () => {
    const deps = makeDeps();
    const result = await loadDoctorScheduleKpis(deps, "month");
    expect(deps.doctorAppointments.getScheduleKpis).toHaveBeenCalledOnce();
    const [query, audience] = deps.doctorAppointments.getScheduleKpis.mock.calls[0] ?? [];
    expect(query).toHaveProperty("from");
    expect(query).toHaveProperty("to");
    expect(audience).toBeUndefined();
    expect(result).toEqual(mockKpis);
  });

  it("передаёт audience в getScheduleKpis", async () => {
    const deps = makeDeps();
    const audience = { excludedUserIds: ["user-1", "user-2"] };
    await loadDoctorScheduleKpis(deps, "week", audience);
    const [, receivedAudience] = deps.doctorAppointments.getScheduleKpis.mock.calls[0] ?? [];
    expect(receivedAudience).toEqual(audience);
  });

  it("работает для пресета 'day'", async () => {
    const deps = makeDeps();
    await loadDoctorScheduleKpis(deps, "day");
    expect(deps.doctorAppointments.getScheduleKpis).toHaveBeenCalledOnce();
  });
});
