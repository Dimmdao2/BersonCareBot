import type { TreatmentProgramEventRow } from "@/modules/treatment-program/types";
import {
  shouldOmitTreatmentProgramEventFromDoctorTimeline,
  summarizeTreatmentProgramEventForDoctorRu,
} from "@/modules/treatment-program/types";

export type DoctorClientRecentProgramChangeRow = {
  id: string;
  createdAt: string;
  summary: string;
};

const RECENT_PROGRAM_CHANGES_LIMIT = 5;

export function buildDoctorClientRecentProgramChanges(input: {
  events: TreatmentProgramEventRow[];
  itemTitle?: (itemId: string) => string | undefined;
  stageTitle?: (stageId: string) => string | undefined;
}): DoctorClientRecentProgramChangeRow[] {
  const labels = {
    itemTitle: input.itemTitle ?? (() => undefined),
    stageTitle: input.stageTitle ?? (() => undefined),
  };

  return input.events
    .filter((e) => !shouldOmitTreatmentProgramEventFromDoctorTimeline(e))
    .slice(-RECENT_PROGRAM_CHANGES_LIMIT)
    .reverse()
    .map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      summary: summarizeTreatmentProgramEventForDoctorRu(e, labels),
    }));
}
