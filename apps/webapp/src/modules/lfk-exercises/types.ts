import type { MediaPreviewStatus } from "@/modules/media/types";

export type ExerciseLoadType = "strength" | "stretch" | "balance" | "cardio" | "other";

export type ExerciseMediaType = "image" | "video" | "gif";

export type ExerciseMedia = {
  id: string;
  exerciseId: string;
  mediaUrl: string;
  mediaType: ExerciseMediaType;
  sortOrder: number;
  createdAt: string;
  /** Library grid preview (joined from `media_files` when `mediaUrl` is `/api/media/{uuid}`). */
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
};

export type Exercise = {
  id: string;
  title: string;
  description: string | null;
  regionRefId: string | null;
  loadType: ExerciseLoadType | null;
  difficulty1_10: number | null;
  contraindications: string | null;
  tags: string[] | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  media: ExerciseMedia[];
};

export type ExerciseFilter = {
  regionRefId?: string | null;
  loadType?: ExerciseLoadType | null;
  difficultyMin?: number | null;
  difficultyMax?: number | null;
  tags?: string[] | null;
  includeArchived?: boolean;
  search?: string | null;
};

export type ExerciseMediaInput = {
  mediaUrl: string;
  mediaType: ExerciseMediaType;
  sortOrder?: number;
};

export type CreateExerciseInput = {
  title: string;
  description?: string | null;
  regionRefId?: string | null;
  loadType?: ExerciseLoadType | null;
  difficulty1_10?: number | null;
  contraindications?: string | null;
  tags?: string[] | null;
  media?: ExerciseMediaInput[];
};

export type UpdateExerciseInput = {
  title?: string;
  description?: string | null;
  regionRefId?: string | null;
  loadType?: ExerciseLoadType | null;
  difficulty1_10?: number | null;
  contraindications?: string | null;
  tags?: string[] | null;
  media?: ExerciseMediaInput[] | null;
};
