import { and, eq, desc, ilike, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { clinicalTests as clinicalTestsTable } from "../../../db/schema/clinicalTests";
import type { ClinicalTestsPort } from "@/modules/tests/ports";
import type {
  ClinicalTest,
  ClinicalTestFilter,
  CreateClinicalTestInput,
  UpdateClinicalTestInput,
  ClinicalTestMediaItem,
} from "@/modules/tests/types";

function normalizeMedia(raw: unknown): ClinicalTestMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ClinicalTestMediaItem[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const mediaUrl = (m as { mediaUrl?: unknown }).mediaUrl;
    const mediaType = (m as { mediaType?: unknown }).mediaType;
    const sortOrder = (m as { sortOrder?: unknown }).sortOrder;
    if (typeof mediaUrl !== "string" || !mediaUrl.trim()) continue;
    if (mediaType !== "image" && mediaType !== "video" && mediaType !== "gif") continue;
    out.push({
      mediaUrl: mediaUrl.trim(),
      mediaType,
      sortOrder: typeof sortOrder === "number" ? sortOrder : out.length,
    });
  }
  return out;
}

function mapRow(row: typeof clinicalTestsTable.$inferSelect): ClinicalTest {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    testType: row.testType,
    scoringConfig: row.scoringConfig ?? null,
    media: normalizeMedia(row.media),
    tags: row.tags ?? null,
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPgClinicalTestsPort(): ClinicalTestsPort {
  return {
    async list(filter: ClinicalTestFilter): Promise<ClinicalTest[]> {
      const db = getDrizzle();
      const conds = [];
      if (!filter.includeArchived) {
        conds.push(eq(clinicalTestsTable.isArchived, false));
      }
      if (filter.testType?.trim()) {
        conds.push(eq(clinicalTestsTable.testType, filter.testType.trim()));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(
          or(ilike(clinicalTestsTable.title, p), ilike(clinicalTestsTable.description, p)),
        );
      }
      const rows = await db
        .select()
        .from(clinicalTestsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(clinicalTestsTable.updatedAt));
      return rows.map(mapRow);
    },

    async getById(id: string): Promise<ClinicalTest | null> {
      const db = getDrizzle();
      const rows = await db.select().from(clinicalTestsTable).where(eq(clinicalTestsTable.id, id)).limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateClinicalTestInput, createdBy: string | null): Promise<ClinicalTest> {
      const db = getDrizzle();
      const media = normalizeMedia(input.media ?? []);
      const rows = await db
        .insert(clinicalTestsTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          testType: input.testType ?? null,
          scoringConfig: input.scoringConfig ?? null,
          media,
          tags: input.tags ?? null,
          createdBy,
        })
        .returning();
      return mapRow(rows[0]);
    },

    async update(id: string, input: UpdateClinicalTestInput): Promise<ClinicalTest | null> {
      const db = getDrizzle();
      const patch: Partial<typeof clinicalTestsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.testType !== undefined) patch.testType = input.testType;
      if (input.scoringConfig !== undefined) patch.scoringConfig = input.scoringConfig ?? null;
      if (input.tags !== undefined) patch.tags = input.tags ?? null;
      if (input.media !== undefined) patch.media = normalizeMedia(input.media ?? []);

      const rows = await db
        .update(clinicalTestsTable)
        .set(patch)
        .where(eq(clinicalTestsTable.id, id))
        .returning();
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async archive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(clinicalTestsTable)
        .set({ isArchived: true, updatedAt: new Date().toISOString() })
        .where(and(eq(clinicalTestsTable.id, id), eq(clinicalTestsTable.isArchived, false)))
        .returning({ id: clinicalTestsTable.id });
      return rows.length > 0;
    },
  };
}

/** Singleton-style export for DI (same pattern as other pg* ports). */
export const pgClinicalTestsPort = createPgClinicalTestsPort();
