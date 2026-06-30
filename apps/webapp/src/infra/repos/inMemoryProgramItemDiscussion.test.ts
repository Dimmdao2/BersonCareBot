/**
 * Тест doctor-wide методов inMemory-порта (1.B/1.C паритет).
 *
 * Вызывает порт напрямую (без сервисного слоя) — то же поведение,
 * что ожидается от pgProgramItemDiscussion.queryDoctorExerciseComments.
 */
import { describe, expect, it } from "vitest";
import { createInMemoryProgramItemDiscussionPort } from "./inMemoryProgramItemDiscussion";

const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const PA = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001"; // patient A
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002"; // patient B
const ITEM1 = "cccccccc-cccc-4ccc-8ccc-000000000001";
const ITEM2 = "cccccccc-cccc-4ccc-8ccc-000000000002";
const ITEM3 = "cccccccc-cccc-4ccc-8ccc-000000000003";

function msg(
  stageItemId: string,
  patientUserId: string,
  createdAt: string,
  opts?: { senderRole?: "patient" | "admin"; mediaFileId?: string },
) {
  return {
    instanceStageItemId: stageItemId,
    patientUserId,
    senderRole: opts?.senderRole ?? ("patient" as const),
    origin: "patient_observation" as const,
    body: "текст",
    mediaFileId: opts?.mediaFileId ?? null,
    createdAt,
  };
}

describe("inMemoryProgramItemDiscussionPort — listUnreadExerciseCommentsForDoctor", () => {
  it("empty patientUserIds → []", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    const rows = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("returns unread patient messages, newest first", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM2, PA, "2026-01-03T10:00:00.000Z"));

    const rows = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.stageItemId).toBe(ITEM2); // новее — первый
    expect(rows[1]!.stageItemId).toBe(ITEM1);
  });

  it("excludes patients not in patientUserIds", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM2, PB, "2026-01-02T10:00:00.000Z"));

    const rows = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.patientUserId).toBe(PA);
  });

  it("excludes item where latest message is from admin (admin-reply)", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM1, PA, "2026-01-02T10:00:00.000Z", { senderRole: "admin" }));

    const rows = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("excludes item where latest message has mediaFileId", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(
      msg(ITEM1, PA, "2026-01-01T10:00:00.000Z", {
        mediaFileId: "ffffffff-ffff-4fff-8fff-000000000001",
      }),
    );

    const rows = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("excludes already-read items (viewer lastReadAt >= createdAt)", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.markRead({
      patientUserId: VIEWER,
      stageItemId: ITEM1,
      lastReadAt: "2026-01-01T10:00:00.000Z",
    });

    const rows = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("keyset cursor: second page returns only rows before the cursor", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM2, PA, "2026-01-02T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM3, PA, "2026-01-03T10:00:00.000Z"));

    const page1 = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 2,
    });
    expect(page1).toHaveLength(2);

    const page2 = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PA],
      viewerUserId: VIEWER,
      limit: 10,
      cursor: { createdAt: page1[1]!.createdAt, id: page1[1]!.latestMessage.id },
    });
    expect(page2).toHaveLength(1);
    expect(page2[0]!.stageItemId).toBe(ITEM1); // самый старый
  });
});

describe("inMemoryProgramItemDiscussionPort — listUnreadCountsForViewerByStageItems", () => {
  it("returns zero counts for stageItem with no messages", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [ITEM1],
      viewerUserId: VIEWER,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      stageItemId: ITEM1,
      total: 0,
      unread: 0,
      latestMessageAt: null,
    });
  });

  it("counts only patient messages in total", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM1, PA, "2026-01-02T10:00:00.000Z", { senderRole: "admin" }));

    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [ITEM1],
      viewerUserId: VIEWER,
    });
    expect(result[0]!.total).toBe(1); // only patient msg
    expect(result[0]!.unread).toBe(1);
  });

  it("sets unread=0 for messages read by viewer", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.markRead({
      patientUserId: VIEWER,
      stageItemId: ITEM1,
      lastReadAt: "2026-01-02T00:00:00.000Z",
    });

    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [ITEM1],
      viewerUserId: VIEWER,
    });
    expect(result[0]!.total).toBe(1);
    expect(result[0]!.unread).toBe(0); // read before
  });

  it("unread = messages after lastReadAt", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z")); // before read
    await port.insertMessage(msg(ITEM1, PA, "2026-01-03T10:00:00.000Z")); // after read
    await port.markRead({
      patientUserId: VIEWER,
      stageItemId: ITEM1,
      lastReadAt: "2026-01-02T00:00:00.000Z",
    });

    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [ITEM1],
      viewerUserId: VIEWER,
    });
    expect(result[0]!.total).toBe(2);
    expect(result[0]!.unread).toBe(1); // only msg after lastReadAt
  });

  it("returns latestMessageAt as ISO date of latest patient message", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM1, PA, "2026-01-03T10:00:00.000Z"));

    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [ITEM1],
      viewerUserId: VIEWER,
    });
    expect(result[0]!.latestMessageAt).toBe("2026-01-03T10:00:00.000Z");
  });

  it("handles multiple stageItems in batch", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM1, PA, "2026-01-02T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM2, PB, "2026-01-05T10:00:00.000Z"));

    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [ITEM1, ITEM2, ITEM3],
      viewerUserId: VIEWER,
    });
    expect(result).toHaveLength(3);

    const r1 = result.find((r) => r.stageItemId === ITEM1)!;
    expect(r1.total).toBe(2);
    expect(r1.unread).toBe(2);

    const r2 = result.find((r) => r.stageItemId === ITEM2)!;
    expect(r2.total).toBe(1);

    const r3 = result.find((r) => r.stageItemId === ITEM3)!;
    expect(r3.total).toBe(0);
    expect(r3.latestMessageAt).toBeNull();
  });

  it("returns empty array for empty stageItemIds", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const result = await port.listUnreadCountsForViewerByStageItems({
      stageItemIds: [],
      viewerUserId: VIEWER,
    });
    expect(result).toHaveLength(0);
  });
});

describe("inMemoryProgramItemDiscussionPort — listExerciseCommentsForDoctor", () => {
  it("includes read and unread items, newest first", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    await port.insertMessage(msg(ITEM2, PB, "2026-01-05T10:00:00.000Z"));
    // ITEM1 отмечен прочитанным
    await port.markRead({
      patientUserId: VIEWER,
      stageItemId: ITEM1,
      lastReadAt: "2026-01-02T00:00:00.000Z",
    });

    const rows = await port.listExerciseCommentsForDoctor({
      patientUserIds: [PA, PB],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.stageItemId).toBe(ITEM2); // новее
    expect(rows[1]!.stageItemId).toBe(ITEM1); // прочитан, но включён
  });

  it("empty patientUserIds → []", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    await port.insertMessage(msg(ITEM1, PA, "2026-01-01T10:00:00.000Z"));
    const rows = await port.listExerciseCommentsForDoctor({
      patientUserIds: [],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });
});
