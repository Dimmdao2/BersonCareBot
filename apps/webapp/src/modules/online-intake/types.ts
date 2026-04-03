export type IntakeType = "lfk" | "nutrition";

export type IntakeStatus = "new" | "in_review" | "contacted" | "closed";

export type IntakeAttachmentType = "file" | "url";

export type IntakeRequest = {
  id: string;
  userId: string;
  type: IntakeType;
  status: IntakeStatus;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntakeAnswer = {
  id: string;
  requestId: string;
  questionId: string;
  ordinal: number;
  value: string;
  createdAt: string;
};

export type IntakeAttachment = {
  id: string;
  requestId: string;
  attachmentType: IntakeAttachmentType;
  s3Key: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  createdAt: string;
};

export type IntakeStatusHistoryEntry = {
  id: string;
  requestId: string;
  fromStatus: IntakeStatus | null;
  toStatus: IntakeStatus;
  changedBy: string | null;
  note: string | null;
  changedAt: string;
};

export type IntakeRequestFull = IntakeRequest & {
  answers: IntakeAnswer[];
  attachments: IntakeAttachment[];
  statusHistory: IntakeStatusHistoryEntry[];
};

/** Doctor/admin API: identity from `platform_users` (same shape for list and details). Always strings; may be "" if profile field missing. */
export type DoctorIntakePatientIdentity = {
  patientName: string;
  patientPhone: string;
};

export type IntakeRequestWithPatientIdentity = IntakeRequest & DoctorIntakePatientIdentity;

export type IntakeRequestFullWithPatientIdentity = IntakeRequestFull & DoctorIntakePatientIdentity;

export type CreateLfkIntakeInput = {
  userId: string;
  description: string;
  /** External URLs (max 5). Order is preserved after URL attachments, then file attachments. */
  attachmentUrls?: string[];
  /**
   * `media_files.id` values (max 10). Same request may include both `attachmentUrls` and `attachmentFileIds` (mixed).
   * Server deduplicates repeated IDs within the array. Ownership and file status are validated before persist.
   */
  attachmentFileIds?: string[];
};

export type CreateNutritionIntakeInput = {
  userId: string;
  answers: Array<{ questionId: string; value: string }>;
};

export type ChangeIntakeStatusInput = {
  requestId: string;
  changedBy: string;
  toStatus: IntakeStatus;
  note?: string;
};

export const NUTRITION_QUESTIONS: Array<{
  id: string;
  text: string;
  ordinal: number;
  required: boolean;
}> = [
  { id: "q1", text: "Ваш возраст?", ordinal: 1, required: true },
  { id: "q2", text: "Ваш вес (кг) и рост (см)?", ordinal: 2, required: true },
  {
    id: "q3",
    text: "Есть ли хронические заболевания или ограничения в питании?",
    ordinal: 3,
    required: false,
  },
  {
    id: "q4",
    text: "Ваша цель (weight_loss / weight_gain / healthy_eating / other)?",
    ordinal: 4,
    required: true,
  },
  {
    id: "q5",
    text: "Опишите текущий рацион и ваш запрос к нутрициологу",
    ordinal: 5,
    required: true,
  },
];

export const VALID_Q4_VALUES = ["weight_loss", "weight_gain", "healthy_eating", "other"] as const;

export const VALID_STATUS_TRANSITIONS: Record<IntakeStatus, IntakeStatus[]> = {
  new: ["in_review", "contacted", "closed"],
  in_review: ["contacted", "closed"],
  contacted: ["closed"],
  closed: [],
};

export const MAX_ACTIVE_INTAKE_PER_USER = 3;
