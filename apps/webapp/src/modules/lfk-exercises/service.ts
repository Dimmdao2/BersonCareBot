import type { LfkExercisesPort } from "./ports";
import type { CreateExerciseInput, ExerciseFilter, UpdateExerciseInput } from "./types";

export function createLfkExercisesService(port: LfkExercisesPort) {
  return {
    async listExercises(filter: ExerciseFilter = {}) {
      return port.list(filter);
    },

    async getExercise(id: string) {
      return port.getById(id);
    },

    async createExercise(input: CreateExerciseInput, createdBy: string | null) {
      const title = input.title?.trim() ?? "";
      if (!title) {
        throw new Error("Название упражнения обязательно");
      }
      return port.create(
        {
          ...input,
          title,
          description: input.description?.trim() || null,
          contraindications: input.contraindications?.trim() || null,
        },
        createdBy
      );
    },

    async updateExercise(id: string, input: UpdateExerciseInput) {
      const patch: UpdateExerciseInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название упражнения обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() || null;
      }
      if (input.contraindications !== undefined) {
        patch.contraindications = input.contraindications?.trim() || null;
      }
      const row = await port.update(id, patch);
      if (!row) throw new Error("Упражнение не найдено");
      return row;
    },

    async archiveExercise(id: string) {
      const ok = await port.archive(id);
      if (!ok) throw new Error("Упражнение не найдено");
    },
  };
}

export type LfkExercisesService = ReturnType<typeof createLfkExercisesService>;
