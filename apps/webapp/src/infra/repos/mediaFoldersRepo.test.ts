/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc } from "drizzle-orm";
import { mediaFolders } from "../../../db/schema/schema";

const selectResults = vi.hoisted(() => [] as unknown[][]);
const deleteReturning = vi.hoisted(() => [] as { id: string }[]);
const insertReturning = vi.hoisted(() => [] as unknown[]);
const orderBySpy = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: (...args: unknown[]) => {
            orderBySpy(...args);
            return Promise.resolve(selectResults.shift() ?? []);
          },
          limit: async () => selectResults.shift() ?? [],
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: async () => deleteReturning,
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => insertReturning.shift() ?? [],
      }),
    }),
  }),
}));

import { pgCreateFolder, pgDeleteFolderIfEmpty, pgListFolders } from "./mediaFoldersRepo";

describe("mediaFoldersRepo", () => {
  beforeEach(() => {
    selectResults.length = 0;
    deleteReturning.length = 0;
    insertReturning.length = 0;
    orderBySpy.mockClear();
  });

  it("pgListFolders returns rows ordered by nameNormalized asc", async () => {
    selectResults.push([
      {
        id: "11111111-1111-4111-8111-111111111111",
        parentId: null,
        name: "Alpha",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        parentId: null,
        name: "Beta",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    const rows = await pgListFolders(null);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("Alpha");
    expect(orderBySpy).toHaveBeenCalledWith(asc(mediaFolders.nameNormalized));
  });

  it("pgCreateFolder trims name and returns created row", async () => {
    insertReturning.push([
      {
        id: "44444444-4444-4444-8444-444444444444",
        parentId: null,
        name: "New Folder",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);
    const row = await pgCreateFolder({
      name: "  New Folder  ",
      parentId: null,
      createdBy: "doc-1",
    });
    expect(row.name).toBe("New Folder");
    expect(row.id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("pgDeleteFolderIfEmpty returns not_empty when child folder exists", async () => {
    selectResults.push([{ one: 1 }]);
    const out = await pgDeleteFolderIfEmpty("33333333-3333-4333-8333-333333333333");
    expect(out).toEqual({ ok: false, error: "not_empty" });
  });

  it("pgDeleteFolderIfEmpty returns not_empty when media files exist in folder", async () => {
    selectResults.push([]);
    selectResults.push([{ one: 1 }]);
    const out = await pgDeleteFolderIfEmpty("33333333-3333-4333-8333-333333333333");
    expect(out).toEqual({ ok: false, error: "not_empty" });
  });

  it("pgDeleteFolderIfEmpty deletes empty folder", async () => {
    selectResults.push([]);
    selectResults.push([]);
    deleteReturning.push({ id: "33333333-3333-4333-8333-333333333333" });
    const out = await pgDeleteFolderIfEmpty("33333333-3333-4333-8333-333333333333");
    expect(out).toEqual({ ok: true });
  });
});
