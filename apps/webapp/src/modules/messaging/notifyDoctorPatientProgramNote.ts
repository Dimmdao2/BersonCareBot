import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from "@/modules/messaging/doctorNotifyTargets";
import {
  doctorReplyCallbackConversationId,
} from "@/modules/messaging/notifyDoctorPatientMessage";

export function buildDoctorPatientProgramDeepLink(input: {
  patientUserId: string;
  instanceId: string;
}): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  if (!base) {
    return `/app/doctor/clients/${encodeURIComponent(input.patientUserId)}/treatment-programs/${encodeURIComponent(input.instanceId)}`;
  }
  return `${base}/app/doctor/clients/${encodeURIComponent(input.patientUserId)}/treatment-programs/${encodeURIComponent(input.instanceId)}`;
}

export function buildDoctorPatientProgramNoteNotifyText(input: {
  patientLabel: string;
  exerciseTitle: string;
  notePreview: string;
  deepLink: string;
}): string {
  const preview = input.notePreview.trim().slice(0, 500);
  const title = input.exerciseTitle.trim() || "Пункт программы";
  const linkPart = input.deepLink ? `\nПрограмма: ${input.deepLink}` : "";
  return (
    `Комментарий пациента к упражнению\n` +
    `От: ${input.patientLabel}\n` +
    `${title}\n` +
    `${preview}${linkPart}`
  );
}

export type NotifyDoctorPatientProgramNoteInput = {
  patientUserId: string;
  instanceId: string;
  stageItemId: string;
  patientLabel: string;
  exerciseTitle: string;
  noteText: string;
};

export async function notifyDoctorPatientProgramNote(
  input: NotifyDoctorPatientProgramNoteInput,
): Promise<void> {
  const targets = await loadDoctorNotifyTargets();
  if (targets.telegram.length === 0 && targets.max.length === 0) return;

  const deepLink = buildDoctorPatientProgramDeepLink({
    patientUserId: input.patientUserId,
    instanceId: input.instanceId,
  });
  const text = buildDoctorPatientProgramNoteNotifyText({
    patientLabel: input.patientLabel,
    exerciseTitle: input.exerciseTitle,
    notePreview: input.noteText,
    deepLink,
  });

  const replyConversationId = doctorReplyCallbackConversationId(input.patientUserId);
  const replyMarkup = {
    inline_keyboard: [[{ text: "Ответить", callback_data: `admin_reply:${replyConversationId}` }]],
  };

  const noteKey = input.noteText.trim().slice(0, 64).replace(/\s+/g, " ");
  await relayTextToDoctorTargets(
    `patient-program-note:${input.stageItemId}:${noteKey}`,
    targets,
    text,
    "patient-program-note",
    replyMarkup,
  );
}
