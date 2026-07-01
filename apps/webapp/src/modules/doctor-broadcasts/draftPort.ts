import type { BroadcastAudienceFilter, BroadcastCategory, BroadcastChannel } from "./ports";

export type BroadcastDraft = {
  category: BroadcastCategory | null;
  audience: BroadcastAudienceFilter | null;
  channels: BroadcastChannel[];
  title: string;
  body: string;
  /** RASSL-06 phase 1: опц. прикреплённая картинка (URL из медиабиблиотеки). */
  mediaUrl?: string | null;
  /** MIME картинки (image/jpeg|png|webp). */
  mediaType?: string | null;
};

export type BroadcastDraftPort = {
  loadDraft(doctorUserId: string): Promise<BroadcastDraft | null>;
  saveDraft(doctorUserId: string, draft: BroadcastDraft): Promise<void>;
};

/** Число подключённых получателей по каналу — для плиток каналов в форме рассылки. */
export type BroadcastChannelCounts = {
  /** @legacy alias for telegram (обратная совместимость). */
  bot_message: number;
  telegram: number;
  max: number;
  push: number;
  sms: number;
  email: number;
};

export type BroadcastChannelCountsPort = {
  getChannelConnectionCounts(): Promise<BroadcastChannelCounts>;
  getChannelCountsByUserIds(userIds: readonly string[]): Promise<BroadcastChannelCounts>;
};
