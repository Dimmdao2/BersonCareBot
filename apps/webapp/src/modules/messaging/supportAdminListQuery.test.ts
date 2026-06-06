import { describe, expect, it } from "vitest";
import {
  doctorSupportUnreadOnlyFromQuery,
  integratorSupportConversationsQuerySchema,
} from "./supportAdminListQuery";

describe("supportAdminListQuery", () => {
  it("integratorSupportConversationsQuerySchema clamps limit and trims source", () => {
    const parsed = integratorSupportConversationsQuerySchema.parse({
      source: "  telegram ",
      limit: "5",
    });
    expect(parsed).toEqual({ source: "telegram", limit: 5 });
  });

  it("integratorSupportConversationsQuerySchema rejects limit above 100", () => {
    expect(integratorSupportConversationsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("doctorSupportUnreadOnlyFromQuery accepts only 1", () => {
    expect(doctorSupportUnreadOnlyFromQuery("1")).toBe(true);
    expect(doctorSupportUnreadOnlyFromQuery("0")).toBe(false);
    expect(doctorSupportUnreadOnlyFromQuery("yes")).toBe(false);
  });
});
