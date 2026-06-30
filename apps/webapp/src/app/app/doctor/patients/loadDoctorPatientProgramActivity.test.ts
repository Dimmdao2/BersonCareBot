import { describe, expect, it, vi } from "vitest";
import { loadDoctorPatientProgramActivity } from "./loadDoctorPatientProgramActivity";
import type { DoctorExerciseCommentRow } from "@/modules/program-item-discussion/types";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const DOCTOR = "22222222-2222-2222-2222-222222222222";

function row(over: Partial<DoctorExerciseCommentRow> & { createdAt: string }): DoctorExerciseCommentRow {
  return {
    patientUserId: PATIENT,
    instanceId: "inst-1",
    stageItemId: "si-1",
    stageItemTitle: "Приседания",
    latestMessage: {
      id: "m-1",
      instanceStageItemId: "si-1",
      patientUserId: PATIENT,
      senderRole: "patient",
      origin: "patient_observation",
      body: "стало легче",
      mediaFileId: null,
      supportMessageId: null,
      createdAt: over.createdAt,
    },
    ...over,
  };
}

describe("loadDoctorPatientProgramActivity", () => {
  it("scopes both queries to the single patient as viewer = doctor", async () => {
    const listUnreadExerciseCommentsForDoctor = vi.fn().mockResolvedValue([]);
    const listExerciseCommentsForDoctor = vi.fn().mockResolvedValue([]);
    await loadDoctorPatientProgramActivity(
      { programItemDiscussion: { listUnreadExerciseCommentsForDoctor, listExerciseCommentsForDoctor } },
      { patientUserId: PATIENT, viewerUserId: DOCTOR },
    );
    expect(listUnreadExerciseCommentsForDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ patientUserIds: [PATIENT], viewerUserId: DOCTOR }),
    );
    expect(listExerciseCommentsForDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ patientUserIds: [PATIENT], viewerUserId: DOCTOR, limit: 1 }),
    );
  });

  it("unreadCount = number of exercises with unread marks; lastMark = newest patient comment", async () => {
    const activity = await loadDoctorPatientProgramActivity(
      {
        programItemDiscussion: {
          listUnreadExerciseCommentsForDoctor: vi
            .fn()
            .mockResolvedValue([
              row({ stageItemId: "si-1", createdAt: "2026-01-10T09:00:00.000Z" }),
              row({ stageItemId: "si-2", createdAt: "2026-01-09T09:00:00.000Z" }),
            ]),
          listExerciseCommentsForDoctor: vi
            .fn()
            .mockResolvedValue([
              row({ stageItemTitle: "Выпады", createdAt: "2026-01-12T15:30:00.000Z" }),
            ]),
        },
      },
      { patientUserId: PATIENT, viewerUserId: DOCTOR },
    );
    expect(activity.unreadCount).toBe(2);
    expect(activity.lastMark).toMatchObject({
      atIso: "2026-01-12T15:30:00.000Z",
      stageItemTitle: "Выпады",
      body: "стало легче",
    });
    expect(activity.lastMark?.atLabel).toBeTruthy();
  });

  it("returns zero unread and null lastMark when there are no marks", async () => {
    const activity = await loadDoctorPatientProgramActivity(
      {
        programItemDiscussion: {
          listUnreadExerciseCommentsForDoctor: vi.fn().mockResolvedValue([]),
          listExerciseCommentsForDoctor: vi.fn().mockResolvedValue([]),
        },
      },
      { patientUserId: PATIENT, viewerUserId: DOCTOR },
    );
    expect(activity).toEqual({ unreadCount: 0, lastMark: null });
  });
});
