import type {
  PlatformLfkSnapshot,
  SavePlatformLfkExerciseInput,
  SavePlatformLfkTemplateInput,
} from "./types";

export type PlatformLfkLibraryPort = {
  getSnapshot(): Promise<PlatformLfkSnapshot>;
  saveExercise(actorId: string | null, input: SavePlatformLfkExerciseInput): Promise<string>;
  setExerciseArchived(actorId: string | null, id: string, archived: boolean): Promise<boolean>;
  saveTemplate(actorId: string | null, input: SavePlatformLfkTemplateInput): Promise<string>;
  setTemplateArchived(actorId: string | null, id: string, archived: boolean): Promise<boolean>;
};
