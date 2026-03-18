import { getPool } from "@/infra/db/client";
import type { ChannelBindings } from "@/shared/types/session";
import type {
  ClientIdentity,
  ClientListItem,
  DoctorClientsFilters,
  DoctorClientsPort,
} from "@/modules/doctor-clients/ports";

function rowToBindings(rows: { channel_code: string; external_id: string }[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    const key =
      row.channel_code === "telegram" ? "telegramId" : row.channel_code === "max" ? "maxId" : "vkId";
    (bindings as Record<string, string>)[key] = row.external_id;
  }
  return bindings;
}

export function createPgDoctorClientsPort(): DoctorClientsPort {
  return {
    async listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]> {
      const pool = getPool();
      const clientRows = await pool.query(
        `SELECT id, display_name, phone_normalized, created_at
         FROM platform_users
         WHERE role = 'client'
         ORDER BY display_name, id`
      );
      if (clientRows.rows.length === 0) return [];

      const userIds = clientRows.rows.map((r: { id: string }) => r.id);
      const bindingsRows = await pool.query(
        `SELECT user_id, channel_code, external_id FROM user_channel_bindings WHERE user_id = ANY($1::uuid[])`,
        [userIds]
      );
      const bindingsByUser = new Map<string | number, { channel_code: string; external_id: string }[]>();
      for (const row of bindingsRows.rows as { user_id: string; channel_code: string; external_id: string }[]) {
        const list = bindingsByUser.get(row.user_id) ?? [];
        list.push({ channel_code: row.channel_code, external_id: row.external_id });
        bindingsByUser.set(row.user_id, list);
      }

      let list: ClientListItem[] = clientRows.rows.map(
        (r: { id: string; display_name: string; phone_normalized: string | null; created_at: string }) => {
          const bindings = rowToBindings(bindingsByUser.get(r.id) ?? []);
          return {
            userId: r.id,
            displayName: r.display_name ?? "",
            phone: r.phone_normalized,
            bindings,
            nextAppointmentLabel: null,
            cancellationCount30d: 0,
          };
        }
      );

      if (filters.search?.trim()) {
        const s = filters.search.toLowerCase().trim();
        list = list.filter(
          (item) =>
            item.displayName.toLowerCase().includes(s) ||
            (item.phone ?? "").includes(s) ||
            (item.bindings.telegramId ?? "").toLowerCase().includes(s) ||
            (item.bindings.maxId ?? "").toLowerCase().includes(s)
        );
      }
      if (filters.hasTelegram === true) {
        list = list.filter((item) => Boolean(item.bindings.telegramId?.trim()));
      }
      if (filters.hasMax === true) {
        list = list.filter((item) => Boolean(item.bindings.maxId?.trim()));
      }
      if (filters.hasUpcomingAppointment === true) {
        list = list.filter((item) => Boolean(item.nextAppointmentLabel));
      }
      return list;
    },

    async getClientIdentity(userId: string): Promise<ClientIdentity | null> {
      const pool = getPool();
      const userRow = await pool.query(
        "SELECT id, display_name, phone_normalized, created_at FROM platform_users WHERE id = $1",
        [userId]
      );
      if (userRow.rows.length === 0) return null;
      const r = userRow.rows[0] as {
        id: string;
        display_name: string;
        phone_normalized: string | null;
        created_at: string;
      };
      const bindingsRows = await pool.query(
        "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
        [userId]
      );
      const bindings = rowToBindings(
        bindingsRows.rows as { channel_code: string; external_id: string }[]
      );
      return {
        userId: r.id,
        displayName: r.display_name ?? "",
        phone: r.phone_normalized,
        bindings,
        createdAt: r.created_at,
      };
    },
  };
}
