export const DOCTOR_NOTIFICATION_TOPIC_CODES = [
  "doctor_specialist_task_reminders",
  "doctor_patient_messages",
] as const;

export type DoctorNotificationTopicCode = (typeof DOCTOR_NOTIFICATION_TOPIC_CODES)[number];

export const DOCTOR_NOTIFICATION_TOPIC_LABELS: Record<DoctorNotificationTopicCode, string> = {
  doctor_specialist_task_reminders: "Напоминания о задачах",
  doctor_patient_messages: "Сообщения от пациентов",
};

export function isDoctorNotificationTopicCode(v: string): v is DoctorNotificationTopicCode {
  return (DOCTOR_NOTIFICATION_TOPIC_CODES as readonly string[]).includes(v);
}
