import {
  LfkTemplateUsageConfirmationRequiredError,
  TemplateArchiveAlreadyArchivedError,
  TemplateArchiveNotFoundError,
  TemplateUnarchiveNotArchivedError,
} from "./errors";
import type { LfkTemplatesPort } from "./ports";
import type {
  ArchiveTemplateOptions,
  CreateTemplateInput,
  TemplateExerciseInput,
  TemplateFilter,
  UpdateTemplateInput,
} from "./types";
import { lfkTemplateArchiveRequiresAcknowledgement } from "./types";

export function createLfkTemplatesService(port: LfkTemplatesPort) {
  return {
    async listTemplates(filter: TemplateFilter = {}) {
      return port.list(filter);
    },

    async getTemplate(id: string) {
      return port.getById(id);
    },

    async createTemplate(input: CreateTemplateInput, createdBy: string | null) {
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название шаблона обязательно");
      return port.create({ ...input, title, description: input.description?.trim() || null }, createdBy);
    },

    async updateTemplate(id: string, input: UpdateTemplateInput) {
      const existing = await port.getById(id);
      if (!existing) throw new Error("Шаблон не найден");
      if (existing.status === "archived") {
        throw new Error("Комплекс в архиве. Верните из архива, чтобы редактировать.");
      }
      const patch: UpdateTemplateInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название шаблона обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() || null;
      }
      const row = await port.update(id, patch);
      if (!row) throw new Error("Шаблон не найден");
      return row;
    },

    async updateExercises(templateId: string, exercises: TemplateExerciseInput[]) {
      const t = await port.getById(templateId);
      if (!t) throw new Error("Шаблон не найден");
      if (t.status === "archived") {
        throw new Error("Комплекс в архиве. Верните из архива, чтобы редактировать.");
      }
      if (t.status === "published" && exercises.length === 0) {
        throw new Error("Нельзя удалить все упражнения из опубликованного шаблона");
      }
      const normalized = exercises.map((e, idx) => ({
        ...e,
        sortOrder: e.sortOrder ?? idx,
      }));
      await port.updateExercises(templateId, normalized);
    },

    async publishTemplate(id: string) {
      const t = await port.getById(id);
      if (!t) throw new Error("Шаблон не найден");
      if (t.status !== "draft") {
        throw new Error("Опубликовать можно только черновик");
      }
      const titleOk = t.title.trim().length > 0;
      if (!titleOk) throw new Error("Нужно название шаблона");
      if (t.exercises.length < 1) {
        throw new Error("Добавьте хотя бы одно упражнение");
      }
      const next = await port.setStatus(id, "published");
      if (!next) throw new Error("Шаблон не найден");
      return next;
    },

    async getTemplateUsage(id: string) {
      return port.getTemplateUsageSummary(id);
    },

    async archiveTemplate(id: string, options?: ArchiveTemplateOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new TemplateArchiveNotFoundError();
      if (existing.status === "archived") throw new TemplateArchiveAlreadyArchivedError();

      const usage = await port.getTemplateUsageSummary(id);
      if (lfkTemplateArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new LfkTemplateUsageConfirmationRequiredError(usage);
      }

      const next = await port.setStatus(id, "archived");
      if (!next) throw new TemplateArchiveNotFoundError();
      return next;
    },

    async unarchiveTemplate(id: string) {
      const existing = await port.getById(id);
      if (!existing) throw new TemplateArchiveNotFoundError();
      if (existing.status !== "archived") throw new TemplateUnarchiveNotArchivedError();

      const next = await port.setStatus(id, "draft");
      if (!next) throw new TemplateArchiveNotFoundError();
      return next;
    },
  };
}

export type LfkTemplatesService = ReturnType<typeof createLfkTemplatesService>;
