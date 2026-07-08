/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
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
    expect(client.query).not.toHaveBeenCalled();
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

  it("applies the current organization principal once inside a transaction", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await runWithDbOrganizationPrincipal("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", () =>
      withPoolTransaction(pool as never, async () => "tx-ok"),
    );

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]],
      ["COMMIT"],
    ]);
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

  it("applies the current organization principal to manual transaction handles", async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const tx = await runWithDbOrganizationPrincipal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", () =>
      startPoolTransaction(pool as never),
    );
    await tx.rollback();
    tx.release();

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]],
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
      runWithDbOrganizationPrincipal("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", () =>
        startPoolTransaction(pool as never),
      ),
    ).rejects.toBe(err);

    expect(query.mock.calls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]],
      ["ROLLBACK"],
    ]);
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
