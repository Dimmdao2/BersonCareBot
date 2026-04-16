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
