import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

import { mergeLegacySupportConversationsForPlatformUser } from "./mergeLegacySupportConversations";

describe("mergeLegacySupportConversationsForPlatformUser", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("returns zero when canonical upsert yields no id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const client = {} as import("pg").PoolClient;
    const result = await mergeLegacySupportConversationsForPlatformUser(
      client,
      "00000000-0000-4000-8000-000000000001",
    );
    expect(result).toEqual({ mergedConversationCount: 0, movedMessageCount: 0 });
  });

  it("moves messages from legacy rows into canonical thread", async () => {
    const canonicalId = "canonical-uuid";
    const legacyId = "legacy-uuid";
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO support_conversations")) {
        return { rows: [{ id: canonicalId }] };
      }
      if (sql.includes("SELECT sc.id FROM support_conversations sc")) {
        return { rows: [{ id: legacyId }] };
      }
      if (sql.includes("UPDATE support_conversation_messages")) {
        return { rows: [{ id: "m1" }, { id: "m2" }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = {} as import("pg").PoolClient;

    const result = await mergeLegacySupportConversationsForPlatformUser(
      client,
      "00000000-0000-4000-8000-000000000001",
    );

    expect(result.mergedConversationCount).toBe(1);
    expect(result.movedMessageCount).toBe(2);
    const closeCall = runWebappPgTextMock.mock.calls.find(([sql]) =>
      String(sql).includes("merged_into_platform_thread"),
    );
    expect(closeCall?.[1]).toEqual([legacyId]);
  });
});
