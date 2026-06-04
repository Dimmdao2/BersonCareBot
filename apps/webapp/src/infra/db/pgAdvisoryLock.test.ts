/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const execute = vi.fn().mockResolvedValue({ rows: [] });

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ execute })),
}));

import { drizzle } from "drizzle-orm/node-postgres";
import {
  pgAdvisoryXactLock,
  pgAdvisoryXactLockShared,
  pgSessionAdvisoryLock,
  pgSessionAdvisoryUnlock,
} from "@/infra/db/pgAdvisoryLock";

function lastSqlText(): string {
  return drizzleSqlFragmentToApproximateSql(execute.mock.calls.at(-1)?.[0]);
}

describe("pgAdvisoryLock (webapp)", () => {
  beforeEach(() => {
    execute.mockClear();
    execute.mockResolvedValue({ rows: [] });
  });

  it("pgAdvisoryXactLock uses pg_advisory_xact_lock via drizzle execute", async () => {
    const client = {} as never;
    await pgAdvisoryXactLock(client, "user-uuid");

    expect(drizzle).toHaveBeenCalledWith(client);
    expect(lastSqlText()).toContain("pg_advisory_xact_lock");
    expect(lastSqlText()).toContain("hashtext");
  });

  it("pgAdvisoryXactLockShared uses shared xact lock", async () => {
    await pgAdvisoryXactLockShared({} as never, "user-uuid");
    expect(lastSqlText()).toContain("pg_advisory_xact_lock_shared");
  });

  it("pgSessionAdvisoryLock uses session-level pg_advisory_lock on client", async () => {
    const client = {} as never;
    await pgSessionAdvisoryLock(client, "media-id");
    expect(drizzle).toHaveBeenCalledWith(client);
    expect(lastSqlText()).toContain("pg_advisory_lock");
    expect(lastSqlText()).not.toContain("xact");
  });

  it("pgSessionAdvisoryUnlock uses pg_advisory_unlock on same client", async () => {
    await pgSessionAdvisoryUnlock({} as never, "media-id");
    expect(lastSqlText()).toContain("pg_advisory_unlock");
  });
});
