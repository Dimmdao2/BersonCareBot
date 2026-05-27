export type PatientDailyWarmupPresentationPort = {
  getPresentedContentPageId(userId: string): Promise<string | null>;
  setPresentedContentPageId(userId: string, contentPageId: string): Promise<void>;
};
