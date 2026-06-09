export type DailyWarmupPresentationState = {
  contentPageId: string;
  lastRotationAt: string | null;
  skipNextScheduledRotation: boolean;
};

export type PatientDailyWarmupPresentationPort = {
  getPresentationState(userId: string): Promise<DailyWarmupPresentationState | null>;
  upsertPresentationState(userId: string, state: DailyWarmupPresentationState): Promise<void>;
  /** @deprecated use getPresentationState */
  getPresentedContentPageId(userId: string): Promise<string | null>;
  /** @deprecated use upsertPresentationState */
  setPresentedContentPageId(userId: string, contentPageId: string): Promise<void>;
};
