import type { RecommendationsPort } from "@/modules/recommendations/ports";
import type {
  Recommendation,
  RecommendationArchiveScope,
  RecommendationFilter,
  CreateRecommendationInput,
  UpdateRecommendationInput,
  RecommendationMediaItem,
  RecommendationUsageSnapshot,
} from "@/modules/recommendations/types";
import { EMPTY_RECOMMENDATION_USAGE_SNAPSHOT } from "@/modules/recommendations/types";
import { mergeCatalogBodyRegionIds } from "@/shared/lib/mergeCatalogBodyRegionIds";

const store = new Map<string, Recommendation>();
const usageByRecommendationId = new Map<string, RecommendationUsageSnapshot>();

export function seedInMemoryRecommendationUsageSnapshot(
  recommendationId: string,
  snapshot: RecommendationUsageSnapshot,
): void {
  usageByRecommendationId.set(recommendationId, snapshot);
}

export function resetInMemoryRecommendationsStore(): void {
  store.clear();
  usageByRecommendationId.clear();
}

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

function archiveScopeFromFilter(f: RecommendationFilter): RecommendationArchiveScope {
  if (f.archiveScope) return f.archiveScope;
  if (f.includeArchived) return "all";
  return "active";
}

function matchesFilter(r: Recommendation, f: RecommendationFilter): boolean {
  const scope = archiveScopeFromFilter(f);
  if (scope === "active" && r.isArchived) return false;
  if (scope === "archived" && !r.isArchived) return false;
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    if (
      !r.title.toLowerCase().includes(q) &&
      !r.bodyMd.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  if (f.domain) {
    if (r.domain !== f.domain) return false;
  }
  const regionId = f.regionRefId?.trim();
  if (regionId) {
    if (!r.bodyRegionIds.includes(regionId)) return false;
  }
  return true;
}

export const inMemoryRecommendationsPort: RecommendationsPort = {
  async list(filter: RecommendationFilter): Promise<Recommendation[]> {
    return [...store.values()]
      .filter((r) => matchesFilter(r, filter))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async getById(id: string): Promise<Recommendation | null> {
    return store.get(id) ?? null;
  },

  async create(input: CreateRecommendationInput, createdBy: string | null): Promise<Recommendation> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const merged = mergeCatalogBodyRegionIds(input.bodyRegionId, input.bodyRegionIds ?? null);
    const row: Recommendation = {
      id,
      title: input.title,
      bodyMd: input.bodyMd,
      media: normalizeMedia(input.media ?? []),
      tags: input.tags ?? null,
      domain: input.domain ?? null,
      bodyRegionId: merged[0] ?? null,
      bodyRegionIds: merged,
      quantityText: input.quantityText ?? null,
      frequencyText: input.frequencyText ?? null,
      durationText: input.durationText ?? null,
      isArchived: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    store.set(id, row);
    return row;
  },

  async update(id: string, input: UpdateRecommendationInput): Promise<Recommendation | null> {
    const cur = store.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const regionMerged =
      input.bodyRegionIds !== undefined || input.bodyRegionId !== undefined
        ? input.bodyRegionIds !== undefined
          ? mergeCatalogBodyRegionIds(null, input.bodyRegionIds)
          : mergeCatalogBodyRegionIds(input.bodyRegionId, [])
        : null;
    const next: Recommendation = {
      ...cur,
      title: input.title ?? cur.title,
      bodyMd: input.bodyMd !== undefined ? input.bodyMd : cur.bodyMd,
      tags: input.tags !== undefined ? input.tags : cur.tags,
      domain: input.domain !== undefined ? (input.domain ?? null) : cur.domain,
      ...(regionMerged !== null
        ? { bodyRegionId: regionMerged[0] ?? null, bodyRegionIds: regionMerged }
        : {}),
      quantityText: input.quantityText !== undefined ? (input.quantityText ?? null) : cur.quantityText,
      frequencyText: input.frequencyText !== undefined ? (input.frequencyText ?? null) : cur.frequencyText,
      durationText: input.durationText !== undefined ? (input.durationText ?? null) : cur.durationText,
      media: input.media !== undefined ? normalizeMedia(input.media) : cur.media,
      updatedAt: now,
    };
    store.set(id, next);
    return next;
  },

  async archive(id: string): Promise<boolean> {
    const cur = store.get(id);
    if (!cur || cur.isArchived) return false;
    store.set(id, { ...cur, isArchived: true, updatedAt: new Date().toISOString() });
    return true;
  },

  async unarchive(id: string): Promise<boolean> {
    const cur = store.get(id);
    if (!cur || !cur.isArchived) return false;
    store.set(id, { ...cur, isArchived: false, updatedAt: new Date().toISOString() });
    return true;
  },

  async getRecommendationUsageSummary(id: string): Promise<RecommendationUsageSnapshot> {
    return usageByRecommendationId.get(id) ?? { ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT };
  },
};
