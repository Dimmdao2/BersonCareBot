import { describe, expect, it } from "vitest";
import type { DoctorExerciseCommentRow } from "@/modules/program-item-discussion/types";
import {
  loadDoctorExerciseCommentsForTab,
  DOCTOR_EXERCISE_COMMENTS_TAB_PAGE_SIZE,
} from "./loadDoctorExerciseCommentsForTab";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const VIEWER = "00000000-0000-4000-8000-00000000000d";
const INST = "00000000-0000-4000-8000-bbbb00000001";

function makeRow(
  patientUserId: string,
  stageItemId: string,
  createdAt: string,
  msgId = "00000000-0000-4000-8000-cccc00000001",
): DoctorExerciseCommentRow {
  return {
    patientUserId,
    instanceId: INST,
    stageItemId,
    stageItemTitle: "Упражнение на растяжку",
    latestMessage: {
      id: msgId,
      instanceStageItemId: stageItemId,
      patientUserId,
      senderRole: "patient",
      origin: "patient_observation",
      body: "Немного болит нога",
      mediaFileId: null,
      supportMessageId: null,
      createdAt,
    },
    createdAt,
  };
}

function makeDeps(
  onSupportIds: string[],
  rows: DoctorExerciseCommentRow[],
) {
  return {
    doctorClientsPort: {
      listClients: async (_filters: unknown, _audience?: unknown) =>
        onSupportIds.map((id, i) => ({ userId: id, displayName: `Пациент ${i + 1}` })),
    },
    programItemDiscussion: {
      listUnreadExerciseCommentsForDoctor: async (_input: unknown) => rows,
    },
  };
}

describe("loadDoctorExerciseCommentsForTab", () => {
  it("returns empty result when on-support list is empty", async () => {
    const deps = makeDeps([], []);
    const result = await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER });
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("does not call listUnreadExerciseCommentsForDoctor when on-support is empty", async () => {
    let called = false;
    const deps = {
      doctorClientsPort: { listClients: async () => [] },
      programItemDiscussion: {
        listUnreadExerciseCommentsForDoctor: async () => {
          called = true;
          return [];
        },
      },
    };
    await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER });
    expect(called).toBe(false);
  });

  it("enriches items with patientDisplayName, href, latestMessageAtLabel", async () => {
    const row = makeRow(P1, "00000000-0000-4000-8000-aaa000000001", "2026-06-11T10:00:00.000Z");
    const deps = makeDeps([P1], [row]);

    const { items } = await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER });

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.patientDisplayName).toBe("Пациент 1");
    expect(item.stageItemId).toBe(row.stageItemId);
    expect(item.instanceId).toBe(INST);
    expect(item.href).toContain(P1);
    expect(item.href).toContain(INST);
    expect(item.href).toContain("discussionItem");
    expect(item.latestMessageAtLabel).toBeTruthy();
    expect(item.latestMessage.body).toBe("Немного болит нога");
  });

  it("unread items are in port order (newest first)", async () => {
    const row1 = makeRow(P1, "00000000-0000-4000-8000-aaa000000001", "2026-06-11T10:00:00.000Z");
    const row2 = makeRow(P2, "00000000-0000-4000-8000-aaa000000002", "2026-06-11T09:00:00.000Z");
    const deps = makeDeps([P1, P2], [row1, row2]);

    const { items } = await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER });

    expect(items).toHaveLength(2);
    expect(items[0]?.patientDisplayName).toBe("Пациент 1");
    expect(items[1]?.patientDisplayName).toBe("Пациент 2");
  });

  it("paginates: hasMore=true and nextCursor set when port returns limit+1 rows", async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeRow(
        P1,
        `00000000-0000-4000-8000-aaa00000000${i + 1}`,
        `2026-06-11T10:0${i}:00.000Z`,
        `00000000-0000-4000-8000-ccc00000000${i + 1}`,
      ),
    );
    const deps = makeDeps([P1], rows);

    const result = await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER }, { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    expect(result.nextCursor?.createdAt).toBe(rows[1]!.createdAt);
    expect(result.nextCursor?.id).toBe(rows[1]!.latestMessage.id);
  });

  it("nextCursor is null when all rows fit in page", async () => {
    const rows = [makeRow(P1, "00000000-0000-4000-8000-aaa000000001", "2026-06-11T10:00:00.000Z")];
    const deps = makeDeps([P1], rows);

    const result = await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER }, { limit: 2 });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("passes analytics excludedUserIds as audience to listClients", async () => {
    let capturedAudience: unknown;
    const deps = {
      doctorClientsPort: {
        listClients: async (_: unknown, audience: unknown) => {
          capturedAudience = audience;
          return [];
        },
      },
      programItemDiscussion: {
        listUnreadExerciseCommentsForDoctor: async () => [],
      },
    };

    await loadDoctorExerciseCommentsForTab(
      deps,
      { viewerUserId: VIEWER, excludedUserIds: ["00000000-0000-4000-8000-eeee00000001"] },
    );

    expect(capturedAudience).toEqual({ excludedUserIds: ["00000000-0000-4000-8000-eeee00000001"] });
  });

  it("passes no audience when excludedUserIds is empty", async () => {
    let capturedAudience: unknown = "NOT_CALLED";
    const deps = {
      doctorClientsPort: {
        listClients: async (_: unknown, audience: unknown) => {
          capturedAudience = audience;
          return [];
        },
      },
      programItemDiscussion: {
        listUnreadExerciseCommentsForDoctor: async () => [],
      },
    };

    await loadDoctorExerciseCommentsForTab(deps, { viewerUserId: VIEWER, excludedUserIds: [] });

    expect(capturedAudience).toBeUndefined();
  });

  it("uses default page size constant", async () => {
    expect(DOCTOR_EXERCISE_COMMENTS_TAB_PAGE_SIZE).toBeGreaterThan(0);
  });
});
