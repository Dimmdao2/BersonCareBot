import type { Exercise, ExerciseMedia } from "@/modules/lfk-exercises/types";

export type TemplateStatus = "draft" | "published" | "archived";

export type TemplateExercise = {
  id: string;
  templateId: string;
  exerciseId: string;
  /** Подставляется при list/get с join на lfk_exercises. */
  exerciseTitle?: string;
  sortOrder: number;
  reps: number | null;
  sets: number | null;
  side: "left" | "right" | "both" | null;
  maxPain0_10: number | null;
  comment: string | null;
  /** Первое медиа упражнения (list/get при join на lfk_exercise_media). */
  firstMedia?: ExerciseMedia | null;
};

export type Template = {
  id: string;
  title: string;
  description: string | null;
  status: TemplateStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: TemplateExercise[];
  /** Для списка шаблонов без загрузки строк упражнений. */
  exerciseCount?: number;
  /** Первое медиа каждого из первых упражнений шаблона (для превью в списке). */
  exerciseThumbnails?: ExerciseMedia[];
};

export type TemplateFilter = {
  status?: TemplateStatus | null;
  search?: string | null;
  /**
   * Полные строки упражнений и первое медиа каждой строки (доп. JOIN-запрос).
   * По умолчанию false — только счётчик и до 6 превью-миниатюр для списка.
   */
  includeExerciseDetails?: boolean;
};

export type CreateTemplateInput = {
  title: string;
  description?: string | null;
};

export type UpdateTemplateInput = {
  title?: string;
  description?: string | null;
};

export type TemplateExerciseInput = {
  exerciseId: string;
  sortOrder: number;
  reps?: number | null;
  sets?: number | null;
  side?: "left" | "right" | "both" | null;
  maxPain0_10?: number | null;
  comment?: string | null;
};

/** Краткая карточка упражнения для picker (list из lfk-exercises). */
export type ExerciseSummary = Pick<Exercise, "id" | "title" | "loadType" | "difficulty1_10"> & {
  previewMediaUrl?: string | null;
};

/** Сколько сущностей отдаём в UI подробно (остальное — только счётчик). */
export const LFK_TEMPLATE_USAGE_DETAIL_LIMIT = 12;

/** Одна ссылка «где используется» для шаблона комплекса ЛФК. */
export type LfkTemplateUsageRef =
  | { kind: "treatment_program_template"; id: string; title: string }
  | {
      kind: "treatment_program_instance" | "patient_lfk_assignment_client";
      id: string;
      title: string;
      patientUserId: string;
    };

/** Сводка использования шаблона комплекса (read-only, для врача и archive guard). */
export type LfkTemplateUsageSnapshot = {
  activePatientLfkAssignmentCount: number;
  publishedTreatmentProgramTemplateCount: number;
  draftTreatmentProgramTemplateCount: number;
  activeTreatmentProgramInstanceCount: number;
  completedTreatmentProgramInstanceCount: number;
  activePatientLfkAssignmentRefs: LfkTemplateUsageRef[];
  publishedTreatmentProgramTemplateRefs: LfkTemplateUsageRef[];
  draftTreatmentProgramTemplateRefs: LfkTemplateUsageRef[];
  activeTreatmentProgramInstanceRefs: LfkTemplateUsageRef[];
  completedTreatmentProgramInstanceRefs: LfkTemplateUsageRef[];
};

export const EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT: LfkTemplateUsageSnapshot = {
  activePatientLfkAssignmentCount: 0,
  publishedTreatmentProgramTemplateCount: 0,
  draftTreatmentProgramTemplateCount: 0,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  activePatientLfkAssignmentRefs: [],
  publishedTreatmentProgramTemplateRefs: [],
  draftTreatmentProgramTemplateRefs: [],
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
};

/** Требуется явное подтверждение архивации (см. ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN). */
export function lfkTemplateArchiveRequiresAcknowledgement(u: LfkTemplateUsageSnapshot): boolean {
  return (
    u.activePatientLfkAssignmentCount > 0 ||
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0
  );
}

export type ArchiveTemplateOptions = {
  acknowledgeUsageWarning?: boolean;
};
