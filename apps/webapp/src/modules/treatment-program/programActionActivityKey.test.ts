import { describe, expect, it } from "vitest";
import { listLfkSnapshotExerciseLines } from "./programActionActivityKey";

describe("listLfkSnapshotExerciseLines", () => {
  it("returns empty when exercises missing or not an array", () => {
    expect(listLfkSnapshotExerciseLines({})).toEqual([]);
    expect(listLfkSnapshotExerciseLines({ exercises: null })).toEqual([]);
    expect(listLfkSnapshotExerciseLines({ exercises: [] })).toEqual([]);
    expect(listLfkSnapshotExerciseLines({ exercises: "x" as unknown as [] })).toEqual([]);
  });

  it("parses exerciseId, title, sortOrder and skips invalid rows", () => {
    const lines = listLfkSnapshotExerciseLines({
      exercises: [
        { exerciseId: "  e1  ", title: "Первое", sortOrder: 2 },
        { exerciseId: "", title: "x" },
        null,
        { exerciseId: "e2", sortOrder: 1 },
      ],
    });
    expect(lines.map((l) => l.exerciseId)).toEqual(["e2", "e1"]);
    expect(lines.find((l) => l.exerciseId === "e1")?.title).toBe("Первое");
    expect(lines.find((l) => l.exerciseId === "e2")?.title).toBe("Упражнение");
  });

  it("sets media only for non-empty arrays of plain objects", () => {
    const withMedia = listLfkSnapshotExerciseLines({
      exercises: [
        {
          exerciseId: "e1",
          title: "A",
          sortOrder: 0,
          media: [{ url: "/api/media/x", type: "image", sortOrder: 0 }],
        },
      ],
    });
    expect(withMedia[0]?.media).toEqual([{ url: "/api/media/x", type: "image", sortOrder: 0 }]);

    const emptyArr = listLfkSnapshotExerciseLines({
      exercises: [{ exerciseId: "e1", title: "A", sortOrder: 0, media: [] }],
    });
    expect("media" in (emptyArr[0] ?? {})).toBe(false);

    const garbage = listLfkSnapshotExerciseLines({
      exercises: [{ exerciseId: "e1", title: "A", sortOrder: 0, media: ["x"] }],
    });
    expect("media" in (garbage[0] ?? {})).toBe(false);
  });
});
