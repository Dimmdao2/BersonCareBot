import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { mediaWorkerSqlFromPgText, runMediaWorkerPgText } from "./runMediaWorkerSql.js";

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

  it("uses direct pool query when organization principal is unset", async () => {
    const pool = {
      query: async (text: string, params: readonly unknown[]) => ({
        rows: [{ text, params }],
        rowCount: 1,
      }),
    };

    const result = await runMediaWorkerPgText(pool as never, "UPDATE public.media_files SET status = $2 WHERE id = $1", [
      "media-1",
      "ready",
    ]);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toEqual({
      text: "UPDATE public.media_files SET status = $1 WHERE id = $2",
      params: ["ready", "media-1"],
    });
  });

  it("uses media-worker transaction chokepoint when organization principal is set", async () => {
    const releaseCalls: string[] = [];
    const queryCalls: unknown[][] = [];
    const client = {
      query: async (...args: unknown[]) => {
        queryCalls.push(args);
        return { rows: [], rowCount: 1 };
      },
      release: () => {
        releaseCalls.push("release");
      },
    };
    const pool = {
      connect: async () => client,
      query: async () => {
        throw new Error("pool.query should not be used with an organization principal");
      },
    };

    const result = await runWithDbOrganizationPrincipal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", () =>
      runMediaWorkerPgText(pool as never, "UPDATE public.media_files SET status = $2 WHERE id = $1", [
        "media-1",
        "ready",
      ]),
    );

    expect(result.rowCount).toBe(1);
    expect(queryCalls).toEqual([
      ["BEGIN"],
      ["SELECT set_config('app.org', $1, true)", ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]],
      ["UPDATE public.media_files SET status = $1 WHERE id = $2", ["ready", "media-1"]],
      ["COMMIT"],
    ]);
    expect(releaseCalls).toEqual(["release"]);
  });
});
