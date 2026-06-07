import type { TopicChannelPrefRow } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { SpecialistTaskReminderChannelCode } from "@/modules/specialist-tasks/types";
import type { DoctorNotificationTopicCode } from "./doctorNotificationTopics";
import { allowedDoctorChannelsForTopic, type DoctorTopicChannelCode } from "./doctorTopicChannelRules";

/** Default enabled channels per topic when user has no explicit pref row for that channel. */
export function defaultDoctorTopicFallbackChannels(
  topicCode: DoctorNotificationTopicCode,
): readonly SpecialistTaskReminderChannelCode[] {
  if (topicCode === "doctor_patient_messages" || topicCode === "doctor_patient_program_notes") {
    return ["telegram", "max"];
  }
  return [];
}

export function isDoctorTopicChannelEnabled(
  topicChannelRows: TopicChannelPrefRow[],
  topicCode: string,
  channelCode: DoctorTopicChannelCode,
  globalFallback: readonly string[] | null,
): boolean {
  const row = topicChannelRows.find(
    (r) => r.topicCode === topicCode && r.channelCode === channelCode,
  );
  if (row) return row.isEnabled;
  if (globalFallback && globalFallback.length > 0) {
    return globalFallback.includes(channelCode);
  }
  return false;
}

export function resolveConfiguredDoctorTopicChannels(
  topicCode: string,
  topicChannelRows: TopicChannelPrefRow[],
  globalFallback: readonly string[] | null,
): DoctorTopicChannelCode[] {
  const allowed = allowedDoctorChannelsForTopic(topicCode);
  const enabled: DoctorTopicChannelCode[] = [];
  for (const code of allowed) {
    if (isDoctorTopicChannelEnabled(topicChannelRows, topicCode, code, globalFallback)) {
      enabled.push(code);
    }
  }
  return enabled;
}
