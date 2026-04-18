import type { RecommendationsPort } from "@/modules/recommendations/ports";
import type {
  Recommendation,
  RecommendationFilter,
  CreateRecommendationInput,
  UpdateRecommendationInput,
  RecommendationMediaItem,
} from "@/modules/recommendations/types";

const store = new Map<string, Recommendation>();

export function resetInMemoryRecommendationsStore(): void {
  store.clear();
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

function matchesFilter(r: Recommendation, f: RecommendationFilter): boolean {
  if (!f.includeArchived && r.isArchived) return false;
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    if (
      !r.title.toLowerCase().includes(q) &&
      !r.bodyMd.toLowerCase().includes(q)
    ) {
      return false;
    }
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
    const row: Recommendation = {
      id,
      title: input.title,
      bodyMd: input.bodyMd,
      media: normalizeMedia(input.media ?? []),
      tags: input.tags ?? null,
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
    const next: Recommendation = {
      ...cur,
      title: input.title ?? cur.title,
      bodyMd: input.bodyMd !== undefined ? input.bodyMd : cur.bodyMd,
      tags: input.tags !== undefined ? input.tags : cur.tags,
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
};
