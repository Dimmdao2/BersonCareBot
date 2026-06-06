import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { mediaWorkerSqlFromPgText } from "./runMediaWorkerSql.js";

const pgDialect = new PgDialect();

// eslint-disable-next-line no-secrets/no-secrets -- test title, not credential material
describe("mediaWorkerSqlFromPgText", () => {
  it("keeps array as single parameter for PG array casts", () => {
    const fragment = mediaWorkerSqlFromPgText("SELECT 1 WHERE status = ANY($1::text[])", [
      ["pending", "done"],
    ]);
    const { sql, params } = pgDialect.sqlToQuery(fragment);

    expect(sql).toBe("SELECT 1 WHERE status = ANY($1::text[])");
    expect(params).toEqual([["pending", "done"]]);
  });
});
