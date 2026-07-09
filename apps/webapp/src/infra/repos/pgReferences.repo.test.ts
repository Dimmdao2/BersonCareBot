import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock, runWebappTransactionMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  runWebappTransactionMock: vi.fn(),
}));
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
}));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
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
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue("org-1");
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({}));
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

  it("saveCatalog runs transactional updates via runWebappTransaction", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "cat-1",
            code: "body_region",
            title: "Регион",
            is_user_extensible: false,
            organization_id: "org-1",
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
      additions: [],
    });

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "")).toContain("set_config('app.org'");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["org-1"]);
    expect(
      runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("UPDATE reference_items") && String(c[0]).includes("SET title = $1")),
    ).toBe(true);
  });

  it("write methods require DB organization principal", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(
      pgReferencesPort.insertItemStaff({
        categoryCode: "body_region",
        code: "neck",
        title: "Шея",
      }),
    ).rejects.toThrow("organization_principal_required");
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects writes when category organization mismatches principal", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "cat-1",
            code: "body_region",
            title: "Регион",
            is_user_extensible: false,
            organization_id: "org-2",
            tenant_id: null,
          },
        ],
      });

    await expect(
      pgReferencesPort.insertItemStaff({
        categoryCode: "body_region",
        code: "neck",
        title: "Шея",
      }),
    ).rejects.toThrow("organization_principal_mismatch");
  });
});
