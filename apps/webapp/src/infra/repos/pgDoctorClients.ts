import { getPool } from "@/infra/db/client";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import type { ChannelBindings } from "@/shared/types/session";
import type {
  ClientIdentity,
  ClientListItem,
  DoctorClientsFilters,
  DoctorClientsPort,
  DoctorDashboardPatientMetrics,
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
      const archivedClause =
        filters.archivedOnly === true
          ? `COALESCE(is_archived, false) = true`
          : `COALESCE(is_archived, false) = false`;
      const clientRows = await pool.query(
        `SELECT id, display_name, phone_normalized, created_at
         FROM platform_users
         WHERE role = 'client' AND merged_into_id IS NULL AND ${archivedClause}
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

      const upcomingPhones = await pool.query<{ phone_normalized: string }>(
        `SELECT DISTINCT phone_normalized
         FROM appointment_records ar
         WHERE ar.phone_normalized IS NOT NULL
           AND ar.deleted_at IS NULL
           AND ar.status IN ('created', 'updated')
           AND ar.record_at IS NOT NULL
           AND ar.record_at >= NOW()`
      );
      const phoneHasUpcoming = new Set(
        upcomingPhones.rows.map((row) => row.phone_normalized).filter(Boolean) as string[],
      );

      let list: ClientListItem[] = clientRows.rows.map(
        (r: { id: string; display_name: string; phone_normalized: string | null; created_at: string }) => {
          const bindings = rowToBindings(bindingsByUser.get(r.id) ?? []);
          const phone = r.phone_normalized;
          const hasUpcoming = phone && phoneHasUpcoming.has(phone);
          return {
            userId: r.id,
            displayName: r.display_name ?? "",
            phone,
            bindings,
            nextAppointmentLabel: hasUpcoming ? "Есть запись" : null,
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
      if (filters.onlyWithAppointmentRecords === true && !filters.archivedOnly) {
        const phones = await pool.query<{ phone_normalized: string }>(
          `SELECT DISTINCT phone_normalized FROM appointment_records WHERE phone_normalized IS NOT NULL AND deleted_at IS NULL`
        );
        const phoneSet = new Set(
          phones.rows.map((row) => row.phone_normalized).filter(Boolean) as string[]
        );
        list = list.filter((item) => Boolean(item.phone) && phoneSet.has(item.phone!));
      }
      if (filters.visitedThisCalendarMonth === true && !filters.archivedOnly) {
        const visited = await pool.query<{ id: string }>(
          `SELECT DISTINCT pu.id
           FROM platform_users pu
           INNER JOIN appointment_records ar ON pu.phone_normalized IS NOT NULL AND ar.phone_normalized = pu.phone_normalized
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND ar.record_at IS NOT NULL
             AND ar.record_at >= date_trunc('month', NOW())
             AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'
             AND ar.record_at < NOW()
             AND ar.status IN ('created', 'updated')
             AND ar.deleted_at IS NULL`
        );
        const idSet = new Set(visited.rows.map((r) => r.id));
        list = list.filter((item) => idSet.has(item.userId));
      }
      return list;
    },

    async getDashboardPatientMetrics(): Promise<DoctorDashboardPatientMetrics> {
      const pool = getPool();
      const [totalR, supportR, visitedR] = await Promise.all([
        pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM platform_users WHERE role = 'client' AND merged_into_id IS NULL AND COALESCE(is_archived, false) = false`
        ),
        pool.query<{ c: string }>(
          `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN appointment_records ar ON pu.phone_normalized IS NOT NULL AND ar.phone_normalized = pu.phone_normalized
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND ar.record_at IS NOT NULL
             AND ar.record_at >= NOW()
             AND ar.status IN ('created', 'updated')
             AND ar.deleted_at IS NULL`
        ),
        pool.query<{ c: string }>(
          `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN appointment_records ar ON pu.phone_normalized IS NOT NULL AND ar.phone_normalized = pu.phone_normalized
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND ar.record_at IS NOT NULL
             AND ar.record_at >= date_trunc('month', NOW())
             AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'
             AND ar.record_at < NOW()
             AND ar.status IN ('created', 'updated')
             AND ar.deleted_at IS NULL`
        ),
      ]);
      return {
        totalClients: parseInt(totalR.rows[0]?.c ?? "0", 10),
        onSupportCount: parseInt(supportR.rows[0]?.c ?? "0", 10),
        visitedThisCalendarMonthCount: parseInt(visitedR.rows[0]?.c ?? "0", 10),
      };
    },

    async getClientIdentity(userId: string): Promise<ClientIdentity | null> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
      const userRow = await pool.query(
        `SELECT id, display_name, phone_normalized, created_at,
                COALESCE(is_blocked, false) AS is_blocked,
                blocked_reason,
                COALESCE(is_archived, false) AS is_archived
         FROM platform_users WHERE id = $1`,
        [canonicalId],
      );
      if (userRow.rows.length === 0) return null;
      const r = userRow.rows[0] as {
        id: string;
        display_name: string;
        phone_normalized: string | null;
        created_at: string;
        is_blocked: boolean;
        blocked_reason: string | null;
        is_archived: boolean;
      };
      const bindingsRows = await pool.query(
        "SELECT channel_code, external_id, created_at FROM user_channel_bindings WHERE user_id = $1",
        [canonicalId],
      );
      const bindings = rowToBindings(
        bindingsRows.rows as { channel_code: string; external_id: string }[],
      );
      const channelBindingDates: Record<string, string> = {};
      for (const br of bindingsRows.rows as {
        channel_code: string;
        created_at: Date;
      }[]) {
        channelBindingDates[br.channel_code] =
          br.created_at instanceof Date ? br.created_at.toISOString() : String(br.created_at);
      }
      return {
        userId: r.id,
        displayName: r.display_name ?? "",
        phone: r.phone_normalized,
        bindings,
        createdAt: r.created_at,
        isBlocked: r.is_blocked,
        blockedReason: r.blocked_reason,
        isArchived: r.is_archived,
        channelBindingDates,
      };
    },

    async isClientMessagingBlocked(userId: string): Promise<boolean> {
      const pool = getPool();
      const r = await pool.query<{ b: boolean }>(
        `SELECT COALESCE(is_blocked, false) AS b FROM platform_users WHERE id = $1`,
        [userId]
      );
      return Boolean(r.rows[0]?.b);
    },

    async setClientBlocked(params: {
      userId: string;
      blocked: boolean;
      reason: string | null;
      actorId: string;
    }): Promise<void> {
      const pool = getPool();
      if (params.blocked) {
        await pool.query(
          `UPDATE platform_users SET
             is_blocked = true,
             blocked_at = now(),
             blocked_reason = $2,
             blocked_by = $3::uuid,
             updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          [params.userId, params.reason, params.actorId]
        );
      } else {
        await pool.query(
          `UPDATE platform_users SET
             is_blocked = false,
             blocked_at = NULL,
             blocked_reason = NULL,
             blocked_by = NULL,
             updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          [params.userId]
        );
      }
    },

    async setUserArchived(userId: string, archived: boolean): Promise<void> {
      const pool = getPool();
      await pool.query(
        `UPDATE platform_users SET is_archived = $2, updated_at = now()
         WHERE id = $1::uuid AND role = 'client'`,
        [userId, archived]
      );
    },
  };
}
