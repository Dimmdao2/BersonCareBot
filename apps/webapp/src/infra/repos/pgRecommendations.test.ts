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
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  })),
}));

import { createPgRecommendationsPort } from "./pgRecommendations";

describe("createPgRecommendationsPort usage summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("getRecommendationUsageSummary runs aggregate query for recommendation refs", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          published_tp_templates: 0,
          draft_tp_templates: 0,
          archived_tp_templates: 0,
          active_tp_instances: 0,
          completed_tp_instances: 0,
          published_tp_template_refs: [],
          draft_tp_template_refs: [],
          archived_tp_template_refs: [],
          active_tp_instance_refs: [],
          completed_tp_instance_refs: [],
        },
      ],
    });
    const port = createPgRecommendationsPort();
    await port.getRecommendationUsageSummary("00000000-0000-4000-8000-000000000099");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("si.item_ref_id = $1::uuid");
    expect(sql).toContain("item_type = 'recommendation'");
  });
});
