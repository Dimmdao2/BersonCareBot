import { describe, expect, it } from "vitest";
import { createDoctorStatsService } from "./service";

describe("doctor-stats service", () => {
  const service = createDoctorStatsService({
    getAppointmentStats: async (filter) => ({
      total: filter.range === "week" ? 5 : 0,
      cancellations: 1,
      cancellations30d: 2,
      reschedules: 0,
    }),
    listClients: async (filters) => {
      const all = [
        { userId: "u1", bindings: { telegramId: "tg1", maxId: "m1" } },
        { userId: "u2", bindings: { telegramId: "tg2" } },
        { userId: "u3", bindings: {} },
      ];
      if (filters.hasTelegram) return all.filter((c) => c.bindings.telegramId);
      if (filters.hasMax) return all.filter((c) => c.bindings.maxId);
      return all;
    },
  });

  it("getStats returns appointments and clients aggregates", async () => {
    const stats = await service.getStats();
    expect(stats.appointments.total).toBe(5);
    expect(stats.appointments.cancellations30d).toBe(2);
    expect(stats.clients.total).toBe(3);
    expect(stats.clients.withNoChannels).toBe(1);
    expect(stats.clients.withOneChannel).toBe(1);
    expect(stats.clients.withMultipleChannels).toBe(1);
  });
});
