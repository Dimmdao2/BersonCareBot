import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff';
import { env } from '@/config/env';
import type { ClinicLeadNotificationProfilesPort } from './clinicNotificationProfilesPort';
import type { Lead } from './types';

const LEAD_CREATED_TOPIC = 'lead.created' as const;
const LEAD_NOTIFICATION_TOPIC_CODE = 'doctor_leads' as const;

export type NotifyClinicLeadCreatedDeps = NotifyDoctorPatientMessageToStaffDeps & {
  clinicLeadNotificationProfiles: ClinicLeadNotificationProfilesPort;
};

/**
 * Тема у заявки своя — «Заявки» (решение владельца 15.09), а не тема сообщений пациента: иначе
 * выключить сообщения означало бы выключить и заявки. Сама тема показывается в кабинете только
 * при тарифе и включённой механике заявок; получателей отбирает порт — активные owner/admin
 * этой организации.
 *
 * Аудиторию И способ доставки отдаёт ОДИН порт. Причина не в экономии запросов: заявку создаёт
 * только публичная дверь, у которой принципал ОРГАНИЗАЦИИ, а у этого класса реляционного пути к
 * предпочтениям, привязкам и подпискам персонала нет — каждое такое чтение отбивается отказом
 * прав. Пока их было четыре, уведомление умирало на первом, и с `void … .catch` — молча.
 */
export async function notifyClinicLeadCreated(
  lead: Lead,
  deps: NotifyClinicLeadCreatedDeps,
): Promise<void> {
  const staffProfiles = await deps.clinicLeadNotificationProfiles.listForLeadOrganization({
    organizationId: lead.organizationId,
    topicCode: LEAD_NOTIFICATION_TOPIC_CODE,
  });
  await notifyDoctorPatientMessageToStaff(
    {
      organizationId: lead.organizationId,
      staffProfiles,
      topicCode: LEAD_NOTIFICATION_TOPIC_CODE,
      messageId: `${LEAD_CREATED_TOPIC}:${lead.id}`,
      senderDisplayName: lead.submittedEmail,
      notificationText: 'Новая заявка',
      notificationTitle: 'Новая заявка',
      notificationUrl: `${env.APP_BASE_URL.replace(/\/$/, '')}/app/doctor/communications?tab=leads`,
      nativeRoute: '/app/doctor/communications',
    },
    deps,
  );
}
