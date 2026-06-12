import type { BroadcastAudienceFilter, BroadcastCategory, BroadcastChannel } from "./ports";

export type BroadcastDraft = {
  category: BroadcastCategory | null;
  audience: BroadcastAudienceFilter | null;
  channels: BroadcastChannel[];
  title: string;
  body: string;
};

export type BroadcastDraftPort = {
  loadDraft(doctorUserId: string): Promise<BroadcastDraft | null>;
  saveDraft(doctorUserId: string, draft: BroadcastDraft): Promise<void>;
};

/** Число подключённых получателей по каналу — для плиток каналов в форме рассылки. */
export type BroadcastChannelCounts = {
  bot_message: number;
  sms: number;
  push: number;
};

export type BroadcastChannelCountsPort = {
  getChannelConnectionCounts(): Promise<BroadcastChannelCounts>;
};
