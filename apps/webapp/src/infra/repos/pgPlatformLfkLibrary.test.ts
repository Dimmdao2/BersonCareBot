import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/db/runWebappSql", () => ({ runWebappPgText: runWebappPgTextMock }));

import { createPgPlatformLfkLibraryPort } from "./pgPlatformLfkLibrary";

describe("createPgPlatformLfkLibraryPort", () => {
  beforeEach(() => runWebappPgTextMock.mockReset());

  it("maps the bounded snapshot without clinic ownership fields", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [{
        value: {
          exercises: [{
            id: "550e8400-e29b-41d4-a716-446655440000",
            title: "База",
            description: null,
            isArchived: false,
            media: [{ url: "/api/media/550e8400-e29b-41d4-a716-446655440001", type: "video", sortOrder: 0 }],
          }],
          templates: [],
        },
      }],
    });
    const snapshot = await createPgPlatformLfkLibraryPort().getSnapshot();
    expect(snapshot.exercises[0]?.title).toBe("База");
    expect(snapshot.exercises[0]?.media[0]?.media_type).toBe("video");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("app.c4d_platform_lfk_snapshot");
  });

  it("uses only the audited SECURITY DEFINER write entrypoints", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ id: "550e8400-e29b-41d4-a716-446655440000" }] });
    const port = createPgPlatformLfkLibraryPort();
    await port.saveExercise(null, { title: "База", media: [] });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("app.c4d_platform_lfk_save_exercise");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).not.toContain("INSERT INTO");
  });
});
