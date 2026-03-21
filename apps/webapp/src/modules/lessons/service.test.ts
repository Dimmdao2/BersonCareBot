import { describe, expect, it } from "vitest";
import { listLessons } from "./service";

describe("lessons service", () => {
  it("returns non-empty list", async () => {
    const lessons = await listLessons();
    expect(Array.isArray(lessons)).toBe(true);
    expect(lessons.length).toBeGreaterThan(0);
  });

  it("each lesson has id, title, type, summary, status", async () => {
    const lessons = await listLessons();
    for (const lesson of lessons) {
      expect(lesson).toHaveProperty("id");
      expect(lesson).toHaveProperty("title");
      expect(lesson).toHaveProperty("type");
      expect(lesson).toHaveProperty("summary");
      expect(lesson).toHaveProperty("status");
      expect(["video", "exercise", "lesson"]).toContain(lesson.type);
      expect(["available", "coming-soon"]).toContain(lesson.status);
    }
  });
});
