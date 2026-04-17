import { sql } from "drizzle-orm";
import { describe, it } from "vitest";
import { getDrizzle } from "./drizzle";

const hasRealDb =
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean(process.env.DATABASE_URL?.trim());

describe("Drizzle smoke read", () => {
  /** Real DB only — default `pnpm test` clears DATABASE_URL in vitest.setup. */
  it.skipIf(!hasRealDb)("runs select 1 via shared pool", async () => {
    const db = getDrizzle();
    await db.execute(sql`select 1 as n`);
  });
});
