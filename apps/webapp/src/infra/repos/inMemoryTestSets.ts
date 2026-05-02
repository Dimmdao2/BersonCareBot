import type { TestSetsPort } from "@/modules/tests/ports";
import type {
  TestSet,
  TestSetArchiveScope,
  TestSetFilter,
  TestSetUsageSnapshot,
  CreateTestSetInput,
  UpdateTestSetInput,
  TestSetItemInput,
  TestSetItemWithTest,
} from "@/modules/tests/types";
import { EMPTY_TEST_SET_USAGE_SNAPSHOT } from "@/modules/tests/types";
import { inMemoryClinicalTestsPort } from "./inMemoryClinicalTests";

type RawItem = { id: string; testSetId: string; testId: string; sortOrder: number };

const setsMeta = new Map<string, Omit<TestSet, "items">>();
const itemsBySet = new Map<string, RawItem[]>();
const usageBySetId = new Map<string, TestSetUsageSnapshot>();

export function seedInMemoryTestSetUsageSnapshot(setId: string, snapshot: TestSetUsageSnapshot): void {
  usageBySetId.set(setId, snapshot);
}

export function resetInMemoryTestSetsStore(): void {
  setsMeta.clear();
  itemsBySet.clear();
  usageBySetId.clear();
}

function archiveScopeFromFilter(f: TestSetFilter): TestSetArchiveScope {
  if (f.archiveScope) return f.archiveScope;
  if (f.includeArchived) return "all";
  return "active";
}

function matchesFilter(meta: Omit<TestSet, "items">, f: TestSetFilter): boolean {
  const scope = archiveScopeFromFilter(f);
  if (scope === "active" && meta.isArchived) return false;
  if (scope === "archived" && !meta.isArchived) return false;
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    if (
      !meta.title.toLowerCase().includes(q) &&
      !(meta.description ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}

async function buildTestSet(id: string): Promise<TestSet | null> {
  const meta = setsMeta.get(id);
  if (!meta) return null;
  const rawItems = [...(itemsBySet.get(id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const items: TestSetItemWithTest[] = [];
  for (const ri of rawItems) {
    const test = await inMemoryClinicalTestsPort.getById(ri.testId);
    if (!test) continue;
    items.push({
      id: ri.id,
      testSetId: ri.testSetId,
      testId: ri.testId,
      sortOrder: ri.sortOrder,
      test: {
        id: test.id,
        title: test.title,
        testType: test.testType,
        isArchived: test.isArchived,
      },
    });
  }
  return { ...meta, items };
}

export const inMemoryTestSetsPort: TestSetsPort = {
  async list(filter: TestSetFilter): Promise<TestSet[]> {
    const out: TestSet[] = [];
    for (const id of setsMeta.keys()) {
      const meta = setsMeta.get(id)!;
      if (!matchesFilter(meta, filter)) continue;
      const full = await buildTestSet(id);
      if (full) out.push(full);
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async getById(id: string): Promise<TestSet | null> {
    return buildTestSet(id);
  },

  async create(input: CreateTestSetInput, createdBy: string | null): Promise<TestSet> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta: Omit<TestSet, "items"> = {
      id,
      title: input.title,
      description: input.description ?? null,
      isArchived: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    setsMeta.set(id, meta);
    itemsBySet.set(id, []);
    const built = await buildTestSet(id);
    return built!;
  },

  async update(id: string, input: UpdateTestSetInput): Promise<TestSet | null> {
    const cur = setsMeta.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    setsMeta.set(id, {
      ...cur,
      title: input.title ?? cur.title,
      description: input.description !== undefined ? input.description : cur.description,
      updatedAt: now,
    });
    return buildTestSet(id);
  },

  async archive(id: string): Promise<boolean> {
    const cur = setsMeta.get(id);
    if (!cur || cur.isArchived) return false;
    setsMeta.set(id, { ...cur, isArchived: true, updatedAt: new Date().toISOString() });
    return true;
  },

  async replaceItems(testSetId: string, items: TestSetItemInput[]): Promise<void> {
    const cur = setsMeta.get(testSetId);
    if (!cur) throw new Error("test set not found");
    const now = new Date().toISOString();
    const raw: RawItem[] = items.map((it, idx) => ({
      id: crypto.randomUUID(),
      testSetId,
      testId: it.testId,
      sortOrder: it.sortOrder ?? idx,
    }));
    itemsBySet.set(testSetId, raw);
    setsMeta.set(testSetId, { ...cur, updatedAt: now });
  },

  async getTestSetUsageSummary(id: string): Promise<TestSetUsageSnapshot> {
    return usageBySetId.get(id) ?? { ...EMPTY_TEST_SET_USAGE_SNAPSHOT };
  },
};
