import type { DailyWarmupPresentationState } from "@/modules/patient-home/dailyWarmupPresentationPorts";
import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";

export function applyDailyWarmupScheduledRotations(params: {
  pages: ReadonlyArray<{ contentPageId: string }>;
  initialState: DailyWarmupPresentationState;
  slotInstants: readonly string[];
}): DailyWarmupPresentationState {
  if (params.pages.length === 0 || params.slotInstants.length === 0) {
    return params.initialState;
  }

  let state = { ...params.initialState };
  for (const slotInstant of params.slotInstants) {
    if (state.skipNextScheduledRotation) {
      state = {
        ...state,
        skipNextScheduledRotation: false,
        lastRotationAt: slotInstant,
      };
    } else {
      const nextIndex = pickDailyWarmupFromOrderedList(params.pages, state.contentPageId);
      const nextId = params.pages[nextIndex]?.contentPageId;
      if (!nextId) continue;
      state = {
        contentPageId: nextId,
        lastRotationAt: slotInstant,
        skipNextScheduledRotation: false,
      };
    }
  }
  return state;
}
