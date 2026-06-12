import type { BroadcastDraftPort, BroadcastDraft } from "@/modules/doctor-broadcasts/draftPort";

export function createInMemoryBroadcastDraftPort(): BroadcastDraftPort {
  const byDoctor = new Map<string, BroadcastDraft>();

  return {
    async loadDraft(doctorUserId: string): Promise<BroadcastDraft | null> {
      const draft = byDoctor.get(doctorUserId);
      return draft ? { ...draft, channels: [...draft.channels] } : null;
    },

    async saveDraft(doctorUserId: string, draft: BroadcastDraft): Promise<void> {
      byDoctor.set(doctorUserId, { ...draft, channels: [...draft.channels] });
    },
  };
}
