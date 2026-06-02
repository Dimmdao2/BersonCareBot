export type SpecialistTaskRow = {
  id: string;
  ownerUserId: string;
  patientUserId: string | null;
  title: string;
  description: string | null;
  dueAt: string | null;
  remindAt: string | null;
  isImportant: boolean;
  completedAt: string | null;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SpecialistTaskPatientSummary = {
  openCount: number;
  nextImportantOrOverdue: {
    id: string;
    title: string;
    dueAt: string | null;
    isImportant: boolean;
  } | null;
};

export type SpecialistTaskReminderChannelCode = "telegram" | "max" | "web_push" | "email";

export const SPECIALIST_TASK_REMINDER_CHANNEL_CODES = [
  "telegram",
  "max",
  "web_push",
  "email",
] as const satisfies readonly SpecialistTaskReminderChannelCode[];

export const DEFAULT_SPECIALIST_TASK_REMINDER_CHANNELS: SpecialistTaskReminderChannelCode[] = [
  "telegram",
  "max",
];
