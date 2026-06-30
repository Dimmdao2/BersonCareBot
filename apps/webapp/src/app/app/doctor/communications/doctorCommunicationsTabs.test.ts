import { describe, expect, it } from "vitest";
import {
  COMMUNICATIONS_TABS,
  COMMUNICATIONS_DEFAULT_TAB,
  communicationsTabFromQuery,
} from "./doctorCommunicationsTabs";

describe("doctorCommunicationsTabs", () => {
  it("declares 4 tabs in order chats/comments/intake/broadcasts", () => {
    expect(COMMUNICATIONS_TABS.map((t) => t.id)).toEqual([
      "chats",
      "comments",
      "intake",
      "broadcasts",
    ]);
  });

  it("each tab href points to the aggregate URL with its tab id", () => {
    for (const tab of COMMUNICATIONS_TABS) {
      expect(tab.href).toBe(`/app/doctor/communications?tab=${tab.id}`);
    }
  });

  describe("communicationsTabFromQuery", () => {
    it("maps valid tab values", () => {
      expect(communicationsTabFromQuery("chats")).toBe("chats");
      expect(communicationsTabFromQuery("intake")).toBe("intake");
      expect(communicationsTabFromQuery("comments")).toBe("comments");
      expect(communicationsTabFromQuery("broadcasts")).toBe("broadcasts");
    });

    it("falls back to default for null/unknown", () => {
      expect(communicationsTabFromQuery(null)).toBe(COMMUNICATIONS_DEFAULT_TAB);
      expect(communicationsTabFromQuery(undefined)).toBe(COMMUNICATIONS_DEFAULT_TAB);
      expect(communicationsTabFromQuery("nonsense")).toBe(COMMUNICATIONS_DEFAULT_TAB);
    });
  });
});

