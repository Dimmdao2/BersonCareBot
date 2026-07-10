import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { describe, expect, it, vi } from "vitest";
import { startMediaWorkerTransaction } from "./withClient.js";

describe("media-worker DB client helpers", () => {
  it("keeps transactions unchanged when no principal is set", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await startMediaWorkerTransaction(pool as never);
    await tx.commit();
    tx.release();

    expect(query.mock.calls).toEqual([["BEGIN"], ["COMMIT"]]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("applies the current organization principal inside a transaction", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await runWithDbOrganizationPrincipal("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", () =>
      startMediaWorkerTransaction(pool as never),
    );
    await tx.rollback();
    tx.release();

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]],
      ["ROLLBACK"],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases when transaction principal setup fails", async () => {
    const release = vi.fn();
    const err = new Error("set_config failed");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbOrganizationPrincipal("ffffffff-ffff-4fff-8fff-ffffffffffff", () =>
        startMediaWorkerTransaction(pool as never),
      ),
    ).rejects.toBe(err);

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["ffffffff-ffff-4fff-8fff-ffffffffffff"]],
      ["ROLLBACK"],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
