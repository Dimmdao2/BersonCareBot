import type { Exercise } from "@/modules/lfk-exercises/types";

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
};

export type TemplateFilter = {
  status?: TemplateStatus | null;
  search?: string | null;
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
