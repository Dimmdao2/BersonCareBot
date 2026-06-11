import { describe, expect, it } from "vitest";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import {
  DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT,
  groupExerciseCommentAttentionByPatient,
  loadDoctorExerciseCommentAttention,
  type DoctorExerciseCommentAttentionDeps,
  type TodayExerciseCommentAttentionItem,
} from "./loadDoctorExerciseCommentAttention";

function client(userId: string, displayName: string): ClientListItem {
  return { userId, displayName } as ClientListItem;
}

function msg(partial: Partial<ProgramItemDiscussionMessage> & Pick<ProgramItemDiscussionMessage, "createdAt">): ProgramItemDiscussionMessage {
  return {
    id: `m-${partial.createdAt}`,
    instanceStageItemId: "item",
    patientUserId: "p",
    senderRole: "patient",
    origin: "patient_observation",
    body: "комментарий",
    mediaFileId: null,
    supportMessageId: null,
    ...partial,
  };
}

function attentionItem(
  partial: Partial<TodayExerciseCommentAttentionItem> &
    Pick<TodayExerciseCommentAttentionItem, "patientUserId" | "patientDisplayName" | "stageItemId">,
): TodayExerciseCommentAttentionItem {
  return {
    instanceId: "inst",
    stageItemTitle: "Упражнение",
    latestMessage: msg({ createdAt: "2026-06-01T10:00:00.000Z" }),
    latestMessageAtLabel: "01.06.2026, 10:00",
    href: "/x",
    ...partial,
  };
}

/**
 * Конфигурируемый стенд: для каждого пациента — активный инстанс с одним exercise-элементом,
 * у которого есть комментарии; последнее сообщение и lastReadAt задаются на стейдж-итем.
 */
function buildDeps(config: {
  doctorUserId?: string;
  byPatient: Record<
    string,
    Array<{ stageItemId: string; title?: string; latest: ProgramItemDiscussionMessage | null; lastReadAt?: string | null }>
  >;
  withInstance?: boolean;
  withDiscussion?: boolean;
}): DoctorExerciseCommentAttentionDeps {
  const { doctorUserId = "doc", byPatient, withInstance = true, withDiscussion = true } = config;
  const latestByStageItem = new Map<string, ProgramItemDiscussionMessage | null>();
  const lastReadByStageItem = new Map<string, string | null>();
  for (const rows of Object.values(byPatient)) {
    for (const r of rows) {
      latestByStageItem.set(r.stageItemId, r.latest);
      lastReadByStageItem.set(r.stageItemId, r.lastReadAt ?? null);
    }
  }

  return {
    doctorUserId,
    treatmentProgramInstance: withInstance
      ? {
          listForPatientClinicalView: async (patientUserId: string) =>
            byPatient[patientUserId]
              ? ([{ id: `inst-${patientUserId}`, status: "active", updatedAt: "2026-06-01T00:00:00.000Z" }] as never)
              : ([] as never),
          getInstanceById: async (instanceId: string) => {
            const patientUserId = instanceId.replace("inst-", "");
            const items = (byPatient[patientUserId] ?? []).map((r) => ({
              id: r.stageItemId,
              status: "active",
              itemType: "exercise",
              snapshot: { title: r.title ?? "Упражнение" },
            }));
            return { stages: [{ items }] } as never;
          },
        }
      : undefined,
    programItemDiscussion: withDiscussion
      ? {
          listAttentionSummaryForStageItems: async (ids: string[]) =>
            ids.map((stageItemId) => ({ stageItemId, comments: 1, media: 0 })),
          listMessagesPage: async ({ stageItemId }: { stageItemId: string }) => {
            const latest = latestByStageItem.get(stageItemId) ?? null;
            return latest ? [latest] : [];
          },
          getLastReadAtForViewer: async ({ stageItemId }: { stageItemId: string }) =>
            lastReadByStageItem.get(stageItemId) ?? null,
        }
      : undefined,
  };
}

describe("groupExerciseCommentAttentionByPatient", () => {
  it("groups by patient, sorts items desc by date and groups by name", () => {
    const groups = groupExerciseCommentAttentionByPatient([
      attentionItem({
        patientUserId: "p2",
        patientDisplayName: "Борис",
        stageItemId: "s-b1",
        latestMessage: msg({ createdAt: "2026-06-02T09:00:00.000Z" }),
      }),
      attentionItem({
        patientUserId: "p1",
        patientDisplayName: "Анна",
        stageItemId: "s-a1",
        latestMessage: msg({ createdAt: "2026-06-01T09:00:00.000Z" }),
      }),
      attentionItem({
        patientUserId: "p1",
        patientDisplayName: "Анна",
        stageItemId: "s-a2",
        latestMessage: msg({ createdAt: "2026-06-03T09:00:00.000Z" }),
      }),
    ]);
    expect(groups.map((g) => g.patientDisplayName)).toEqual(["Анна", "Борис"]);
    expect(groups[0]!.items.map((i) => i.stageItemId)).toEqual(["s-a2", "s-a1"]);
  });
});

describe("loadDoctorExerciseCommentAttention", () => {
  it("returns empty when required deps or clients are missing", async () => {
    expect(
      await loadDoctorExerciseCommentAttention(buildDeps({ byPatient: {}, withDiscussion: false }), [client("p1", "Анна")]),
    ).toEqual({ items: [], total: 0, truncated: false });
    expect(
      await loadDoctorExerciseCommentAttention(buildDeps({ byPatient: {} }), []),
    ).toEqual({ items: [], total: 0, truncated: false });
    expect(
      await loadDoctorExerciseCommentAttention(buildDeps({ doctorUserId: undefined, byPatient: {} }), [
        client("p1", "Анна"),
      ]),
    ).toEqual({ items: [], total: 0, truncated: false });
  });

  it("keeps only unread patient text comments and sorts desc across patients", async () => {
    const deps = buildDeps({
      byPatient: {
        p1: [
          {
            stageItemId: "s-old",
            title: "Планка",
            latest: msg({ createdAt: "2026-06-01T08:00:00.000Z" }),
          },
          // прочитан (createdAt <= lastReadAt) — отбрасывается
          {
            stageItemId: "s-read",
            latest: msg({ createdAt: "2026-06-01T07:00:00.000Z" }),
            lastReadAt: "2026-06-01T07:00:00.000Z",
          },
        ],
        p2: [
          // последнее сообщение от админа — отбрасывается
          {
            stageItemId: "s-admin",
            latest: msg({ createdAt: "2026-06-05T08:00:00.000Z", senderRole: "admin" }),
          },
          // медиа без текста — отбрасывается
          {
            stageItemId: "s-media",
            latest: msg({ createdAt: "2026-06-05T09:00:00.000Z", mediaFileId: "media-1", body: null }),
          },
          {
            stageItemId: "s-new",
            title: "Мостик",
            latest: msg({ createdAt: "2026-06-04T08:00:00.000Z" }),
          },
        ],
      },
    });

    const result = await loadDoctorExerciseCommentAttention(deps, [client("p1", "Анна"), client("p2", "Борис")]);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.items.map((i) => i.stageItemId)).toEqual(["s-new", "s-old"]);
    expect(result.items[0]).toMatchObject({
      patientUserId: "p2",
      patientDisplayName: "Борис",
      stageItemTitle: "Мостик",
      instanceId: "inst-p2",
    });
    expect(result.items[0]!.href).toContain("/treatment-programs/inst-p2");
    expect(result.items[0]!.href).toContain("discussionItem=s-new");
  });

  it("truncates to the preview limit", async () => {
    const rows = Array.from({ length: DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT + 5 }, (_, i) => ({
      stageItemId: `s-${String(i).padStart(2, "0")}`,
      latest: msg({ createdAt: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T08:00:00.000Z` }),
    }));
    const deps = buildDeps({ byPatient: { p1: rows } });
    const result = await loadDoctorExerciseCommentAttention(deps, [client("p1", "Анна")]);
    expect(result.total).toBe(DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT + 5);
    expect(result.items).toHaveLength(DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT);
    expect(result.truncated).toBe(true);
  });
});
