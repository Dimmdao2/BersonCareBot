import { describe, expect, it, vi } from "vitest";
import { closeActivePatientBookingsByRubitimeId } from "./closeActivePatientBookingsByRubitimeId.js";
import type { SqlExecutor } from "./sql.js";

describe("closeActivePatientBookingsByRubitimeId", () => {
  it("updates active sibling rows for the same rubitime_id", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    const db: SqlExecutor = { query };
    await closeActivePatientBookingsByRubitimeId(db, "8449953", "primary-id");
    expect(String(query.mock.calls[0]?.[0])).toContain("rubitime_id = $1");
    expect(String(query.mock.calls[0]?.[0])).toContain("rubitime_manage_url = NULL");
    expect(query.mock.calls[0]?.[1]).toEqual(["8449953", "primary-id", expect.any(Array)]);
  });

  it("no-ops on blank rubitime id", async () => {
    const query = vi.fn();
    await closeActivePatientBookingsByRubitimeId({ query }, "  ");
    expect(query).not.toHaveBeenCalled();
  });
});
