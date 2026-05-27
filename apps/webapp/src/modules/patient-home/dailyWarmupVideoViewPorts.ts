export type PatientDailyWarmupVideoViewPort = {
  recordView(userId: string, contentPageId: string): Promise<void>;
};
