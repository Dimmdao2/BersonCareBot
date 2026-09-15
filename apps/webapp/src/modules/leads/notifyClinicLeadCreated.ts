import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff';
import type { Lead } from './types';

const LEAD_CREATED_TOPIC = 'lead.created' as const;

/**
 * The current staff-notification channel/preferences model has no separate lead topic.
 * Reuse the existing patient-message topic rather than silently creating a second preference
 * surface; only active owner/admin members of this lead's organization are selected by the port.
 */
export async function notifyClinicLeadCreated(
  lead: Lead,
  deps: NotifyDoctorPatientMessageToStaffDeps,
): Promise<void> {
  const staffUserIds = await deps.staffUsers.listActiveClinicAdminUserIds(lead.organizationId);
  await notifyDoctorPatientMessageToStaff(
    {
      organizationId: lead.organizationId,
      staffUserIds,
      topicCode: 'doctor_patient_messages',
      messageId: `${LEAD_CREATED_TOPIC}:${lead.id}`,
      senderDisplayName: lead.submittedEmail,
      notificationText: 'Новая заявка',
      notificationTitle: 'Новая заявка',
      notificationUrl: '/app/doctor/communications?tab=leads',
      nativeRoute: '/app/doctor/communications',
    },
    deps,
  );
}
