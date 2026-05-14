import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import {
  recommendationRegions,
  recommendations as recommendationsTable,
} from "../../../db/schema/recommendations";
import type { RecommendationsPort } from "@/modules/recommendations/ports";
import type {
  Recommendation,
  RecommendationFilter,
  CreateRecommendationInput,
  UpdateRecommendationInput,
  RecommendationMediaItem,
  RecommendationUsageRef,
  RecommendationUsageSnapshot,
} from "@/modules/recommendations/types";
import {
  EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
  RECOMMENDATION_USAGE_DETAIL_LIMIT,
} from "@/modules/recommendations/types";
import { mergeCatalogBodyRegionIds } from "@/shared/lib/mergeCatalogBodyRegionIds";

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

function mapRow(row: typeof recommendationsTable.$inferSelect, m2mBodyRegionIds: readonly string[] = []): Recommendation {
  const domainRaw = row.domain?.trim() ?? "";
  const domain = domainRaw ? domainRaw : null;
  const merged = mergeCatalogBodyRegionIds(row.bodyRegionId, m2mBodyRegionIds);
  return {
    id: row.id,
    title: row.title,
    bodyMd: row.bodyMd,
    media: normalizeMedia(row.media),
    tags: row.tags ?? null,
    domain,
    bodyRegionId: merged[0] ?? null,
    bodyRegionIds: merged,
    quantityText: row.quantityText?.trim() ? row.quantityText.trim() : null,
    frequencyText: row.frequencyText?.trim() ? row.frequencyText.trim() : null,
    durationText: row.durationText?.trim() ? row.durationText.trim() : null,
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseRecommendationUsageRefs(raw: unknown): RecommendationUsageRef[] {
  if (raw == null) return [];
  let arr: unknown[];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } else return [];

  const out: RecommendationUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    const patientUserId = o.patientUserId;
    if (kind === "treatment_program_template") {
      if (typeof id !== "string" || typeof title !== "string") continue;
      out.push({ kind, id, title });
      continue;
    }
    if (kind === "treatment_program_instance") {
      if (typeof id !== "string" || typeof title !== "string" || typeof patientUserId !== "string") continue;
      out.push({ kind, id, title, patientUserId });
    }
  }
  return out;
}

async function loadRecommendationUsageSummary(
  pool: ReturnType<typeof getPool>,
  recommendationId: string,
): Promise<RecommendationUsageSnapshot> {
  const lim = RECOMMENDATION_USAGE_DETAIL_LIMIT;
  const r = await pool.query<{
    published_tp_templates: string | number | null;
    draft_tp_templates: string | number | null;
    archived_tp_templates: string | number | null;
    active_tp_instances: string | number | null;
    completed_tp_instances: string | number | null;
    published_tp_template_refs: unknown;
    draft_tp_template_refs: unknown;
    archived_tp_template_refs: unknown;
    active_tp_instance_refs: unknown;
    completed_tp_instance_refs: unknown;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'recommendation' AND si.item_ref_id = $1::uuid AND t.status = 'published') AS published_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'recommendation' AND si.item_ref_id = $1::uuid AND t.status = 'draft') AS draft_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'recommendation' AND si.item_ref_id = $1::uuid AND t.status = 'archived') AS archived_tp_templates,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'recommendation' AND sii.item_ref_id = $1::uuid AND i.status = 'active') AS active_tp_instances,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'recommendation' AND sii.item_ref_id = $1::uuid AND i.status = 'completed') AS completed_tp_instances,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (t.id)
              jsonb_build_object(
                'kind', 'treatment_program_template',
                'id', t.id::text,
                'title', t.title
              ) AS obj
            FROM treatment_program_template_stage_items si
            INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
            INNER JOIN treatment_program_templates t ON t.id = st.template_id
            WHERE si.item_type = 'recommendation' AND si.item_ref_id = $1::uuid AND t.status = 'published'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS published_tp_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (t.id)
              jsonb_build_object(
                'kind', 'treatment_program_template',
                'id', t.id::text,
                'title', t.title
              ) AS obj
            FROM treatment_program_template_stage_items si
            INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
            INNER JOIN treatment_program_templates t ON t.id = st.template_id
            WHERE si.item_type = 'recommendation' AND si.item_ref_id = $1::uuid AND t.status = 'draft'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS draft_tp_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (t.id)
              jsonb_build_object(
                'kind', 'treatment_program_template',
                'id', t.id::text,
                'title', t.title
              ) AS obj
            FROM treatment_program_template_stage_items si
            INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
            INNER JOIN treatment_program_templates t ON t.id = st.template_id
            WHERE si.item_type = 'recommendation' AND si.item_ref_id = $1::uuid AND t.status = 'archived'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS archived_tp_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (i.id)
              jsonb_build_object(
                'kind', 'treatment_program_instance',
                'id', i.id::text,
                'title', COALESCE(NULLIF(btrim(i.title), ''), tpl.title, 'Программа'),
                'patientUserId', i.patient_user_id::text
              ) AS obj
            FROM treatment_program_instance_stage_items sii
            INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
            INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
            LEFT JOIN treatment_program_templates tpl ON tpl.id = i.template_id
            WHERE sii.item_type = 'recommendation' AND sii.item_ref_id = $1::uuid AND i.status = 'active'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS active_tp_instance_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (i.id)
              jsonb_build_object(
                'kind', 'treatment_program_instance',
                'id', i.id::text,
                'title', COALESCE(NULLIF(btrim(i.title), ''), tpl.title, 'Программа'),
                'patientUserId', i.patient_user_id::text
              ) AS obj
            FROM treatment_program_instance_stage_items sii
            INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
            INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
            LEFT JOIN treatment_program_templates tpl ON tpl.id = i.template_id
            WHERE sii.item_type = 'recommendation' AND sii.item_ref_id = $1::uuid AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_tp_instance_refs`,
    [recommendationId],
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    publishedTreatmentProgramTemplateCount: n(row.published_tp_templates),
    draftTreatmentProgramTemplateCount: n(row.draft_tp_templates),
    archivedTreatmentProgramTemplateCount: n(row.archived_tp_templates),
    activeTreatmentProgramInstanceCount: n(row.active_tp_instances),
    completedTreatmentProgramInstanceCount: n(row.completed_tp_instances),
    publishedTreatmentProgramTemplateRefs: parseRecommendationUsageRefs(row.published_tp_template_refs),
    draftTreatmentProgramTemplateRefs: parseRecommendationUsageRefs(row.draft_tp_template_refs),
    archivedTreatmentProgramTemplateRefs: parseRecommendationUsageRefs(row.archived_tp_template_refs),
    activeTreatmentProgramInstanceRefs: parseRecommendationUsageRefs(row.active_tp_instance_refs),
    completedTreatmentProgramInstanceRefs: parseRecommendationUsageRefs(row.completed_tp_instance_refs),
  };
}

export function createPgRecommendationsPort(): RecommendationsPort {
  return {
    async list(filter: RecommendationFilter): Promise<Recommendation[]> {
      const db = getDrizzle();
      const conds = [];
      const scope =
        filter.archiveScope ?? (filter.includeArchived ? "all" : "active");
      if (scope === "active") {
        conds.push(eq(recommendationsTable.isArchived, false));
      } else if (scope === "archived") {
        conds.push(eq(recommendationsTable.isArchived, true));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(or(ilike(recommendationsTable.title, p), ilike(recommendationsTable.bodyMd, p)));
      }
      const domainFilter = filter.domain;
      if (domainFilter) {
        conds.push(eq(recommendationsTable.domain, domainFilter));
      }
      const regionId = filter.regionRefId?.trim();
      if (regionId) {
        conds.push(
          or(
            eq(recommendationsTable.bodyRegionId, regionId),
            sql`EXISTS (SELECT 1 FROM recommendation_regions rr WHERE rr.recommendation_id = ${recommendationsTable.id} AND rr.body_region_id = ${regionId}::uuid)`,
          )!,
        );
      }
      const rows = await db
        .select()
        .from(recommendationsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(recommendationsTable.updatedAt));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
      const rrRows = await db
        .select()
        .from(recommendationRegions)
        .where(inArray(recommendationRegions.recommendationId, ids));
      const byRec = new Map<string, string[]>();
      for (const rr of rrRows) {
        const cur = byRec.get(rr.recommendationId) ?? [];
        cur.push(rr.bodyRegionId);
        byRec.set(rr.recommendationId, cur);
      }
      return rows.map((r) => mapRow(r, byRec.get(r.id) ?? []));
    },

    async getById(id: string): Promise<Recommendation | null> {
      const db = getDrizzle();
      const rows = await db.select().from(recommendationsTable).where(eq(recommendationsTable.id, id)).limit(1);
      const r0 = rows[0];
      if (!r0) return null;
      const rrRows = await db
        .select()
        .from(recommendationRegions)
        .where(eq(recommendationRegions.recommendationId, id));
      return mapRow(
        r0,
        rrRows.map((x) => x.bodyRegionId),
      );
    },

    async create(input: CreateRecommendationInput, createdBy: string | null): Promise<Recommendation> {
      const db = getDrizzle();
      const merged = mergeCatalogBodyRegionIds(input.bodyRegionId, input.bodyRegionIds ?? null);
      return await db.transaction(async (tx) => {
        const rows = await tx
          .insert(recommendationsTable)
          .values({
            title: input.title,
            bodyMd: input.bodyMd,
            media: normalizeMedia(input.media ?? []),
            tags: input.tags ?? null,
            domain: input.domain ?? null,
            bodyRegionId: merged[0] ?? null,
            quantityText: input.quantityText ?? null,
            frequencyText: input.frequencyText ?? null,
            durationText: input.durationText ?? null,
            createdBy,
          })
          .returning();
        const id = rows[0].id;
        if (merged.length > 0) {
          await tx.insert(recommendationRegions).values(
            merged.map((bodyRegionId) => ({ recommendationId: id, bodyRegionId })),
          );
        }
        return mapRow(rows[0], merged);
      });
    },

    async update(id: string, input: UpdateRecommendationInput): Promise<Recommendation | null> {
      const db = getDrizzle();
      const patch: Partial<typeof recommendationsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.bodyMd !== undefined) patch.bodyMd = input.bodyMd;
      if (input.tags !== undefined) patch.tags = input.tags ?? null;
      if (input.domain !== undefined) patch.domain = input.domain ?? null;
      if (input.quantityText !== undefined) patch.quantityText = input.quantityText ?? null;
      if (input.frequencyText !== undefined) patch.frequencyText = input.frequencyText ?? null;
      if (input.durationText !== undefined) patch.durationText = input.durationText ?? null;
      if (input.media !== undefined) patch.media = normalizeMedia(input.media ?? []);

      const regionMerged =
        input.bodyRegionIds !== undefined || input.bodyRegionId !== undefined
          ? input.bodyRegionIds !== undefined
            ? mergeCatalogBodyRegionIds(null, input.bodyRegionIds)
            : mergeCatalogBodyRegionIds(input.bodyRegionId, [])
          : null;
      if (regionMerged !== null) {
        patch.bodyRegionId = regionMerged[0] ?? null;
      }

      return await db.transaction(async (tx) => {
        const rows = await tx
          .update(recommendationsTable)
          .set(patch)
          .where(eq(recommendationsTable.id, id))
          .returning();
        if (!rows[0]) return null;
        if (regionMerged !== null) {
          await tx.delete(recommendationRegions).where(eq(recommendationRegions.recommendationId, id));
          if (regionMerged.length > 0) {
            await tx.insert(recommendationRegions).values(
              regionMerged.map((bodyRegionId) => ({ recommendationId: id, bodyRegionId })),
            );
          }
        }
        const rrRows = await tx
          .select()
          .from(recommendationRegions)
          .where(eq(recommendationRegions.recommendationId, id));
        return mapRow(
          rows[0],
          rrRows.map((x) => x.bodyRegionId),
        );
      });
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

    async unarchive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(recommendationsTable)
        .set({ isArchived: false, updatedAt: new Date().toISOString() })
        .where(and(eq(recommendationsTable.id, id), eq(recommendationsTable.isArchived, true)))
        .returning({ id: recommendationsTable.id });
      return rows.length > 0;
    },

    async getRecommendationUsageSummary(id: string): Promise<RecommendationUsageSnapshot> {
      const pool = getPool();
      return loadRecommendationUsageSummary(pool, id);
    },
  };
}

export const pgRecommendationsPort = createPgRecommendationsPort();
