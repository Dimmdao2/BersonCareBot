/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { startPoolTransaction, withPoolClient, withPoolTransaction } from "@/infra/db/withClient";

describe("withClient helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("releases checked-out client after successful work", async () => {
    const release = vi.fn();
    const client = { query: vi.fn(), release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolClient(pool as never, async () => "ok")).resolves.toBe("ok");

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("commits a successful transaction and releases client", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withPoolTransaction(pool as never, async () => "tx-ok")).resolves.toBe("tx-ok");

    expect(query.mock.calls.map((call: unknown[]) => call[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("starts a manual transaction handle through the same checkout path", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await startPoolTransaction(pool as never);
    await tx.commit();
    tx.release();

    expect(query.mock.calls.map((call: unknown[]) => call[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed transaction and releases client", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };
    const err = new Error("boom");

    await expect(
      withPoolTransaction(pool as never, async () => {
        throw err;
      }),
    ).rejects.toBe(err);

    expect(query.mock.calls.map((call: unknown[]) => call[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
