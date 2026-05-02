import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));

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
  })),
}));

import { createPgClinicalTestsPort } from "./pgClinicalTests";

describe("createPgClinicalTestsPort usage summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("getClinicalTestUsageSummary runs aggregate query with test_set_items chain", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          non_archived_test_sets: 0,
          archived_test_sets: 0,
          published_tp_templates: 0,
          draft_tp_templates: 0,
          archived_tp_templates: 0,
          active_tp_instances: 0,
          completed_tp_instances: 0,
          test_results_recorded: 0,
          non_archived_test_set_refs: [],
          archived_test_set_refs: [],
          published_tp_template_refs: [],
          draft_tp_template_refs: [],
          archived_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
        },
      ],
    });
    const port = createPgClinicalTestsPort();
    await port.getClinicalTestUsageSummary("00000000-0000-4000-8000-000000000099");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("test_set_items");
    expect(sql).toContain("item_type = 'test_set'");
    expect(sql).toContain("test_results");
    expect(sql).toContain("t.status = 'archived'");
  });
});
