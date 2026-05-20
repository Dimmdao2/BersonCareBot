import { describe, expect, it } from "vitest";
import {
  parsePlatformUserIdFromWebappConversationId,
  webappPlatformConversationId,
} from "./supportConversationIds";

describe("supportConversationIds", () => {
  it("round-trips platform user id", () => {
    const id = "00000000-0000-4000-8000-000000000099";
    const key = webappPlatformConversationId(id);
    expect(parsePlatformUserIdFromWebappConversationId(key)).toBe(id);
  });
});
