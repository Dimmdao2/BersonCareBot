import type {
  CreateTemplateInput,
  LfkTemplateUsageSnapshot,
  Template,
  TemplateExerciseInput,
  TemplateFilter,
  UpdateTemplateInput,
} from "./types";

export type LfkTemplatesPort = {
  list(filter: TemplateFilter): Promise<Template[]>;
  getById(id: string): Promise<Template | null>;
  create(input: CreateTemplateInput, createdBy: string | null): Promise<Template>;
  update(id: string, input: UpdateTemplateInput): Promise<Template | null>;
  updateExercises(templateId: string, exercises: TemplateExerciseInput[]): Promise<void>;
  setStatus(id: string, status: Template["status"]): Promise<Template | null>;
  getTemplateUsageSummary(templateId: string): Promise<LfkTemplateUsageSnapshot>;
};
