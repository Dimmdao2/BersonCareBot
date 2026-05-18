/**
 * Per-topic channel allowlist for patient notification preferences (UI + delivery helpers).
 * `web_push` — отдельный канал браузерных push (PWA), не путать с мессенджерами.
 * SMS здесь не используется.
 */
export const PATIENT_TOPIC_CHANNEL_CODES = ["telegram", "max", "email", "web_push"] as const;
export type PatientTopicChannelCode = (typeof PATIENT_TOPIC_CHANNEL_CODES)[number];

export function isPatientTopicChannelCode(v: string): v is PatientTopicChannelCode {
  return (PATIENT_TOPIC_CHANNEL_CODES as readonly string[]).includes(v);
}

/** Channels that may appear for a mailing topic in the patient UI / delivery fan-out. */
export function allowedChannelsForTopic(topicCode: string): readonly PatientTopicChannelCode[] {
  const t = topicCode.trim();
  if (t === "exercise_reminders" || t === "symptom_reminders") {
    return ["telegram", "max", "web_push"];
  }
  if (t === "appointment_reminders" || t === "news") {
    return ["telegram", "max", "email", "web_push"];
  }
  return PATIENT_TOPIC_CHANNEL_CODES;
}
