import {
  ExerciseArchiveAlreadyArchivedError,
  ExerciseArchiveNotFoundError,
  ExerciseUnarchiveNotArchivedError,
  UsageConfirmationRequiredError,
} from "./errors";
import type { LfkExercisesPort } from "./ports";
import type {
  ArchiveExerciseOptions,
  CreateExerciseInput,
  ExerciseFilter,
  UpdateExerciseInput,
} from "./types";
import { exerciseArchiveRequiresAcknowledgement } from "./types";

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
      const existing = await port.getById(id);
      if (!existing) throw new Error("Упражнение не найдено");
      if (existing.isArchived) {
        throw new Error("Упражнение в архиве. Верните из архива, чтобы редактировать.");
      }
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

    async getExerciseUsage(id: string) {
      return port.getExerciseUsageSummary(id);
    },

    async archiveExercise(id: string, options?: ArchiveExerciseOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new ExerciseArchiveNotFoundError();
      if (existing.isArchived) throw new ExerciseArchiveAlreadyArchivedError();

      const usage = await port.getExerciseUsageSummary(id);
      if (exerciseArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new UsageConfirmationRequiredError(usage);
      }

      const ok = await port.archive(id);
      if (!ok) throw new ExerciseArchiveNotFoundError();
    },

    async unarchiveExercise(id: string) {
      const existing = await port.getById(id);
      if (!existing) throw new ExerciseArchiveNotFoundError();
      if (!existing.isArchived) throw new ExerciseUnarchiveNotArchivedError();

      const ok = await port.unarchive(id);
      if (!ok) throw new ExerciseArchiveNotFoundError();
    },
  };
}

export type LfkExercisesService = ReturnType<typeof createLfkExercisesService>;
