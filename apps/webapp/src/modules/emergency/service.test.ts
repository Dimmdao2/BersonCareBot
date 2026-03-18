import { describe, expect, it } from "vitest";
import { listEmergencyTopics } from "./service";

describe("emergency service", () => {
  it("returns non-empty list", () => {
    const topics = listEmergencyTopics();
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThan(0);
  });

  it("each topic has id, title, summary", () => {
    const topics = listEmergencyTopics();
    for (const topic of topics) {
      expect(topic).toHaveProperty("id");
      expect(topic).toHaveProperty("title");
      expect(topic).toHaveProperty("summary");
    }
  });
});
