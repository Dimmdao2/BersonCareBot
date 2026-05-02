import type { LfkExercisesPort } from "@/modules/lfk-exercises/ports";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import type {
  CreateExerciseInput,
  Exercise,
  ExerciseFilter,
  ExerciseMedia,
  ExerciseUsageSnapshot,
  UpdateExerciseInput,
} from "@/modules/lfk-exercises/types";
import { EMPTY_EXERCISE_USAGE_SNAPSHOT } from "@/modules/lfk-exercises/types";

const exercises = new Map<string, Exercise>();
const usageByExerciseId = new Map<string, ExerciseUsageSnapshot>();

/** Только для тестов: задать usage snapshot для упражнения (in-memory port). */
export function seedInMemoryExerciseUsageSnapshot(id: string, snapshot: ExerciseUsageSnapshot): void {
  usageByExerciseId.set(id, snapshot);
}

/** Только для тестов: очистить хранилище. */
export function resetInMemoryLfkExercisesStore(): void {
  exercises.clear();
  usageByExerciseId.clear();
}

function exerciseListArchiveScope(f: ExerciseFilter): RecommendationListFilterScope {
  if (f.archiveListScope) return f.archiveListScope;
  if (f.includeArchived === true) return "all";
  return "active";
}

function matchesFilter(ex: Exercise, f: ExerciseFilter): boolean {
  const scope = exerciseListArchiveScope(f);
  if (scope === "active" && ex.isArchived) return false;
  if (scope === "archived" && !ex.isArchived) return false;
  if (f.regionRefId && ex.regionRefId !== f.regionRefId) return false;
  if (f.loadType && ex.loadType !== f.loadType) return false;
  if (f.difficultyMin != null && (ex.difficulty1_10 == null || ex.difficulty1_10 < f.difficultyMin)) return false;
  if (f.difficultyMax != null && (ex.difficulty1_10 == null || ex.difficulty1_10 > f.difficultyMax)) return false;
  if (f.tags?.length) {
    const tags = ex.tags ?? [];
    if (!f.tags.every((t) => tags.includes(t))) return false;
  }
  if (f.search?.trim()) {
    const hay = normalizeRuSearchString(ex.title);
    const needle = normalizeRuSearchString(f.search.trim());
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export const inMemoryLfkExercisesPort: LfkExercisesPort = {
  async list(filter: ExerciseFilter): Promise<Exercise[]> {
    return [...exercises.values()]
      .filter((ex) => matchesFilter(ex, filter))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async getById(id: string): Promise<Exercise | null> {
    return exercises.get(id) ?? null;
  },

  async create(input: CreateExerciseInput, createdBy: string | null): Promise<Exercise> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const media: ExerciseMedia[] = (input.media ?? []).map((m, idx) => ({
      id: crypto.randomUUID(),
      exerciseId: id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      sortOrder: m.sortOrder ?? idx,
      createdAt: now,
    }));
    const ex: Exercise = {
      id,
      title: input.title,
      description: input.description ?? null,
      regionRefId: input.regionRefId ?? null,
      loadType: input.loadType ?? null,
      difficulty1_10: input.difficulty1_10 ?? null,
      contraindications: input.contraindications ?? null,
      tags: input.tags ?? null,
      isArchived: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
      media,
    };
    exercises.set(id, ex);
    return ex;
  },

  async update(id: string, input: UpdateExerciseInput): Promise<Exercise | null> {
    const cur = exercises.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    let media = cur.media;
    if (input.media !== undefined && input.media !== null) {
      media = input.media.map((m, idx) => ({
        id: crypto.randomUUID(),
        exerciseId: id,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        sortOrder: m.sortOrder ?? idx,
        createdAt: now,
      }));
    }
    const next: Exercise = {
      ...cur,
      title: input.title ?? cur.title,
      description: input.description !== undefined ? input.description : cur.description,
      regionRefId: input.regionRefId !== undefined ? input.regionRefId : cur.regionRefId,
      loadType: input.loadType !== undefined ? input.loadType : cur.loadType,
      difficulty1_10: input.difficulty1_10 !== undefined ? input.difficulty1_10 : cur.difficulty1_10,
      contraindications: input.contraindications !== undefined ? input.contraindications : cur.contraindications,
      tags: input.tags !== undefined ? input.tags : cur.tags,
      updatedAt: now,
      media,
    };
    exercises.set(id, next);
    return next;
  },

  async archive(id: string): Promise<boolean> {
    const cur = exercises.get(id);
    if (!cur || cur.isArchived) return false;
    exercises.set(id, { ...cur, isArchived: true, updatedAt: new Date().toISOString() });
    return true;
  },

  async unarchive(id: string): Promise<boolean> {
    const cur = exercises.get(id);
    if (!cur || !cur.isArchived) return false;
    exercises.set(id, { ...cur, isArchived: false, updatedAt: new Date().toISOString() });
    return true;
  },

  async getExerciseUsageSummary(id: string): Promise<ExerciseUsageSnapshot> {
    return usageByExerciseId.get(id) ?? { ...EMPTY_EXERCISE_USAGE_SNAPSHOT };
  },
};
