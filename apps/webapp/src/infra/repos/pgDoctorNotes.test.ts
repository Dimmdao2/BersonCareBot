import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgDoctorNotesPort } from "./pgDoctorNotes";

describe("pgDoctorNotes", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("listForUser queries doctor_notes ordered by created_at desc", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorNotesPort();
    await port.listForUser("user-1");

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("doctor_notes");
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["user-1"]);
  });

  it("create inserts note and returns mapped row", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "n1",
          user_id: "u1",
          author_id: "a1",
          text: "note",
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const port = createPgDoctorNotesPort();
    const row = await port.create({ userId: "u1", authorId: "a1", text: "note" });

    expect(row.id).toBe("n1");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO doctor_notes");
  });
});
