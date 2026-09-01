import { createHash } from 'node:crypto';
import { env } from '@/config/env';
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from '@/modules/messaging/doctorNotifyTargets';
import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff';
import { buildPersonalChatNotificationText } from '@/modules/messaging/notifyPatientDoctorReply';
import { logger, serializeError } from '@/infra/logging/logger';
import { reportEmptyAudience } from '@/modules/operator-alerts/emptyAudienceRuntime';

export function buildDoctorPatientProgramOpenPath(input: {
  patientUserId: string;
  instanceId: string;
}): string {
  return `/app/doctor/clients/${encodeURIComponent(input.patientUserId)}/treatment-programs/${encodeURIComponent(input.instanceId)}`;
}

export function buildDoctorPatientProgramDeepLink(input: {
  patientUserId: string;
  instanceId: string;
  appBaseUrl: string;
}): string {
  const base = input.appBaseUrl.replace(/\/$/, '');
  const path = buildDoctorPatientProgramOpenPath(input);
  if (!base) return path;
  return `${base}${path}`;
}

export function buildDoctorPatientProgramNoteNotifyText(input: {
  patientLabel: string;
  deepLink: string;
}): string {
  const notificationText = buildPersonalChatNotificationText(input.patientLabel, 'patient');
  return input.deepLink ? `${notificationText}\n\n${input.deepLink}` : notificationText;
}

export type NotifyDoctorPatientProgramNoteInput = {
  organizationId: string;
  patientUserId: string;
  instanceId: string;
  stageItemId: string;
  patientLabel: string;
  exerciseTitle: string;
  noteText: string;
};

export async function notifyDoctorPatientProgramNote(
  input: NotifyDoctorPatientProgramNoteInput,
  opts?: {
    staffDeps?: NotifyDoctorPatientMessageToStaffDeps;
  },
): Promise<void> {
  const deepLink = buildDoctorPatientProgramDeepLink({
    patientUserId: input.patientUserId,
    instanceId: input.instanceId,
    appBaseUrl: env.APP_BASE_URL,
  });
  const text = buildDoctorPatientProgramNoteNotifyText({
    patientLabel: input.patientLabel,
    deepLink,
  });
  const noteKey = createHash('sha256').update(input.noteText.trim()).digest('hex').slice(0, 16);
  const messageId = `patient-program-note:${input.stageItemId}:${noteKey}`;

  if (opts?.staffDeps) {
    void notifyDoctorPatientMessageToStaff(
      {
        organizationId: input.organizationId,
        topicCode: 'doctor_patient_program_notes',
        messageId,
        senderDisplayName: input.patientLabel,
        notificationUrl: deepLink,
      },
      opts.staffDeps,
    ).catch((err: unknown) => {
      logger.error(
        { err: serializeError(err) },
        '[notifyDoctorPatientProgramNote] staff notify error',
      );
    });
    return;
  }

  const targets = await loadDoctorNotifyTargets();
  if (targets.telegram.length === 0 && targets.max.length === 0) {
    // D-b: раньше здесь стоял голый `return` — ровно июльский баг. Пустая аудитория
    // неотличима от успеха, поэтому теперь она считается, логируется и уходит в fallback.
    await reportEmptyAudience({
      topic: 'notify_doctor_program_note',
      severity: 'operational',
      channels: ['telegram', 'max'],
    });
    return;
  }

  await relayTextToDoctorTargets(messageId, targets, text, 'patient-program-note');
}
