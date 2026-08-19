import { and, inArray, isNull, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { StaffUsersPort } from '@/modules/doctor-notifications/staffUsersPort';
import { platformUsers } from '../../../db/schema/schema';

function parseStaffOrganizationRecipients(
  payload: unknown,
): Array<{ userId: string; organizationId: string }> {
  if (!Array.isArray(payload)) throw new Error('operator_alert_staff_push_audience_invalid');
  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const userId = typeof row.userId === 'string' ? row.userId : null;
    const organizationId = typeof row.organizationId === 'string' ? row.organizationId : null;
    return userId && organizationId ? [{ userId, organizationId }] : [];
  });
}

export function createPgStaffUsersPort(): StaffUsersPort {
  return {
    async listActiveStaffUserIds() {
      const db = getDrizzle();
      const rows = await db
        .select({ id: platformUsers.id })
        .from(platformUsers)
        .where(
          and(inArray(platformUsers.role, ['doctor', 'admin']), isNull(platformUsers.mergedIntoId)),
        );
      return rows.map((r) => r.id);
    },
    /**
     * Аудитория staff-веб-пуша операторского алерта. Читается объявленным корнем, а не отношением:
     * `be_organization_members` — арендаторская таблица, и `app_worker`, под которым идёт
     * пятиминутный критический тик, на ней отказан (замер 19.08 на TEST: `42501 permission denied
     * for table be_organization_members`). Отказ гасился `.catch` в `dispatchOperatorAlert`, канал
     * веб-пуша молча не срабатывал, а тик писал `success`. Дверь — та же по форме, что у соседних
     * каналов того же диспетчера (`app.read_admin_notification_targets(text)`, миграция 0030).
     */
    async listActiveStaffOrganizationRecipients() {
      const result = await runWebappNamedRoot<{ recipients: unknown }>(
        getWebappSqlDb(),
        'app.list_operator_alert_staff_push_recipients()',
        [],
        sql`SELECT app.list_operator_alert_staff_push_recipients() AS recipients`,
      );
      return parseStaffOrganizationRecipients(result.rows[0]?.recipients);
    },
  };
}

export const inMemoryStaffUsersPort: StaffUsersPort = {
  listActiveStaffUserIds: async () => [],
};
