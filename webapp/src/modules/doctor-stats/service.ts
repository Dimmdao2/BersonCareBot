/** Операционная статистика для кабинета специалиста. */
export type DoctorStatsState = {
  appointments: {
    total: number;
    cancellations: number;
    cancellations30d: number;
    reschedules: number;
  };
  clients: {
    total: number;
    withNoChannels: number;
    withOneChannel: number;
    withMultipleChannels: number;
  };
};

export type DoctorStatsServiceDeps = {
  getAppointmentStats: (filter: { range: "today" | "tomorrow" | "week" }) => Promise<{
    total: number;
    cancellations: number;
    cancellations30d: number;
    reschedules: number;
  }>;
  listClients: (filters: { hasTelegram?: boolean; hasMax?: boolean }) => Promise<
    Array<{ userId: string; bindings: { telegramId?: string; maxId?: string } }>
  >;
};

export function createDoctorStatsService(deps: DoctorStatsServiceDeps) {
  return {
    async getStats(): Promise<DoctorStatsState> {
      const [appointmentStats, allClients] = await Promise.all([
        deps.getAppointmentStats({ range: "week" }),
        deps.listClients({}),
      ]);

      const withTelegram = (await deps.listClients({ hasTelegram: true })).length;
      const withMax = (await deps.listClients({ hasMax: true })).length;
      let withNoChannels = 0;
      let withOneChannel = 0;
      let withMultipleChannels = 0;
      for (const c of allClients) {
        const count = [c.bindings.telegramId, c.bindings.maxId].filter(Boolean).length;
        if (count === 0) withNoChannels++;
        else if (count === 1) withOneChannel++;
        else withMultipleChannels++;
      }

      return {
        appointments: {
          total: appointmentStats.total,
          cancellations: appointmentStats.cancellations,
          cancellations30d: appointmentStats.cancellations30d,
          reschedules: appointmentStats.reschedules,
        },
        clients: {
          total: allClients.length,
          withNoChannels,
          withOneChannel,
          withMultipleChannels,
        },
      };
    },
  };
}
