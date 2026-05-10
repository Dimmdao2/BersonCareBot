/**
 * Per-topic channel allowlist for patient notification preferences (UI + delivery helpers).
 * SMS is never a preference channel here.
 */
export const PATIENT_TOPIC_CHANNEL_CODES = ["telegram", "max", "email"] as const;
export type PatientTopicChannelCode = (typeof PATIENT_TOPIC_CHANNEL_CODES)[number];

export function isPatientTopicChannelCode(v: string): v is PatientTopicChannelCode {
  return (PATIENT_TOPIC_CHANNEL_CODES as readonly string[]).includes(v);
}

/** Channels that may appear for a mailing topic in the patient UI / delivery fan-out. */
export function allowedChannelsForTopic(topicCode: string): readonly PatientTopicChannelCode[] {
  const t = topicCode.trim();
  if (t === "exercise_reminders" || t === "symptom_reminders") {
    return ["telegram", "max"];
  }
  if (t === "appointment_reminders" || t === "news") {
    return ["telegram", "max", "email"];
  }
  return PATIENT_TOPIC_CHANNEL_CODES;
}
