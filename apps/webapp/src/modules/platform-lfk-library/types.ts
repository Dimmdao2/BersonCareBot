export type PlatformLfkMediaInput = {
  url: string;
  media_type: "image" | "video" | "gif";
  sort_order: number;
};

export type PlatformLfkExercise = {
  id: string;
  title: string;
  description: string | null;
  isArchived: boolean;
  media: PlatformLfkMediaInput[];
};

export type PlatformLfkTemplate = {
  id: string;
  title: string;
  description: string | null;
  status: "published" | "archived";
  exerciseIds: string[];
};

export type PlatformLfkSnapshot = {
  exercises: PlatformLfkExercise[];
  templates: PlatformLfkTemplate[];
};

export type SavePlatformLfkExerciseInput = {
  id?: string;
  title: string;
  description?: string;
  media?: PlatformLfkMediaInput[];
};

export type SavePlatformLfkTemplateInput = {
  id?: string;
  title: string;
  description?: string;
  exerciseIds: string[];
};
