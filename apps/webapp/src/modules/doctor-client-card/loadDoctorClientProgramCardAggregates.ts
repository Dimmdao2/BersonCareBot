import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type { TreatmentProgramInstancePort } from "@/modules/treatment-program/ports";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { countDiscussionAttentionFromMessages } from "./countDiscussionAttention";
import type { DoctorClientProgramCardAggregates } from "./types";

export type LoadDoctorClientProgramCardAggregatesDeps = {
  treatmentProgramInstance: {
    getInstanceById(instanceId: string): Promise<{
      stages: { items: { id: string; status: string }[] }[];
    } | null>;
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

const EMPTY: DoctorClientProgramCardAggregates = {
  newCommentsCount: 0,
  patientMediaCount: 0,
  planNotOpened: false,
  lastPlanMutationEventAt: null,
};

export async function loadDoctorClientProgramCardAggregates(
  deps: LoadDoctorClientProgramCardAggregatesDeps,
  patientUserId: string,
  instances: TreatmentProgramInstanceSummary[],
): Promise<DoctorClientProgramCardAggregates> {
  const active = pickActivePlanInstance(instances);
  if (!active) return EMPTY;

  const [badge, detail] = await Promise.all([
    deps.treatmentProgramInstance.patientPlanUpdatedBadgeForInstance({
      patientUserId,
      instanceId: active.id,
    }),
    deps.treatmentProgramInstance.getInstanceById(active.id),
  ]);

  let newCommentsCount = 0;
  let patientMediaCount = 0;

  if (detail) {
    const itemIds = detail.stages.flatMap((s) =>
      s.items.filter((i) => i.status === "active").map((i) => i.id),
    );
    const counts = await Promise.all(
      itemIds.map(async (stageItemId) => {
        const messages = await deps.programItemDiscussion.listMessagesForStageItem(
          stageItemId,
          50,
          0,
        );
        return countDiscussionAttentionFromMessages(messages);
      }),
    );
    for (const c of counts) {
      newCommentsCount += c.comments;
      patientMediaCount += c.media;
    }
  }

  return {
    newCommentsCount,
    patientMediaCount,
    planNotOpened: badge.show,
    lastPlanMutationEventAt: badge.eventIso,
  };
}
