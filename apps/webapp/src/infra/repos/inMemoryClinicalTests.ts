import type { ClinicalTestsPort } from "@/modules/tests/ports";
import type {
  ClinicalTest,
  ClinicalTestFilter,
  CreateClinicalTestInput,
  UpdateClinicalTestInput,
  ClinicalTestMediaItem,
} from "@/modules/tests/types";

const store = new Map<string, ClinicalTest>();

export function resetInMemoryClinicalTestsStore(): void {
  store.clear();
}

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

function matchesFilter(t: ClinicalTest, f: ClinicalTestFilter): boolean {
  if (!f.includeArchived && t.isArchived) return false;
  if (f.testType && f.testType.trim() && t.testType !== f.testType.trim()) return false;
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    if (!t.title.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) {
      return false;
    }
  }
  return true;
}

export const inMemoryClinicalTestsPort: ClinicalTestsPort = {
  async list(filter: ClinicalTestFilter): Promise<ClinicalTest[]> {
    return [...store.values()]
      .filter((t) => matchesFilter(t, filter))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async getById(id: string): Promise<ClinicalTest | null> {
    return store.get(id) ?? null;
  },

  async create(input: CreateClinicalTestInput, createdBy: string | null): Promise<ClinicalTest> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row: ClinicalTest = {
      id,
      title: input.title,
      description: input.description ?? null,
      testType: input.testType ?? null,
      scoringConfig: input.scoringConfig ?? null,
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

  async update(id: string, input: UpdateClinicalTestInput): Promise<ClinicalTest | null> {
    const cur = store.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const next: ClinicalTest = {
      ...cur,
      title: input.title ?? cur.title,
      description: input.description !== undefined ? input.description : cur.description,
      testType: input.testType !== undefined ? input.testType : cur.testType,
      scoringConfig: input.scoringConfig !== undefined ? input.scoringConfig : cur.scoringConfig,
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
