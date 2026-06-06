import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgBranchesProjectionPort } from "./pgBranches";

describe("pgBranches", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("upsertFromProjection uses ON CONFLICT integrator_branch_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "br-1" }] });
    const port = createPgBranchesProjectionPort();
    const result = await port.upsertFromProjection({
      integratorBranchId: 42,
      name: "Branch",
      metaJson: {},
    });

    expect(result.branchId).toBe("br-1");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("ON CONFLICT (integrator_branch_id)");
  });

  it("getByIntegratorBranchId selects by integrator_branch_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgBranchesProjectionPort();
    await port.getByIntegratorBranchId(7);

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("integrator_branch_id = $1");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([7]);
  });
});
