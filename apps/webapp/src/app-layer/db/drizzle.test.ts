import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const transactionMock = vi.hoisted(() => vi.fn());
const executeMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  getPool: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({
    transaction: transactionMock,
  })),
}));

import { getDrizzle } from "./drizzle";

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

describe("getDrizzle transaction principal", () => {
  const dialect = new PgDialect();

  beforeEach(() => {
    vi.resetModules();
    transactionMock.mockReset();
    executeMock.mockReset();
    transactionMock.mockImplementation(async (callback: (tx: { execute: typeof executeMock }) => Promise<unknown>) =>
      callback({ execute: executeMock }),
    );
  });

  it("does not set app.org when no DB principal is active", async () => {
    const db = getDrizzle();

    await db.transaction(async () => "ok");

    expect(executeMock).not.toHaveBeenCalled();
  });

  it("sets app.org inside Drizzle transactions when DB principal is active", async () => {
    const db = getDrizzle();

    await runWithDbOrganizationPrincipal(ORGANIZATION_ID, () =>
      db.transaction(async () => {
        expect(executeMock).toHaveBeenCalledTimes(1);
        return "ok";
      }),
    );

    const principalSql = executeMock.mock.calls[0]?.[0] as SQL;
    const compiled = dialect.sqlToQuery(principalSql);
    expect(compiled.sql).toBe("SELECT set_config('app.org', $1, true)");
    expect(compiled.params).toEqual([ORGANIZATION_ID]);
  });
});
