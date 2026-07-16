import { describe, expect, it } from "vitest";
import {
  parseWebappConversationId,
  parsePlatformUserIdFromWebappConversationId,
  webappOrganizationConversationId,
  webappPlatformConversationId,
} from "./supportConversationIds";

describe("supportConversationIds", () => {
  it("round-trips platform user id", () => {
    const id = "00000000-0000-4000-8000-000000000099";
    const key = webappPlatformConversationId(id);
    expect(parsePlatformUserIdFromWebappConversationId(key)).toBe(id);
  });

  it("round-trips an organization-scoped platform user id", () => {
    const organizationId = "10000000-0000-4000-8000-000000000001";
    const platformUserId = "00000000-0000-4000-8000-000000000099";
    const key = webappOrganizationConversationId(organizationId, platformUserId);

    expect(key).toBe(`webapp:organization:${organizationId}:platform:${platformUserId}`);
    expect(parseWebappConversationId(key)).toEqual({
      scope: "organization",
      organizationId,
      platformUserId,
    });
    expect(parsePlatformUserIdFromWebappConversationId(key)).toBe(platformUserId);
  });
});
