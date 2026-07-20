import type {
  CreateTemplateInput,
  LfkTemplateUsageSnapshot,
  Template,
  TemplateAccessOptions,
  TemplateExerciseInput,
  TemplateFilter,
  UpdateTemplateInput,
} from "./types";

export type LfkTemplatesPort = {
  list(filter: TemplateFilter): Promise<Template[]>;
  getById(id: string, options?: TemplateAccessOptions): Promise<Template | null>;
  create(input: CreateTemplateInput, createdBy: string | null): Promise<Template>;
  update(id: string, input: UpdateTemplateInput): Promise<Template | null>;
  updateExercises(
    templateId: string,
    exercises: TemplateExerciseInput[],
    options?: TemplateAccessOptions,
  ): Promise<void>;
  setStatus(id: string, status: Template["status"]): Promise<Template | null>;
  getTemplateUsageSummary(templateId: string): Promise<LfkTemplateUsageSnapshot>;
};
