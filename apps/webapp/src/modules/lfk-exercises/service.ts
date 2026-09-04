import {
  ExerciseArchiveAlreadyArchivedError,
  ExerciseArchiveNotFoundError,
  ExerciseUnarchiveNotArchivedError,
  UsageConfirmationRequiredError,
} from './errors';
import type { LfkExercisesPort } from './ports';
import type {
  ArchiveExerciseOptions,
  ExerciseAccessOptions,
  CreateExerciseInput,
  ExerciseFilter,
  UpdateExerciseInput,
} from './types';
import { exerciseArchiveRequiresAcknowledgement } from './types';
import { UserFacingError } from '@/shared/errors/userFacingError';

export type LfkExerciseWriteOptions = {
  runExerciseWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

function runExerciseWrite<T>(
  options: LfkExerciseWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runExerciseWrite ? options.runExerciseWrite(fn) : fn();
}

export function createLfkExercisesService(port: LfkExercisesPort) {
  return {
    async listExercises(filter: ExerciseFilter = {}) {
      return port.list(filter);
    },

    async getExercise(id: string, options?: ExerciseAccessOptions) {
      return port.getById(id, options);
    },

    async listExerciseTitlesByIds(ids: readonly string[], options?: ExerciseAccessOptions) {
      return port.listTitlesByIds(ids, options);
    },

    async createExercise(
      input: CreateExerciseInput,
      createdBy: string | null,
      options?: LfkExerciseWriteOptions,
    ) {
      const title = input.title?.trim() ?? '';
      if (!title) {
        throw new UserFacingError('Название упражнения обязательно');
      }
      return runExerciseWrite(options, () =>
        port.create(
          {
            ...input,
            title,
            description: input.description?.trim() || null,
            contraindications: input.contraindications?.trim() || null,
          },
          createdBy,
        ),
      );
    },

    async updateExercise(
      id: string,
      input: UpdateExerciseInput,
      options?: LfkExerciseWriteOptions,
    ) {
      const existing = await port.getById(id);
      if (!existing) throw new UserFacingError('Упражнение не найдено');
      if (existing.isArchived) {
        throw new UserFacingError('Упражнение в архиве. Верните из архива, чтобы редактировать.');
      }
      const patch: UpdateExerciseInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError('Название упражнения обязательно');
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() || null;
      }
      if (input.contraindications !== undefined) {
        patch.contraindications = input.contraindications?.trim() || null;
      }
      const row = await runExerciseWrite(options, () => port.update(id, patch));
      if (!row) throw new UserFacingError('Упражнение не найдено');
      return row;
    },

    async getExerciseUsage(id: string) {
      return port.getExerciseUsageSummary(id);
    },

    async archiveExercise(
      id: string,
      options?: ArchiveExerciseOptions,
      writeOptions?: LfkExerciseWriteOptions,
    ) {
      const existing = await port.getById(id);
      if (!existing) throw new ExerciseArchiveNotFoundError();
      if (existing.isArchived) throw new ExerciseArchiveAlreadyArchivedError();

      const usage = await port.getExerciseUsageSummary(id);
      if (exerciseArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new UsageConfirmationRequiredError(usage);
      }

      const ok = await runExerciseWrite(writeOptions, () => port.archive(id));
      if (!ok) throw new ExerciseArchiveNotFoundError();
    },

    async unarchiveExercise(id: string, options?: LfkExerciseWriteOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new ExerciseArchiveNotFoundError();
      if (!existing.isArchived) throw new ExerciseUnarchiveNotArchivedError();

      const ok = await runExerciseWrite(options, () => port.unarchive(id));
      if (!ok) throw new ExerciseArchiveNotFoundError();
    },
  };
}

export type LfkExercisesService = ReturnType<typeof createLfkExercisesService>;
