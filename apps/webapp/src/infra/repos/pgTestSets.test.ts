import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));
const principalOrganizationIdMock = vi.hoisted(() => vi.fn());

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: () => principalOrganizationIdMock(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
          orderBy: vi.fn(async () => []),
        })),
        orderBy: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "x" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "x" }]),
        })),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  })),
}));

import { createPgTestSetsPort } from "./pgTestSets";

describe("createPgTestSetsPort usage summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
    principalOrganizationIdMock.mockReset();
    principalOrganizationIdMock.mockReturnValue(ORG_A);
  });

  it("getTestSetUsageSummary runs aggregate query for clinical_test refs via test_set_items", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          published_tp_templates: 0,
          draft_tp_templates: 0,
          archived_tp_templates: 0,
          active_tp_instances: 0,
          completed_tp_instances: 0,
          test_attempts_recorded: 0,
          published_tp_template_refs: [],
          draft_tp_template_refs: [],
          archived_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
        },
      ],
    });
    const port = createPgTestSetsPort();
    await port.getTestSetUsageSummary("00000000-0000-4000-8000-000000000088");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("tsi.test_set_id = $1::uuid");
    expect(sql).toContain("item_type = 'clinical_test'");
    expect(sql).toContain("test_attempts");
    expect(sql).toContain("organization_id = $2::uuid");
    expect(new Set(queryMock.mock.calls[0]?.[1] as string[])).toEqual(
      new Set(["00000000-0000-4000-8000-000000000088", ORG_A]),
    );
  });

  it("binds the same test-set usage id to the current organization and rejects a missing principal", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const port = createPgTestSetsPort();
    await port.getTestSetUsageSummary("00000000-0000-4000-8000-000000000088");
    principalOrganizationIdMock.mockReturnValue(ORG_B);
    await port.getTestSetUsageSummary("00000000-0000-4000-8000-000000000088");
    expect(queryMock.mock.calls.map((call) => new Set(call[1] as string[]))).toEqual([
      new Set(["00000000-0000-4000-8000-000000000088", ORG_A]),
      new Set(["00000000-0000-4000-8000-000000000088", ORG_B]),
    ]);
    principalOrganizationIdMock.mockReturnValue(null);
    await expect(port.getTestSetUsageSummary("00000000-0000-4000-8000-000000000088")).rejects.toThrow(
      "organization_principal_required",
    );
  });

  it("catalog writes use the Drizzle mutation transaction chokepoint", () => {
    const src = readFileSync(new URL("./pgTestSets.ts", import.meta.url), "utf8");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src.match(/runDrizzleMutationTransaction/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(src).not.toContain("db.transaction");
  });
});
