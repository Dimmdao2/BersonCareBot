import type { CoursesPort } from "@/modules/courses/ports";
import type {
  CourseRecord,
  CourseStatus,
  CreateCourseInput,
  UpdateCourseInput,
} from "@/modules/courses/types";

function cloneSettings(s: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!s || typeof s !== "object" || Array.isArray(s)) return {};
  return { ...s };
}

export function createInMemoryCoursesPort(seed: CourseRecord[] = []): CoursesPort {
  const store = new Map<string, CourseRecord>(seed.map((r) => [r.id, { ...r, accessSettings: cloneSettings(r.accessSettings) }]));

  return {
    async listPublished() {
      return [...store.values()].filter((r) => r.status === "published").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async listForDoctor(filter) {
      let rows = [...store.values()];
      if (filter.status) {
        rows = rows.filter((r) => r.status === filter.status);
      } else if (!filter.includeArchived) {
        rows = rows.filter((r) => r.status !== "archived");
      }
      return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getById(id) {
      const r = store.get(id);
      return r ? { ...r, accessSettings: cloneSettings(r.accessSettings) } : null;
    },

    async create(input: CreateCourseInput) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const row: CourseRecord = {
        id,
        title: input.title,
        description: input.description ?? null,
        programTemplateId: input.programTemplateId,
        introLessonPageId: input.introLessonPageId ?? null,
        accessSettings: cloneSettings(input.accessSettings),
        status: input.status ?? "draft",
        priceMinor: input.priceMinor ?? 0,
        currency: input.currency ?? "RUB",
        createdAt: now,
        updatedAt: now,
      };
      store.set(id, row);
      return { ...row, accessSettings: cloneSettings(row.accessSettings) };
    },

    async update(id, patch: UpdateCourseInput) {
      const cur = store.get(id);
      if (!cur) return null;
      const next: CourseRecord = {
        ...cur,
        title: patch.title ?? cur.title,
        description: patch.description !== undefined ? patch.description : cur.description,
        programTemplateId: patch.programTemplateId ?? cur.programTemplateId,
        introLessonPageId:
          patch.introLessonPageId !== undefined ? patch.introLessonPageId : cur.introLessonPageId,
        accessSettings:
          patch.accessSettings !== undefined ? cloneSettings(patch.accessSettings) : cloneSettings(cur.accessSettings),
        status: (patch.status ?? cur.status) as CourseStatus,
        priceMinor: patch.priceMinor ?? cur.priceMinor,
        currency: patch.currency ?? cur.currency,
        updatedAt: new Date().toISOString(),
      };
      store.set(id, next);
      return { ...next, accessSettings: cloneSettings(next.accessSettings) };
    },
  };
}
