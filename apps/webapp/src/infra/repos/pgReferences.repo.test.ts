import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock, runWebappTransactionMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  runWebappTransactionMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
}));

import { pgReferencesPort } from "./pgReferences";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgReferences (runtime constraints)", () => {
  it("uses runWebappPgText only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgReferences.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
    expect(src).toContain("runWebappTransaction");
  });
});

describe("pgReferencesPort (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({ tx: true }));
  });

  it("listActiveItemsByCategoryCode joins categories by code", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgReferencesPort.listActiveItemsByCategoryCode("symptom_type");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("JOIN reference_categories c");
    expect(sql).toContain("c.code = $1");
    expect(sql).toContain("i.is_active = true");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["symptom_type"]);
  });

  it("saveCatalog runs category lookup and writes via the transaction executor", async () => {
    const tx = { tx: true };
    runWebappTransactionMock.mockImplementationOnce(async (fn: (transaction: unknown) => Promise<void>) => fn(tx));
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "cat-1",
            organization_id: "org-1",
            code: "body_region",
            title: "Регион",
            is_user_extensible: false,
            tenant_id: null,
          },
        ],
      })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await pgReferencesPort.saveCatalog("body_region", {
      updates: [
        {
          id: "item-1",
          code: "neck",
          title: "Шея",
          sortOrder: 1,
          isActive: true,
        },
      ],
      additions: [
        {
          code: "shoulder",
          title: "Плечо",
          sortOrder: 2,
        },
      ],
    });

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const categoryLookupCall = runWebappPgTextMock.mock.calls[0];
    expect(String(categoryLookupCall?.[0] ?? "")).toContain("FROM reference_categories WHERE code = $1");
    expect(categoryLookupCall?.[1]).toEqual(["body_region"]);
    expect(categoryLookupCall?.[2]).toBe(tx);
    const writeCall = runWebappPgTextMock.mock.calls.find(
      (c) => String(c[0]).includes("UPDATE reference_items") && String(c[0]).includes("SET title = $1"),
    );
    expect(writeCall?.[2]).toBe(tx);
    const insertCall = runWebappPgTextMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO reference_items"),
    );
    expect(String(insertCall?.[0] ?? "")).toContain("(organization_id, category_id, code");
    expect(insertCall?.[1]).toEqual(["org-1", "cat-1", "shoulder", "Плечо", 2]);
    expect(insertCall?.[2]).toBe(tx);
    expect(runWebappPgTextMock.mock.calls.every((c) => c[2] === tx)).toBe(true);
  });

  it("saveCatalog rejects duplicate batch codes before opening a transaction", async () => {
    await expect(
      pgReferencesPort.saveCatalog("body_region", {
        updates: [
          {
            id: "item-1",
            code: "neck",
            title: "Шея",
            sortOrder: 1,
            isActive: true,
          },
        ],
        additions: [
          {
            code: "NECK",
            title: "Шея 2",
            sortOrder: 2,
          },
        ],
      }),
    ).rejects.toThrow("duplicate_code");

    expect(runWebappTransactionMock).not.toHaveBeenCalled();
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("insertItemStaff copies category organization_id and writes via the transaction executor", async () => {
    const tx = { tx: true };
    runWebappTransactionMock.mockImplementationOnce(async (fn: (transaction: unknown) => Promise<void>) => fn(tx));
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "cat-1",
            organization_id: "org-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            category_id: "cat-1",
            code: "neck",
            title: "Шея",
            sort_order: 7,
            is_active: true,
            deleted_at: null,
            meta_json: {},
          },
        ],
      });

    const item = await pgReferencesPort.insertItemStaff({
      categoryCode: "body_region",
      code: "neck",
      title: "Шея",
      sortOrder: 7,
    });

    expect(item.id).toBe("item-1");
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const categoryLookupCall = runWebappPgTextMock.mock.calls[0];
    expect(String(categoryLookupCall?.[0] ?? "")).toContain("SELECT id, organization_id");
    expect(categoryLookupCall?.[1]).toEqual(["body_region"]);
    expect(categoryLookupCall?.[2]).toBe(tx);
    const insertCall = runWebappPgTextMock.mock.calls[1];
    expect(String(insertCall?.[0] ?? "")).toContain("(organization_id, category_id, code");
    expect(insertCall?.[1]).toEqual(["org-1", "cat-1", "neck", "Шея", 7, "{}"]);
    expect(insertCall?.[2]).toBe(tx);
  });

  it("updateItem runs the update through the transaction executor", async () => {
    const tx = { tx: true };
    runWebappTransactionMock.mockImplementationOnce(async (fn: (transaction: unknown) => Promise<unknown>) => fn(tx));
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "item-1",
          category_id: "cat-1",
          code: "neck",
          title: "Шея",
          sort_order: 3,
          is_active: false,
          deleted_at: null,
          meta_json: {},
        },
      ],
    });

    await pgReferencesPort.updateItem("item-1", { title: "Шея", sortOrder: 3, isActive: false });

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const updateCall = runWebappPgTextMock.mock.calls[0];
    expect(String(updateCall?.[0] ?? "")).toContain("UPDATE reference_items");
    expect(updateCall?.[1]).toEqual(["Шея", 3, false, "item-1"]);
    expect(updateCall?.[2]).toBe(tx);
  });

  it("softDeleteItem runs the update through the transaction executor", async () => {
    const tx = { tx: true };
    runWebappTransactionMock.mockImplementationOnce(async (fn: (transaction: unknown) => Promise<void>) => fn(tx));
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await pgReferencesPort.softDeleteItem("item-1");

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const updateCall = runWebappPgTextMock.mock.calls[0];
    expect(String(updateCall?.[0] ?? "")).toContain("UPDATE reference_items SET deleted_at = now()");
    expect(updateCall?.[1]).toEqual(["item-1"]);
    expect(updateCall?.[2]).toBe(tx);
  });

  it("archiveItem runs the update through the transaction executor", async () => {
    const tx = { tx: true };
    runWebappTransactionMock.mockImplementationOnce(async (fn: (transaction: unknown) => Promise<void>) => fn(tx));
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await pgReferencesPort.archiveItem("item-1");

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const updateCall = runWebappPgTextMock.mock.calls[0];
    expect(String(updateCall?.[0] ?? "")).toContain("UPDATE reference_items SET is_active = false");
    expect(updateCall?.[1]).toEqual(["item-1"]);
    expect(updateCall?.[2]).toBe(tx);
  });
});
