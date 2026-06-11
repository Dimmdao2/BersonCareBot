import { describe, expect, it, vi } from "vitest";
import { createProgramItemDiscussionService } from "./service";
import { createInMemoryProgramItemDiscussionPort } from "@/infra/repos/inMemoryProgramItemDiscussion";
import type { ProgramItemDiscussionPort } from "./ports";

describe("program item discussion service", () => {
  it("rejects empty payload", async () => {
    const service = createProgramItemDiscussionService({
      insertMessage: vi.fn(),
      listMessagesForStageItem: vi.fn(),
      markRead: vi.fn(),
      getUnreadCount: vi.fn(),
    } as unknown as ProgramItemDiscussionPort);

    await expect(
      service.appendMessage({
        instanceStageItemId: "00000000-0000-4000-8000-000000000001",
        patientUserId: "00000000-0000-4000-8000-000000000002",
        senderRole: "patient",
        origin: "patient_observation",
      }),
    ).rejects.toThrow("message_payload_empty");
  });

  it("guards doctor reply by assignment and item status", async () => {
    const insertMessage = vi.fn().mockResolvedValue({ id: "m1" });
    const service = createProgramItemDiscussionService({
      insertMessage,
      listMessagesForStageItem: vi.fn(),
      markRead: vi.fn(),
      getUnreadCount: vi.fn(),
    } as unknown as ProgramItemDiscussionPort);

    await expect(
      service.appendDoctorReplyForProgramNote({
        instanceStageItemId: "00000000-0000-4000-8000-000000000001",
        patientUserId: "00000000-0000-4000-8000-000000000002",
        assignmentSource: "promo",
        itemStatus: "active",
        body: "ok",
        supportMessageId: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toThrow("program_not_doctor_assigned");

    await expect(
      service.appendDoctorReplyForProgramNote({
        instanceStageItemId: "00000000-0000-4000-8000-000000000001",
        patientUserId: "00000000-0000-4000-8000-000000000002",
        assignmentSource: "doctor",
        itemStatus: "disabled",
        body: "ok",
        supportMessageId: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toThrow("program_item_not_active");

    expect(insertMessage).not.toHaveBeenCalled();
  });
});

const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const PATIENT_A = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const PATIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
const PATIENT_C = "bbbbbbbb-bbbb-4bbb-8bbb-000000000003";
const ITEM_1 = "cccccccc-cccc-4ccc-8ccc-000000000001";
const ITEM_2 = "cccccccc-cccc-4ccc-8ccc-000000000002";

describe("listUnreadExerciseCommentsForDoctor — service validation", () => {
  it("rejects invalid viewerUserId", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await expect(
      svc.listUnreadExerciseCommentsForDoctor({ patientUserIds: [], viewerUserId: "bad", limit: 10 }),
    ).rejects.toThrow("viewer_user_id_invalid");
  });

  it("rejects invalid patientUserId in array", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await expect(
      svc.listUnreadExerciseCommentsForDoctor({ patientUserIds: ["bad"], viewerUserId: VIEWER, limit: 10 }),
    ).rejects.toThrow("patient_user_id_invalid");
  });

  it("delegates to port with validated params", async () => {
    const portFn = vi.fn().mockResolvedValue([]);
    const port = { listUnreadExerciseCommentsForDoctor: portFn } as unknown as ProgramItemDiscussionPort;
    const svc = createProgramItemDiscussionService(port);
    await svc.listUnreadExerciseCommentsForDoctor({ patientUserIds: [PATIENT_A], viewerUserId: VIEWER, limit: 5 });
    expect(portFn).toHaveBeenCalledWith({ patientUserIds: [PATIENT_A], viewerUserId: VIEWER, limit: 5, cursor: null });
  });
});

describe("listUnreadExerciseCommentsForDoctor — inMemory logic", () => {
  function makeMsg(
    id: string,
    stageItemId: string,
    patientUserId: string,
    createdAt: string,
    opts?: { senderRole?: "patient" | "admin"; mediaFileId?: string },
  ) {
    return {
      instanceStageItemId: stageItemId,
      patientUserId,
      senderRole: (opts?.senderRole ?? "patient") as "patient" | "admin",
      origin: "patient_observation" as const,
      body: "msg",
      mediaFileId: opts?.mediaFileId ?? null,
      supportMessageId: null,
      createdAt,
      id, // id is set via insertMessage → we override via hack below
    };
  }

  it("returns unread patient messages, newest first", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);

    await port.insertMessage({ ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-01T10:00:00.000Z") });
    await port.insertMessage({ ...makeMsg("", ITEM_2, PATIENT_A, "2026-01-03T10:00:00.000Z") });

    const rows = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 10,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]!.stageItemId).toBe(ITEM_2); // newer first
    expect(rows[1]!.stageItemId).toBe(ITEM_1);
  });

  it("excludes patients not in patientUserIds", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await port.insertMessage({ ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-01T10:00:00.000Z") });
    await port.insertMessage({ ...makeMsg("", ITEM_2, PATIENT_B, "2026-01-02T10:00:00.000Z") });

    const rows = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.patientUserId).toBe(PATIENT_A);
  });

  it("excludes messages where latest is from admin", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    // patient msg then admin reply → admin is latest → excluded from unread list
    await port.insertMessage({ ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-01T10:00:00.000Z") });
    await port.insertMessage({ ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-02T10:00:00.000Z"), senderRole: "admin" });

    const rows = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("excludes messages where latest has mediaFileId", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await port.insertMessage({
      ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-01T10:00:00.000Z"),
      mediaFileId: "ffffffff-ffff-4fff-8fff-000000000001",
    });

    const rows = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("excludes already-read items (viewer lastReadAt >= message createdAt)", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await port.insertMessage({ ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-01T10:00:00.000Z") });
    // mark read with lastReadAt = exactly the message time
    await port.markRead({ patientUserId: VIEWER, stageItemId: ITEM_1, lastReadAt: "2026-01-01T10:00:00.000Z" });

    const rows = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });

  it("respects keyset cursor", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await port.insertMessage({ ...makeMsg("", ITEM_1, PATIENT_A, "2026-01-01T10:00:00.000Z") });
    await port.insertMessage({ ...makeMsg("", ITEM_2, PATIENT_A, "2026-01-02T10:00:00.000Z") });
    const ITEM_3 = "cccccccc-cccc-4ccc-8ccc-000000000003";
    await port.insertMessage({ ...makeMsg("", ITEM_3, PATIENT_A, "2026-01-03T10:00:00.000Z") });

    const first = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 2,
    });
    expect(first).toHaveLength(2);
    const lastRow = first[1]!;

    const second = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A],
      viewerUserId: VIEWER,
      limit: 10,
      cursor: { createdAt: lastRow.createdAt, id: lastRow.latestMessage.id },
    });
    expect(second).toHaveLength(1);
  });

  it("returns empty for empty patientUserIds", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    const rows = await svc.listUnreadExerciseCommentsForDoctor({
      patientUserIds: [],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(0);
  });
});

describe("listExerciseCommentsForDoctor — inMemory logic", () => {
  it("includes read and unread, newest first", async () => {
    const port = createInMemoryProgramItemDiscussionPort();
    const svc = createProgramItemDiscussionService(port);
    await port.insertMessage({
      instanceStageItemId: ITEM_1,
      patientUserId: PATIENT_A,
      senderRole: "patient",
      origin: "patient_observation",
      body: "old",
      createdAt: "2026-01-01T10:00:00.000Z",
    });
    await port.insertMessage({
      instanceStageItemId: ITEM_2,
      patientUserId: PATIENT_B,
      senderRole: "patient",
      origin: "patient_observation",
      body: "new",
      createdAt: "2026-01-05T10:00:00.000Z",
    });
    // mark ITEM_1 as read
    await port.markRead({ patientUserId: VIEWER, stageItemId: ITEM_1, lastReadAt: "2026-01-02T00:00:00.000Z" });

    const rows = await svc.listExerciseCommentsForDoctor({
      patientUserIds: [PATIENT_A, PATIENT_B],
      viewerUserId: VIEWER,
      limit: 10,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.stageItemId).toBe(ITEM_2);
    expect(rows[1]!.stageItemId).toBe(ITEM_1);
  });
});
