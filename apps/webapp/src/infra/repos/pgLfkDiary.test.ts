import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { pgLfkDiaryPort } from "./pgLfkDiary";

describe("pgLfkDiaryPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("listSessions scopes by user_id and limit", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgLfkDiaryPort.listSessions("patient-u1", 25);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("s.user_id = $1");
    expect(sql).toContain("ORDER BY s.completed_at DESC");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["patient-u1", 25]);
  });

  it("getSessionForUser requires session id and user_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgLfkDiaryPort.getSessionForUser({
      sessionId: "00000000-0000-4000-8000-000000000001",
      userId: "patient-u1",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("WHERE s.id = $1 AND s.user_id = $2");
  });

  it("listSessionsInRange filters completed_at window", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgLfkDiaryPort.listSessionsInRange({
      userId: "patient-u1",
      fromCompletedAt: "2026-01-01T00:00:00.000Z",
      toCompletedAtExclusive: "2026-02-01T00:00:00.000Z",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("s.completed_at >=");
    expect(sql).toContain("s.completed_at <");
  });

  it("getComplexForUser uses platform_user_id or legacy user_id match", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgLfkDiaryPort.getComplexForUser({
      complexId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000099",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("platform_user_id");
    expect(sql).toContain("c.id = $1");
  });

  it("addSession inserts session and enriches with complex title", async () => {
    const completedAt = new Date("2026-01-15T12:00:00.000Z");
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            user_id: "patient-u1",
            complex_id: "00000000-0000-4000-8000-000000000002",
            completed_at: completedAt,
            source: "webapp",
            created_at: completedAt,
            recorded_at: completedAt,
            duration_minutes: 30,
            difficulty_0_10: 3,
            pain_0_10: 2,
            comment: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ title: "Комплекс" }] });
    const session = await pgLfkDiaryPort.addSession({
      userId: "patient-u1",
      complexId: "00000000-0000-4000-8000-000000000002",
      completedAt: completedAt.toISOString(),
      source: "webapp",
      durationMinutes: 30,
      difficulty0_10: 3,
      pain0_10: 2,
    });
    expect(session.complexTitle).toBe("Комплекс");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "")).toContain("INSERT INTO lfk_sessions");
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "")).toContain("lfk_complexes");
  });

  it("updateSession scopes by user_id and truncates comment to 200 chars", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const longComment = "x".repeat(250);
    await pgLfkDiaryPort.updateSession({
      userId: "patient-u1",
      sessionId: "00000000-0000-4000-8000-000000000001",
      completedAt: "2026-01-15T12:00:00.000Z",
      comment: longComment,
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("UPDATE lfk_sessions");
    expect(sql).toContain("WHERE id = $2 AND user_id = $1");
    const params = runWebappPgTextMock.mock.calls[0]?.[1] as unknown[];
    expect((params[6] as string).length).toBe(200);
  });

  it("deleteSession scopes delete by user_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgLfkDiaryPort.deleteSession({
      userId: "patient-u1",
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("DELETE FROM lfk_sessions");
    expect(sql).toContain("user_id = $1");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "patient-u1",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });
});
