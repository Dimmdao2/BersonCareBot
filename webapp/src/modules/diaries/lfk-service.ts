/**
 * LFK (exercise) diary — business logic only; storage delegated to LfkDiaryPort.
 */
import type { LfkDiaryPort } from "./ports";
import type { LfkCompletion } from "./types";

export type { LfkCompletion } from "./types";

export function createLfkDiaryService(port: LfkDiaryPort): {
  addLfkCompletion: (params: {
    userId: string;
    exerciseId: string;
    exerciseTitle: string;
  }) => LfkCompletion;
  listLfkCompletions: (userId: string, limit?: number) => LfkCompletion[];
} {
  return {
    addLfkCompletion(params) {
      return port.addCompletion({
        userId: params.userId,
        exerciseId: params.exerciseId,
        exerciseTitle: params.exerciseTitle?.trim() || "Упражнение",
      });
    },
    listLfkCompletions(userId, limit) {
      return port.listCompletions(userId, limit);
    },
  };
}
