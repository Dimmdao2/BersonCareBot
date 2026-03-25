import type { LfkTemplatesPort } from "@/modules/lfk-templates/ports";
import type {
  CreateTemplateInput,
  Template,
  TemplateExercise,
  TemplateExerciseInput,
  TemplateFilter,
  TemplateStatus,
  UpdateTemplateInput,
} from "@/modules/lfk-templates/types";

const templates = new Map<string, Template>();

export function resetInMemoryLfkTemplatesStore(): void {
  templates.clear();
}

function matchesFilter(t: Template, f: TemplateFilter): boolean {
  if (f.status && t.status !== f.status) return false;
  if (f.search?.trim()) {
    if (!t.title.toLowerCase().includes(f.search.trim().toLowerCase())) return false;
  }
  return true;
}

export const inMemoryLfkTemplatesPort: LfkTemplatesPort = {
  async list(filter: TemplateFilter): Promise<Template[]> {
    return [...templates.values()]
      .filter((t) => matchesFilter(t, filter))
      .map((t) => ({
        ...t,
        exercises: [],
        exerciseCount: t.exercises.length,
      }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async getById(id: string): Promise<Template | null> {
    const t = templates.get(id);
    return t ? { ...t, exercises: [...t.exercises].sort((a, b) => a.sortOrder - b.sortOrder) } : null;
  },

  async create(input: CreateTemplateInput, createdBy: string | null): Promise<Template> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const t: Template = {
      id,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
      createdBy,
      createdAt: now,
      updatedAt: now,
      exercises: [],
    };
    templates.set(id, t);
    return { ...t };
  },

  async update(id: string, input: UpdateTemplateInput): Promise<Template | null> {
    const cur = templates.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const next: Template = {
      ...cur,
      title: input.title ?? cur.title,
      description: input.description !== undefined ? input.description : cur.description,
      updatedAt: now,
    };
    templates.set(id, next);
    return this.getById(id);
  },

  async updateExercises(templateId: string, exercises: TemplateExerciseInput[]): Promise<void> {
    const cur = templates.get(templateId);
    if (!cur) return;
    const now = new Date().toISOString();
    const rows: TemplateExercise[] = exercises.map((e, idx) => ({
      id: crypto.randomUUID(),
      templateId,
      exerciseId: e.exerciseId,
      sortOrder: e.sortOrder ?? idx,
      reps: e.reps ?? null,
      sets: e.sets ?? null,
      side: e.side ?? null,
      maxPain0_10: e.maxPain0_10 ?? null,
      comment: e.comment ?? null,
    }));
    templates.set(templateId, { ...cur, exercises: rows, updatedAt: now });
  },

  async setStatus(id: string, status: TemplateStatus): Promise<Template | null> {
    const cur = templates.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    templates.set(id, { ...cur, status, updatedAt: now });
    return this.getById(id);
  },
};
