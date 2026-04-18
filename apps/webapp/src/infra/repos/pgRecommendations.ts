import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { recommendations as recommendationsTable } from "../../../db/schema/recommendations";
import type { RecommendationsPort } from "@/modules/recommendations/ports";
import type {
  Recommendation,
  RecommendationFilter,
  CreateRecommendationInput,
  UpdateRecommendationInput,
  RecommendationMediaItem,
} from "@/modules/recommendations/types";

function normalizeMedia(raw: unknown): RecommendationMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecommendationMediaItem[] = [];
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

function mapRow(row: typeof recommendationsTable.$inferSelect): Recommendation {
  return {
    id: row.id,
    title: row.title,
    bodyMd: row.bodyMd,
    media: normalizeMedia(row.media),
    tags: row.tags ?? null,
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPgRecommendationsPort(): RecommendationsPort {
  return {
    async list(filter: RecommendationFilter): Promise<Recommendation[]> {
      const db = getDrizzle();
      const conds = [];
      if (!filter.includeArchived) {
        conds.push(eq(recommendationsTable.isArchived, false));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(or(ilike(recommendationsTable.title, p), ilike(recommendationsTable.bodyMd, p)));
      }
      const rows = await db
        .select()
        .from(recommendationsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(recommendationsTable.updatedAt));
      return rows.map(mapRow);
    },

    async getById(id: string): Promise<Recommendation | null> {
      const db = getDrizzle();
      const rows = await db.select().from(recommendationsTable).where(eq(recommendationsTable.id, id)).limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateRecommendationInput, createdBy: string | null): Promise<Recommendation> {
      const db = getDrizzle();
      const rows = await db
        .insert(recommendationsTable)
        .values({
          title: input.title,
          bodyMd: input.bodyMd,
          media: normalizeMedia(input.media ?? []),
          tags: input.tags ?? null,
          createdBy,
        })
        .returning();
      return mapRow(rows[0]);
    },

    async update(id: string, input: UpdateRecommendationInput): Promise<Recommendation | null> {
      const db = getDrizzle();
      const patch: Partial<typeof recommendationsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.bodyMd !== undefined) patch.bodyMd = input.bodyMd;
      if (input.tags !== undefined) patch.tags = input.tags ?? null;
      if (input.media !== undefined) patch.media = normalizeMedia(input.media ?? []);

      const rows = await db
        .update(recommendationsTable)
        .set(patch)
        .where(eq(recommendationsTable.id, id))
        .returning();
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async archive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(recommendationsTable)
        .set({ isArchived: true, updatedAt: new Date().toISOString() })
        .where(and(eq(recommendationsTable.id, id), eq(recommendationsTable.isArchived, false)))
        .returning({ id: recommendationsTable.id });
      return rows.length > 0;
    },
  };
}

export const pgRecommendationsPort = createPgRecommendationsPort();
