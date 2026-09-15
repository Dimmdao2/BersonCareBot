import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  parseStaffNotificationProfiles,
  type StoredProfilesResult,
} from '@/infra/repos/staffNotificationProfilePayload';
import type { ClinicLeadNotificationProfilesPort } from '@/modules/leads/clinicNotificationProfilesPort';

/**
 * Одно чтение на всю отправку уведомления о заявке.
 *
 * Дверь заявки публичная и держит принципал ОРГАНИЗАЦИИ (`tenant_service`). Реляционного пути к
 * `user_channel_bindings`, `user_channel_preferences`, `user_notification_topic_channels` и
 * `user_web_push_subscriptions` у этого класса нет, и выдавать его нельзя: это данные персонала, а
 * класс обслуживает поверхность, куда приходит посетитель. Корень отдаёт ровно то, что нужно
 * отправке по ЭТОЙ организации, и ничего больше.
 */
export function createPgClinicLeadNotificationProfilesPort(): ClinicLeadNotificationProfilesPort {
  return {
    async listForLeadOrganization({ organizationId, topicCode }) {
      const result = await runWebappNamedRoot<{ result: StoredProfilesResult }>(
        getWebappSqlDb(),
        'app.read_clinic_lead_notification_profiles(uuid,text)',
        [organizationId, topicCode],
        sql`SELECT app.read_clinic_lead_notification_profiles(
          ${organizationId}::uuid,
          ${topicCode}::text
        ) AS result`,
      );
      return parseStaffNotificationProfiles(
        result.rows[0]?.result,
        'clinic_lead_notification_profiles_failed',
      );
    },
  };
}

export const emptyClinicLeadNotificationProfilesPort: ClinicLeadNotificationProfilesPort = {
  listForLeadOrganization: async () => [],
};
