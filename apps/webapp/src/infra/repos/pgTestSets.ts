import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  clinicalTests as clinicalTestsTable,
  testSets as testSetsTable,
  testSetItems as testSetItemsTable,
} from "../../../db/schema/clinicalTests";
import type { TestSetsPort } from "@/modules/tests/ports";
import type {
  TestSet,
  TestSetFilter,
  CreateTestSetInput,
  UpdateTestSetInput,
  TestSetItemInput,
  TestSetItemWithTest,
} from "@/modules/tests/types";

function mapMeta(row: typeof testSetsTable.$inferSelect): Omit<TestSet, "items"> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTestRow(
  row: typeof clinicalTestsTable.$inferSelect,
): TestSetItemWithTest["test"] {
  return {
    id: row.id,
    title: row.title,
    testType: row.testType,
    isArchived: row.isArchived,
  };
}

async function loadItemsForSet(testSetId: string): Promise<TestSetItemWithTest[]> {
  const db = getDrizzle();
  const rows = await db
    .select({
      item: testSetItemsTable,
      test: clinicalTestsTable,
    })
    .from(testSetItemsTable)
    .innerJoin(clinicalTestsTable, eq(testSetItemsTable.testId, clinicalTestsTable.id))
    .where(eq(testSetItemsTable.testSetId, testSetId))
    .orderBy(asc(testSetItemsTable.sortOrder), asc(testSetItemsTable.id));

  return rows.map((r) => ({
    id: r.item.id,
    testSetId: r.item.testSetId,
    testId: r.item.testId,
    sortOrder: r.item.sortOrder,
    test: mapTestRow(r.test),
  }));
}

export function createPgTestSetsPort(): TestSetsPort {
  return {
    async list(filter: TestSetFilter): Promise<TestSet[]> {
      const db = getDrizzle();
      const conds = [];
      const scope =
        filter.archiveScope ?? (filter.includeArchived ? "all" : "active");
      if (scope === "active") {
        conds.push(eq(testSetsTable.isArchived, false));
      } else if (scope === "archived") {
        conds.push(eq(testSetsTable.isArchived, true));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(or(ilike(testSetsTable.title, p), ilike(testSetsTable.description, p)));
      }

      const sets = await db
        .select()
        .from(testSetsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(testSetsTable.updatedAt));

      const out: TestSet[] = [];
      for (const s of sets) {
        const items = await loadItemsForSet(s.id);
        out.push({ ...mapMeta(s), items });
      }
      return out;
    },

    async getById(id: string): Promise<TestSet | null> {
      const db = getDrizzle();
      const rows = await db.select().from(testSetsTable).where(eq(testSetsTable.id, id)).limit(1);
      if (!rows[0]) return null;
      const items = await loadItemsForSet(id);
      return { ...mapMeta(rows[0]), items };
    },

    async create(input: CreateTestSetInput, createdBy: string | null): Promise<TestSet> {
      const db = getDrizzle();
      const rows = await db
        .insert(testSetsTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          createdBy,
        })
        .returning();
      return { ...mapMeta(rows[0]), items: [] };
    },

    async update(id: string, input: UpdateTestSetInput): Promise<TestSet | null> {
      const db = getDrizzle();
      const patch: Partial<typeof testSetsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;

      const rows = await db
        .update(testSetsTable)
        .set(patch)
        .where(eq(testSetsTable.id, id))
        .returning();
      if (!rows[0]) return null;
      const items = await loadItemsForSet(id);
      return { ...mapMeta(rows[0]), items };
    },

    async archive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(testSetsTable)
        .set({ isArchived: true, updatedAt: new Date().toISOString() })
        .where(and(eq(testSetsTable.id, id), eq(testSetsTable.isArchived, false)))
        .returning({ id: testSetsTable.id });
      return rows.length > 0;
    },

    async replaceItems(testSetId: string, items: TestSetItemInput[]): Promise<void> {
      const db = getDrizzle();
      await db.transaction(async (tx) => {
        await tx.delete(testSetItemsTable).where(eq(testSetItemsTable.testSetId, testSetId));
        if (items.length > 0) {
          await tx.insert(testSetItemsTable).values(
            items.map((it, idx) => ({
              testSetId,
              testId: it.testId,
              sortOrder: it.sortOrder ?? idx,
            })),
          );
        }
        await tx
          .update(testSetsTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(testSetsTable.id, testSetId));
      });
    },
  };
}

export const pgTestSetsPort = createPgTestSetsPort();
