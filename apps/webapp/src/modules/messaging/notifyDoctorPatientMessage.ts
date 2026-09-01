import { env } from '@/config/env';
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from '@/modules/messaging/doctorNotifyTargets';
import { buildPersonalChatNotificationText } from '@/modules/messaging/notifyPatientDoctorReply';
import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff';
import { communicationsChatHref } from '@/app/app/doctor/communications/doctorCommunicationsTabs';
import { logger, serializeError } from '@/infra/logging/logger';
import { reportEmptyAudience } from '@/modules/operator-alerts/emptyAudienceRuntime';

export function buildDoctorMessagesOpenPath(conversationId: string): string {
  return communicationsChatHref(conversationId);
}

export function buildDoctorMessagesDeepLink(conversationId: string, appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/$/, '');
  const path = buildDoctorMessagesOpenPath(conversationId);
  if (!base) return path;
  return `${base}${path}`;
}

export function buildDoctorPatientMessageNotifyText(input: {
  patientLabel: string;
  deepLink: string;
}): string {
  const notificationText = buildPersonalChatNotificationText(input.patientLabel, 'patient');
  return input.deepLink ? `${notificationText}\n\n${input.deepLink}` : notificationText;
}

export type NotifyDoctorPatientMessageInput = {
  organizationId: string;
  platformUserId: string;
  conversationId: string;
  messageId: string;
  messageText: string;
  patientLabel: string;
  source: 'webapp' | 'telegram' | 'max';
};

export async function notifyDoctorPatientMessage(
  input: NotifyDoctorPatientMessageInput,
  opts?: {
    staffDeps?: NotifyDoctorPatientMessageToStaffDeps;
  },
): Promise<void> {
  const deepLink = buildDoctorMessagesDeepLink(input.conversationId, env.APP_BASE_URL);
  const text = buildDoctorPatientMessageNotifyText({
    patientLabel: input.patientLabel,
    deepLink,
  });

  if (opts?.staffDeps) {
    void notifyDoctorPatientMessageToStaff(
      {
        organizationId: input.organizationId,
        topicCode: 'doctor_patient_messages',
        messageId: `patient-msg-notify:${input.messageId}`,
        senderDisplayName: input.patientLabel,
        notificationUrl: deepLink,
      },
      opts.staffDeps,
    ).catch((err: unknown) => {
      logger.error({ err: serializeError(err) }, '[notifyDoctorPatientMessage] staff notify error');
    });
    return;
  }

  const targets = await loadDoctorNotifyTargets();
  if (targets.telegram.length === 0 && targets.max.length === 0) {
    // D-b: та же форма, только вывернутая — блок под `if` без `else`. Молчание при
    // пустых `admin_*_ids`/`doctor_*_ids` выглядело как успешная доставка.
    await reportEmptyAudience({
      topic: 'notify_doctor_patient_message',
      severity: 'operational',
      channels: ['telegram', 'max'],
    });
    return;
  }

  await relayTextToDoctorTargets(
    `patient-msg-notify:${input.messageId}`,
    targets,
    text,
    'patient-msg-notify',
  );
}
