import { and, desc, eq, ne } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { courses as coursesTable } from "../../../db/schema/courses";
import type { CoursesPort } from "@/modules/courses/ports";
import type {
  CourseRecord,
  CourseStatus,
  CreateCourseInput,
  UpdateCourseInput,
} from "@/modules/courses/types";

function mapRow(row: typeof coursesTable.$inferSelect): CourseRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    programTemplateId: row.programTemplateId,
    introLessonPageId: row.introLessonPageId ?? null,
    accessSettings:
      row.accessSettings && typeof row.accessSettings === "object" && !Array.isArray(row.accessSettings)
        ? (row.accessSettings as Record<string, unknown>)
        : {},
    status: row.status as CourseStatus,
    priceMinor: row.priceMinor,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPgCoursesPort(): CoursesPort {
  return {
    async listPublished() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(coursesTable)
        .where(eq(coursesTable.status, "published"))
        .orderBy(desc(coursesTable.updatedAt));
      return rows.map(mapRow);
    },

    async listForDoctor(filter) {
      const db = getDrizzle();
      const conds = [];
      if (filter.status) {
        conds.push(eq(coursesTable.status, filter.status));
      } else if (!filter.includeArchived) {
        conds.push(ne(coursesTable.status, "archived"));
      }
      const rows = await db
        .select()
        .from(coursesTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(coursesTable.updatedAt));
      return rows.map(mapRow);
    },

    async getById(id) {
      const db = getDrizzle();
      const rows = await db.select().from(coursesTable).where(eq(coursesTable.id, id)).limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateCourseInput) {
      const db = getDrizzle();
      const access = input.accessSettings ?? {};
      const rows = await db
        .insert(coursesTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          programTemplateId: input.programTemplateId,
          introLessonPageId: input.introLessonPageId ?? null,
          accessSettings: access,
          status: input.status ?? "draft",
          priceMinor: input.priceMinor ?? 0,
          currency: input.currency ?? "RUB",
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Не удалось создать курс");
      return mapRow(row);
    },

    async update(id, patch: UpdateCourseInput) {
      const db = getDrizzle();
      const sets: Partial<typeof coursesTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.title !== undefined) sets.title = patch.title;
      if (patch.description !== undefined) sets.description = patch.description;
      if (patch.programTemplateId !== undefined) sets.programTemplateId = patch.programTemplateId;
      if (patch.introLessonPageId !== undefined) sets.introLessonPageId = patch.introLessonPageId;
      if (patch.accessSettings !== undefined) sets.accessSettings = patch.accessSettings;
      if (patch.status !== undefined) sets.status = patch.status;
      if (patch.priceMinor !== undefined) sets.priceMinor = patch.priceMinor;
      if (patch.currency !== undefined) sets.currency = patch.currency;

      const rows = await db
        .update(coursesTable)
        .set(sets)
        .where(eq(coursesTable.id, id))
        .returning();
      return rows[0] ? mapRow(rows[0]) : null;
    },
  };
}
