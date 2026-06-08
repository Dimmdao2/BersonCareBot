import type { SpecialistTaskReminderChannelCode } from "@/modules/specialist-tasks/types";
import type { DoctorNotificationTopicCode } from "./doctorNotificationTopics";

export const DOCTOR_TOPIC_CHANNEL_CODES = ["telegram", "max", "email", "web_push"] as const;
export type DoctorTopicChannelCode = (typeof DOCTOR_TOPIC_CHANNEL_CODES)[number];

export function isDoctorTopicChannelCode(v: string): v is DoctorTopicChannelCode {
  return (DOCTOR_TOPIC_CHANNEL_CODES as readonly string[]).includes(v);
}

export function allowedDoctorChannelsForTopic(
  topicCode: string,
): readonly DoctorTopicChannelCode[] {
  const t = topicCode.trim();
  if (t === "doctor_specialist_task_reminders") {
    return ["telegram", "max", "email", "web_push"];
  }
  if (t === "doctor_patient_messages" || t === "doctor_patient_program_notes") {
    return ["web_push", "telegram", "max"];
  }
  return DOCTOR_TOPIC_CHANNEL_CODES;
}

export function toSpecialistTaskReminderChannels(
  channels: readonly DoctorTopicChannelCode[],
): SpecialistTaskReminderChannelCode[] {
  return channels.filter((c): c is SpecialistTaskReminderChannelCode =>
    (["telegram", "max", "email", "web_push"] as const).includes(c as SpecialistTaskReminderChannelCode),
  );
}
