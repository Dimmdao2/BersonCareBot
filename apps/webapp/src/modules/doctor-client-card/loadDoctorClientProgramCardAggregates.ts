import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceSummary, TreatmentProgramEventRow } from "@/modules/treatment-program/types";
import { buildDoctorClientActiveProgramTree } from "./buildDoctorClientActiveProgramTree";
import { buildDoctorClientCarePlanOverview } from "./buildDoctorClientCarePlanOverview";
import { buildDoctorClientRecentProgramChanges } from "./buildDoctorClientRecentProgramChanges";
import { countDiscussionAttentionFromMessages } from "./countDiscussionAttention";
import type {
  DoctorClientProgramCardAggregates,
  DoctorClientProgramCardData,
  DoctorClientProgramInboxRow,
  DoctorClientRecentProgramChangeRow,
} from "./types";

export type LoadDoctorClientProgramCardAggregatesDeps = {
  treatmentProgramInstance: {
    getInstanceById(id: string): Promise<TreatmentProgramInstanceDetail | null>;
    listProgramEvents(instanceId: string): Promise<TreatmentProgramEventRow[]>;
    patientPlanUpdatedBadgeForInstance(input: {
      patientUserId: string;
      instanceId: string;
    }): Promise<{ show: boolean; eventIso: string | null }>;
  };
  programItemDiscussion: {
    listMessagesForStageItem(
      stageItemId: string,
      limit?: number,
      offset?: number,
    ): Promise<Awaited<ReturnType<ProgramItemDiscussionPort["listMessagesForStageItem"]>>>;
  };
};

const EMPTY_AGGREGATES: DoctorClientProgramCardAggregates = {
  newCommentsCount: 0,
  patientMediaCount: 0,
  planNotOpened: false,
  lastPlanMutationEventAt: null,
};

const EMPTY_DATA: DoctorClientProgramCardData = {
  aggregates: EMPTY_AGGREGATES,
  carePlan: null,
  activeProgramTree: null,
  programInbox: [],
  recentProgramChanges: [],
};

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t.trim();
  return itemType;
}

function collectAttentionForActiveItems(
  detail: TreatmentProgramInstanceDetail,
  instanceId: string,
  listMessagesForStageItem: LoadDoctorClientProgramCardAggregatesDeps["programItemDiscussion"]["listMessagesForStageItem"],
): Promise<{
  aggregates: Pick<DoctorClientProgramCardAggregates, "newCommentsCount" | "patientMediaCount">;
  programInbox: DoctorClientProgramInboxRow[];
}> {
  const activeItems = detail.stages.flatMap((s) =>
    s.items
      .filter((i) => i.status === "active")
      .map((i) => ({ ...i, stageId: s.id })),
  );

  return Promise.all(
    activeItems.map(async (item) => {
      const messages = await listMessagesForStageItem(item.id, 50, 0);
      const counts = countDiscussionAttentionFromMessages(messages);
      return { item, counts };
    }),
  ).then((rows) => {
    let newCommentsCount = 0;
    let patientMediaCount = 0;
    const programInbox: DoctorClientProgramInboxRow[] = [];
    const title = (it: (typeof activeItems)[number]) =>
      snapshotTitle(it.snapshot, it.itemType);

    for (const { item, counts } of rows) {
      newCommentsCount += counts.comments;
      patientMediaCount += counts.media;
      if (counts.comments > 0) {
        programInbox.push({
          stageItemId: item.id,
          instanceId,
          title: title(item),
          kind: "comment",
        });
      }
      if (counts.media > 0) {
        programInbox.push({
          stageItemId: item.id,
          instanceId,
          title: title(item),
          kind: "media",
        });
      }
    }

    programInbox.sort((a, b) => a.title.localeCompare(b.title, "ru") || a.stageItemId.localeCompare(b.stageItemId));

    return { aggregates: { newCommentsCount, patientMediaCount }, programInbox };
  });
}

export async function loadDoctorClientProgramCardData(
  deps: LoadDoctorClientProgramCardAggregatesDeps,
  patientUserId: string,
  instances: TreatmentProgramInstanceSummary[],
): Promise<DoctorClientProgramCardData> {
  const active = pickActivePlanInstance(instances);
  if (!active) return EMPTY_DATA;

  const [badge, detail, events] = await Promise.all([
    deps.treatmentProgramInstance.patientPlanUpdatedBadgeForInstance({
      patientUserId,
      instanceId: active.id,
    }),
    deps.treatmentProgramInstance.getInstanceById(active.id),
    deps.treatmentProgramInstance.listProgramEvents(active.id),
  ]);

  if (!detail) {
    return {
      aggregates: {
        ...EMPTY_AGGREGATES,
        planNotOpened: badge.show,
        lastPlanMutationEventAt: badge.eventIso,
      },
      carePlan: null,
      activeProgramTree: null,
      programInbox: [],
      recentProgramChanges: [],
    };
  }

  const itemTitle = (id: string) => {
    for (const st of detail.stages) {
      for (const it of st.items) {
        if (it.id === id) return snapshotTitle(it.snapshot, it.itemType);
      }
    }
    return undefined;
  };
  const stageTitle = (id: string) => detail.stages.find((s) => s.id === id)?.title ?? undefined;

  const recentProgramChanges: DoctorClientRecentProgramChangeRow[] = buildDoctorClientRecentProgramChanges({
    events,
    itemTitle,
    stageTitle,
  });

  const { aggregates: attention, programInbox } = await collectAttentionForActiveItems(
    detail,
    active.id,
    deps.programItemDiscussion.listMessagesForStageItem,
  );

  return {
    aggregates: {
      ...attention,
      planNotOpened: badge.show,
      lastPlanMutationEventAt: badge.eventIso,
    },
    carePlan: buildDoctorClientCarePlanOverview(detail),
    activeProgramTree: buildDoctorClientActiveProgramTree(detail),
    programInbox,
    recentProgramChanges,
  };
}

/** @deprecated Используйте {@link loadDoctorClientProgramCardData}. */
export async function loadDoctorClientProgramCardAggregates(
  deps: LoadDoctorClientProgramCardAggregatesDeps,
  patientUserId: string,
  instances: TreatmentProgramInstanceSummary[],
): Promise<DoctorClientProgramCardAggregates> {
  const data = await loadDoctorClientProgramCardData(deps, patientUserId, instances);
  return data.aggregates;
}
