import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

const drizzleDbMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => drizzleDbMock,
}));

import { runWebappPgText, webappSqlFromPgText } from "./runWebappSql";

const pgDialect = new PgDialect();

describe("webappSqlFromPgText", () => {
  it("binds a JS array as ONE positional param so PG array casts work", () => {
    const fragment = webappSqlFromPgText("SELECT 1 WHERE status = ANY($1::text[])", [
      ["draft", "published"],
    ]);
    const { sql: text, params } = pgDialect.sqlToQuery(fragment);

    expect(text).toBe("SELECT 1 WHERE status = ANY($1::text[])");
    expect(params).toEqual([["draft", "published"]]);
  });

  it("keeps scalar params positional and ordered", () => {
    const fragment = webappSqlFromPgText("SELECT 1 WHERE a = $1 AND b = $2", ["x", 7]);
    const { sql: text, params } = pgDialect.sqlToQuery(fragment);

    expect(text).toBe("SELECT 1 WHERE a = $1 AND b = $2");
    expect(params).toEqual(["x", 7]);
  });
});

describe("runWebappPgText", () => {
  it("executes through the unified Drizzle execute channel", async () => {
    drizzleDbMock.execute.mockResolvedValueOnce({ rows: [{ id: "1" }], rowCount: 1 });

    const result = await runWebappPgText("SELECT 1 WHERE status = ANY($1::text[])", [
      ["draft", "published"],
    ]);

    expect(drizzleDbMock.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ rows: [{ id: "1" }], rowCount: 1 });
  });
});
