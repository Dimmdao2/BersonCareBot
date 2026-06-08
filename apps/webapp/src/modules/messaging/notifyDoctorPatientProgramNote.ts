import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from "@/modules/messaging/doctorNotifyTargets";
import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from "@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff";
import { resolvePatientTelegramUsernameMention } from "@/app-layer/messaging/resolvePatientTelegramUsernameMention";
import { buildPatientNotifyFromLine } from "@/modules/messaging/patientTelegramUsernameMention";

export function buildDoctorPatientProgramOpenPath(input: {
  patientUserId: string;
  instanceId: string;
}): string {
  return `/app/doctor/clients/${encodeURIComponent(input.patientUserId)}/treatment-programs/${encodeURIComponent(input.instanceId)}`;
}

export function buildDoctorPatientProgramDeepLink(input: {
  patientUserId: string;
  instanceId: string;
}): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  const path = buildDoctorPatientProgramOpenPath(input);
  if (!base) return path;
  return `${base}${path}`;
}

export function buildDoctorPatientProgramNoteNotifyText(input: {
  patientLabel: string;
  exerciseTitle: string;
  notePreview: string;
  deepLink: string;
  telegramUsernameMention?: string | null;
}): string {
  const preview = input.notePreview.trim().slice(0, 500);
  const title = input.exerciseTitle.trim() || "Пункт программы";
  const linkPart = input.deepLink ? `\nПрограмма: ${input.deepLink}` : "";
  return (
    `Комментарий пациента к упражнению\n` +
    `${buildPatientNotifyFromLine(input.patientLabel, input.telegramUsernameMention)}\n` +
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
  opts?: {
    staffDeps?: NotifyDoctorPatientMessageToStaffDeps;
    resolveTelegramUsernameMention?: (platformUserId: string) => Promise<string | null>;
  },
): Promise<void> {
  const deepLink = buildDoctorPatientProgramDeepLink({
    patientUserId: input.patientUserId,
    instanceId: input.instanceId,
  });
  const openPath = buildDoctorPatientProgramOpenPath({
    patientUserId: input.patientUserId,
    instanceId: input.instanceId,
  });
  const resolveMention = opts?.resolveTelegramUsernameMention ?? resolvePatientTelegramUsernameMention;
  const telegramUsernameMention = await resolveMention(input.patientUserId).catch(() => null);
  const text = buildDoctorPatientProgramNoteNotifyText({
    patientLabel: input.patientLabel,
    exerciseTitle: input.exerciseTitle,
    notePreview: input.noteText,
    deepLink,
    telegramUsernameMention,
  });
  const preview = input.noteText.trim().slice(0, 120);
  const noteKey = input.noteText.trim().slice(0, 64).replace(/\s+/g, " ");
  const messageId = `patient-program-note:${input.stageItemId}:${noteKey}`;
  const replyMarkup = {
    inline_keyboard: [[{ text: "Ответить", callback_data: `program_reply:${input.stageItemId}` }]],
  };

  if (opts?.staffDeps) {
    void notifyDoctorPatientMessageToStaff(
      {
        topicCode: "doctor_patient_program_notes",
        messageId,
        text,
        pushTitle: "Комментарий к упражнению",
        pushBody: `${input.patientLabel}: ${preview}`,
        pushUrl: openPath,
        replyMarkup,
      },
      opts.staffDeps,
    ).catch((err: unknown) => {
      console.error("[notifyDoctorPatientProgramNote] staff notify error:", err);
    });
    return;
  }

  const targets = await loadDoctorNotifyTargets();
  if (targets.telegram.length === 0 && targets.max.length === 0) return;

  await relayTextToDoctorTargets(
    messageId,
    targets,
    text,
    "patient-program-note",
    replyMarkup,
  );
}
