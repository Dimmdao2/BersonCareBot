/**
 * Unit-тесты doctor-wide методов pgProgramItemDiscussionPort:
 *   listUnreadExerciseCommentsForDoctor / listExerciseCommentsForDoctor
 *
 * Покрывает:
 *   - ранний выход при patientUserIds = [] (без вызова getDrizzle)
 *   - корректный маппинг DB-строки → DoctorExerciseCommentRow
 *     (stageItemTitle из snapshot.title, fallback «Упражнение»)
 *   - применение limit (Math.max(1, Math.trunc))
 *   - обе ветки (unreadOnly = true / false) доходят до outer query
 *
 * SQL-корректность WHERE/JOIN/DISTINCT ON/cursor проверяется opt-in через
 * pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts (USE_REAL_DATABASE=1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mock getDrizzle ───────────────────────────────────────────────────────────
// queryDoctorExerciseComments строит CTE через db.$with().as(selectDistinctOn chain),
// затем outer query: db.with(cte).select().from(cte).where().orderBy().limit().
// Все методы цепочки мокаются; latestCte-ссылка — простой объект { __cte: true }.
// Drizzle sql`${undefined}` создаёт валидный Param-узел, поэтому условия
// outerConditions собираются без throws при undefined-полях mock-cte.

const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

// ── mock схемы — pgProgramItemDiscussion импортирует schema objects ───────────
vi.mock("@/infra/repos/../../../db/schema/programItemDiscussion", () => ({
  programItemDiscussionMessages: { instanceStageItemId: "col", id: "col" },
  programItemDiscussionReads: { instanceStageItemId: "col", patientUserId: "col", lastReadAt: "col" },
}));
vi.mock("@/infra/repos/../../../db/schema/schema", () => ({
  supportConversationMessages: {},
  supportConversations: {},
}));
vi.mock("@/infra/repos/../../../db/schema/treatmentProgramInstances", () => ({
  treatmentProgramInstanceStageItems: { id: "col", snapshot: "col", stageId: "col", itemType: "col", status: "col" },
  treatmentProgramInstanceStages: { id: "col", instanceId: "col" },
  treatmentProgramInstances: { id: "col", patientUserId: "col", status: "col", assignmentSource: "col" },
}));
vi.mock("@/modules/messaging/programNoteReplyContext", () => ({
  extractPatientExerciseCommentReplyBody: vi.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

/** Строка из outer CTE-запроса (все поля, которые mapMessageFields + stageItemSnapshotTitle читают). */
function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-id-1",
    instanceStageItemId: "item-id-1",
    patientUserId: "patient-id-1",
    senderRole: "patient",
    origin: "patient_observation",
    body: "Упражнение ок",
    mediaFileId: null,
    supportMessageId: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    snapshot: { title: "Отжимания" },
    instanceId: "instance-id-1",
    lastReadAt: null,
    ...overrides,
  };
}

/** Создаёт mock getDrizzle, чья outer .limit() возвращает rows. */
function makeDrizzleMock(rows: unknown[] = []) {
  // CTE subquery chain — все методы возвращают this
  const cteSubquery: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
    cteSubquery[method] = vi.fn().mockReturnThis();
  }
  Object.assign(cteSubquery, cteSubquery); // ensure each .mockReturnThis() targets the same object
  // fix: each method returns the same object
  const cteChain = {
    from: vi.fn(() => cteChain),
    innerJoin: vi.fn(() => cteChain),
    leftJoin: vi.fn(() => cteChain),
    where: vi.fn(() => cteChain),
    orderBy: vi.fn(() => cteChain),
  };
  const cteSubqueryChain = cteChain; // alias for clarity

  // Outer query chain: db.with(cte).select().from().where().orderBy().limit()
  const limitFn = vi.fn(async () => rows);
  const orderByFn = vi.fn(() => ({ limit: limitFn }));
  const whereFn = vi.fn(() => ({ orderBy: orderByFn }));
  const fromFn = vi.fn(() => ({ where: whereFn }));
  const selectFn = vi.fn(() => ({ from: fromFn }));
  const withFn = vi.fn(() => ({ select: selectFn }));

  // CTE ref — простой объект; доступ к свойствам вернёт undefined,
  // что Drizzle sql`${undefined}` завернёт в Param без throws
  const cteRef = Object.create(null) as Record<string, unknown>;

  const db = {
    $with: vi.fn(() => ({ as: vi.fn(() => cteRef) })),
    selectDistinctOn: vi.fn(() => cteSubqueryChain),
    with: withFn,
  };

  return { db, limitFn };
}

// ── imports (после vi.mock) ──────────────────────────────────────────────────
import { createPgProgramItemDiscussionPort } from "./pgProgramItemDiscussion";

// ── tests ────────────────────────────────────────────────────────────────────

describe("pgProgramItemDiscussion — listUnreadExerciseCommentsForDoctor", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
  });

  it("returns [] without calling getDrizzle when patientUserIds is empty", async () => {
    const port = createPgProgramItemDiscussionPort();
    const result = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [],
      viewerUserId: "doc-id",
      limit: 10,
    });
    expect(result).toEqual([]);
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("maps DB row to DoctorExerciseCommentRow — stageItemTitle from snapshot.title", async () => {
    const row = makeDbRow();
    const { db, limitFn } = makeDrizzleMock([row]);
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProgramItemDiscussionPort();
    const result = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ["patient-id-1"],
      viewerUserId: "doc-id",
      limit: 10,
    });

    expect(limitFn).toHaveBeenCalledWith(10); // safeLimit = Math.max(1, Math.trunc(10))
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      patientUserId: "patient-id-1",
      instanceId: "instance-id-1",
      stageItemId: "item-id-1",
      stageItemTitle: "Отжимания",
      createdAt: "2026-06-01T10:00:00.000Z",
    });
    expect(result[0]!.latestMessage).toMatchObject({
      id: "msg-id-1",
      senderRole: "patient",
      body: "Упражнение ок",
      mediaFileId: null,
    });
  });

  it("stageItemTitle falls back to «Упражнение» when snapshot.title is absent", async () => {
    const row = makeDbRow({ snapshot: {} }); // no title
    const { db } = makeDrizzleMock([row]);
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProgramItemDiscussionPort();
    const result = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ["patient-id-1"],
      viewerUserId: "doc-id",
      limit: 10,
    });

    expect(result[0]?.stageItemTitle).toBe("Упражнение");
  });

  it("applies safeLimit = Math.max(1, Math.trunc(limit)) for fractional input", async () => {
    const { db, limitFn } = makeDrizzleMock([]);
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProgramItemDiscussionPort();
    await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ["patient-id-1"],
      viewerUserId: "doc-id",
      limit: 7.9,
    });

    expect(limitFn).toHaveBeenCalledWith(7);
  });

  it("applies minimum limit of 1 for zero/negative input", async () => {
    const { db, limitFn } = makeDrizzleMock([]);
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProgramItemDiscussionPort();
    await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ["patient-id-1"],
      viewerUserId: "doc-id",
      limit: 0,
    });

    expect(limitFn).toHaveBeenCalledWith(1);
  });

  it("returns empty array when DB returns no rows", async () => {
    const { db } = makeDrizzleMock([]);
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProgramItemDiscussionPort();
    const result = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ["patient-id-1"],
      viewerUserId: "doc-id",
      limit: 10,
    });

    expect(result).toEqual([]);
  });
});

describe("pgProgramItemDiscussion — listExerciseCommentsForDoctor", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
  });

  it("returns [] without calling getDrizzle when patientUserIds is empty", async () => {
    const port = createPgProgramItemDiscussionPort();
    const result = await port.listExerciseCommentsForDoctor({
      patientUserIds: [],
      viewerUserId: "doc-id",
      limit: 10,
    });
    expect(result).toEqual([]);
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("maps DB row correctly (same mapping as unread)", async () => {
    const row = makeDbRow({ body: "История комментария" });
    const { db } = makeDrizzleMock([row]);
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProgramItemDiscussionPort();
    const result = await port.listExerciseCommentsForDoctor({
      patientUserIds: ["patient-id-1"],
      viewerUserId: "doc-id",
      limit: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.latestMessage.body).toBe("История комментария");
  });
});
