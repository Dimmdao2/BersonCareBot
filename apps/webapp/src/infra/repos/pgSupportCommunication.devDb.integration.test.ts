/**
 * Opt-in read-only smoke: support communication via `runWebappPgText` executor.
 *
 *   USE_REAL_DATABASE=1 RUN_SUPPORT_COMMUNICATION_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgSupportCommunication.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgSupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_SUPPORT_COMMUNICATION_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgSupportCommunication (dev DB, opt-in read-only)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("listOpenConversationsForAdmin returns an array via runWebappPgText executor", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgSupportCommunicationPort();
    const list = await port.listOpenConversationsForAdmin({ limit: 5 });
    expect(Array.isArray(list)).toBe(true);
  });

  it("conversationExists is false for unknown uuid", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgSupportCommunicationPort();
    const exists = await port.conversationExists("00000000-0000-4000-8000-00000000ffff");
    expect(exists).toBe(false);
  });

  it("countUnreadUserMessagesForAdmin returns a non-negative integer", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
    } finally {
      client.release();
    }

    const port = createPgSupportCommunicationPort();
    const n = await port.countUnreadUserMessagesForAdmin();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
