import type { PlatformLfkLibraryPort } from "./ports";
import type { SavePlatformLfkExerciseInput, SavePlatformLfkTemplateInput } from "./types";

export function createPlatformLfkLibraryService(port: PlatformLfkLibraryPort) {
  return {
    getSnapshot: () => port.getSnapshot(),
    saveExercise: (actorId: string | null, input: SavePlatformLfkExerciseInput) =>
      port.saveExercise(actorId, input),
    setExerciseArchived: (actorId: string | null, id: string, archived: boolean) =>
      port.setExerciseArchived(actorId, id, archived),
    saveTemplate: (actorId: string | null, input: SavePlatformLfkTemplateInput) =>
      port.saveTemplate(actorId, input),
    setTemplateArchived: (actorId: string | null, id: string, archived: boolean) =>
      port.setTemplateArchived(actorId, id, archived),
  };
}
