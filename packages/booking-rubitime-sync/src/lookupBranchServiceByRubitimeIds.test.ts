import { describe, expect, it, vi } from "vitest";
import { lookupBranchServiceByRubitimeIds } from "./lookupBranchServiceByRubitimeIds.js";
import type { SqlExecutor } from "./sql.js";

const ROW_A = {
  branch_service_id: "bs-a",
  branch_id: "b-a",
  service_id: "s-a",
  city_code: "moscow",
  branch_title: "A",
  service_title: "Svc A",
  duration_minutes: 30,
  price_minor: 100,
  rubitime_cooperator_id: "1",
};

const ROW_B = { ...ROW_A, branch_service_id: "bs-b", rubitime_cooperator_id: "2" };

describe("lookupBranchServiceByRubitimeIds", () => {
  it("returns null when catalog has no match", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: SqlExecutor = { query };

    const r = await lookupBranchServiceByRubitimeIds(db, "173", "675");

    expect(r).toEqual({ result: null, ambiguous: false });
  });

  it("returns mapped row when single match", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [ROW_A] });
    const db: SqlExecutor = { query };

    const r = await lookupBranchServiceByRubitimeIds(db, "173", "675", "1");

    expect(r.ambiguous).toBe(false);
    expect(r.result?.branchServiceId).toBe("bs-a");
    expect(r.result?.durationMinutes).toBe(30);
  });

  it("returns ambiguous when multiple rows and no cooperator filter", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [ROW_A, ROW_B] });
    const db: SqlExecutor = { query };

    const r = await lookupBranchServiceByRubitimeIds(db, "173", "675");

    expect(r).toEqual({ result: null, ambiguous: true });
  });

  it("picks first row when cooperator disambiguates", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [ROW_A] });
    const db: SqlExecutor = { query };

    const r = await lookupBranchServiceByRubitimeIds(db, "173", "675", "1");

    expect(r.ambiguous).toBe(false);
    expect(r.result?.rubitimeCooperatorId).toBe("1");
  });
});
