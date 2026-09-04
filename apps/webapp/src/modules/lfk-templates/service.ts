import {
  LfkTemplateUsageConfirmationRequiredError,
  TemplateArchiveAlreadyArchivedError,
  TemplateArchiveNotFoundError,
  TemplateUnarchiveNotArchivedError,
} from './errors';
import type { LfkTemplatesPort } from './ports';
import type {
  ArchiveTemplateOptions,
  CreateTemplateInput,
  TemplateExerciseInput,
  TemplateAccessOptions,
  TemplateFilter,
  UpdateTemplateInput,
} from './types';
import { lfkTemplateArchiveRequiresAcknowledgement } from './types';
import { UserFacingError } from '@/shared/errors/userFacingError';

export type LfkTemplateWriteOptions = {
  runTemplateWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Trusted server-side entitlement decision for composing an own template with platform exercises. */
  includePlatformBase?: boolean;
};

function runTemplateWrite<T>(
  options: LfkTemplateWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runTemplateWrite ? options.runTemplateWrite(fn) : fn();
}

export function createLfkTemplatesService(port: LfkTemplatesPort) {
  return {
    async listTemplates(filter: TemplateFilter = {}) {
      return port.list(filter);
    },

    async getTemplate(id: string, options?: TemplateAccessOptions) {
      return port.getById(id, options);
    },

    async createTemplate(
      input: CreateTemplateInput,
      createdBy: string | null,
      options?: LfkTemplateWriteOptions,
    ) {
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError('Название шаблона обязательно');
      return runTemplateWrite(options, () =>
        port.create({ ...input, title, description: input.description?.trim() || null }, createdBy),
      );
    },

    async updateTemplate(
      id: string,
      input: UpdateTemplateInput,
      options?: LfkTemplateWriteOptions,
    ) {
      const existing = await port.getById(id);
      if (!existing) throw new UserFacingError('Шаблон не найден');
      if (existing.status === 'archived') {
        throw new UserFacingError('Комплекс в архиве. Верните из архива, чтобы редактировать.');
      }
      const patch: UpdateTemplateInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError('Название шаблона обязательно');
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() || null;
      }
      const row = await runTemplateWrite(options, () => port.update(id, patch));
      if (!row) throw new UserFacingError('Шаблон не найден');
      return row;
    },

    async updateExercises(
      templateId: string,
      exercises: TemplateExerciseInput[],
      options?: LfkTemplateWriteOptions,
    ) {
      const t = await port.getById(templateId);
      if (!t) throw new UserFacingError('Шаблон не найден');
      if (t.status === 'archived') {
        throw new UserFacingError('Комплекс в архиве. Верните из архива, чтобы редактировать.');
      }
      if (t.status === 'published' && exercises.length === 0) {
        throw new UserFacingError('Нельзя удалить все упражнения из опубликованного шаблона');
      }
      const normalized = exercises.map((e, idx) => ({
        ...e,
        sortOrder: e.sortOrder ?? idx,
      }));
      await runTemplateWrite(options, () =>
        port.updateExercises(templateId, normalized, {
          includePlatformBase: options?.includePlatformBase === true,
        }),
      );
    },

    async publishTemplate(id: string, options?: LfkTemplateWriteOptions) {
      const t = await port.getById(id);
      if (!t) throw new UserFacingError('Шаблон не найден');
      if (t.status !== 'draft') {
        throw new UserFacingError('Опубликовать можно только черновик');
      }
      const titleOk = t.title.trim().length > 0;
      if (!titleOk) throw new UserFacingError('Нужно название шаблона');
      if (t.exercises.length < 1) {
        throw new UserFacingError('Добавьте хотя бы одно упражнение');
      }
      const next = await runTemplateWrite(options, () => port.setStatus(id, 'published'));
      if (!next) throw new UserFacingError('Шаблон не найден');
      return next;
    },

    async getTemplateUsage(id: string) {
      return port.getTemplateUsageSummary(id);
    },

    async archiveTemplate(
      id: string,
      options?: ArchiveTemplateOptions,
      writeOptions?: LfkTemplateWriteOptions,
    ) {
      const existing = await port.getById(id);
      if (!existing) throw new TemplateArchiveNotFoundError();
      if (existing.status === 'archived') throw new TemplateArchiveAlreadyArchivedError();

      const usage = await port.getTemplateUsageSummary(id);
      if (lfkTemplateArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new LfkTemplateUsageConfirmationRequiredError(usage);
      }

      const next = await runTemplateWrite(writeOptions, () => port.setStatus(id, 'archived'));
      if (!next) throw new TemplateArchiveNotFoundError();
      return next;
    },

    async unarchiveTemplate(id: string, options?: LfkTemplateWriteOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new TemplateArchiveNotFoundError();
      if (existing.status !== 'archived') throw new TemplateUnarchiveNotArchivedError();

      const next = await runTemplateWrite(options, () => port.setStatus(id, 'draft'));
      if (!next) throw new TemplateArchiveNotFoundError();
      return next;
    },
  };
}

export type LfkTemplatesService = ReturnType<typeof createLfkTemplatesService>;
