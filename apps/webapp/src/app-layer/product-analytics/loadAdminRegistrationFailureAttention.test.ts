import { describe, expect, it, vi } from "vitest";

const { listRegistrationEventsMock, getAppDisplayTimeZoneMock, resolveAdminStatsLocalRangeMock } = vi.hoisted(
  () => ({
    listRegistrationEventsMock: vi.fn(),
    getAppDisplayTimeZoneMock: vi.fn(async () => "Europe/Moscow"),
    resolveAdminStatsLocalRangeMock: vi.fn(() => ({
      fromDay: "2026-05-21",
      toDay: "2026-05-28",
      startUtcIso: "2026-05-20T21:00:00.000Z",
      endExclusiveUtcIso: "2026-05-28T21:00:00.000Z",
      dayKeys: [],
    })),
  }),
);

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      listRegistrationEvents: listRegistrationEventsMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: getAppDisplayTimeZoneMock,
}));

vi.mock("@/modules/admin-platform-stats/registrationTimeRange", () => ({
  resolveAdminStatsLocalRange: resolveAdminStatsLocalRangeMock,
}));

import { loadAdminRegistrationFailureAttention } from "./loadAdminRegistrationFailureAttention";

describe("loadAdminRegistrationFailureAttention", () => {
  it("returns hidden banner when there are no system failures", async () => {
    listRegistrationEventsMock.mockResolvedValueOnce({ total: 0, items: [], page: 1, limit: 1 });
    await expect(loadAdminRegistrationFailureAttention()).resolves.toEqual({ show: false });
  });

  it("returns banner with count when system failures exist", async () => {
    listRegistrationEventsMock.mockResolvedValueOnce({ total: 3, items: [], page: 1, limit: 1 });
    await expect(loadAdminRegistrationFailureAttention()).resolves.toEqual({
      show: true,
      href: "/app/doctor/audit-log",
      title: "Сбои регистрации за неделю: 3 сбоя",
      count: 3,
    });
  });
});
