import { describe, expect, it, vi } from "vitest";
import { mergeLegacySupportConversationsForPlatformUser } from "./mergeLegacySupportConversations";

describe("mergeLegacySupportConversationsForPlatformUser", () => {
  it("moves messages from legacy rows into canonical thread", async () => {
    const canonicalId = "canonical-uuid";
    const legacyId = "legacy-uuid";
    const query = vi.fn(async (sql: string) => {
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
    const client = { query } as unknown as import("pg").PoolClient;

    const result = await mergeLegacySupportConversationsForPlatformUser(
      client,
      "00000000-0000-4000-8000-000000000001",
    );

    expect(result.mergedConversationCount).toBe(1);
    expect(result.movedMessageCount).toBe(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("merged_into_platform_thread"),
      [legacyId],
    );
  });
});
