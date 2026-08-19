import type { PlatformAnalyticsDashboard } from '@/modules/platform-analytics/types';
import type { VideoDurationBucket } from '@/modules/platform-analytics/durationBuckets';

/**
 * Тестовые/служебные учётки, которые не должны попадать в платформенные цифры. Приходят
 * идентификаторами, а не готовым списком id: список id резолвится по `platform_users` и
 * `user_channel_bindings`, а у платформенного принципала на них нет прав — резолв живёт за той же
 * дверью, что и сами агрегаты.
 */
export type PlatformAnalyticsAudienceSpec = {
  includeTestAccounts: boolean;
  testPhones: string[];
  testTelegramIds: string[];
  testMaxIds: string[];
};

export type PlatformAnalyticsWindow = {
  iana: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  dayKeys: string[];
  audience: PlatformAnalyticsAudienceSpec;
};

export type NamedCountRaw = {
  now: number;
  inPeriod: number;
  byDay: Map<string, number>;
};

export type PageViewRaw = {
  pageKey: string;
  entryChannel: string;
  views: number;
};

export type ExerciseSplitRaw = {
  created: number;
  creators: number;
  personal: number;
  catalog: number;
  videoFiles: number;
  videoIframe: number;
};

export type VideoVolumeRaw = {
  originalsBytes: number;
  videoCount: number;
  durationBuckets: Record<VideoDurationBucket, number>;
};

export type ProgramActivityRaw = {
  patientsWithProgram: number;
  visitDaysSum: number;
  markDaysSum: number;
};

export type VideoPlaybackRaw = {
  viewsTotal: number;
  viewsUnique: number;
  hlsResolves: number;
  mp4Resolves: number;
  playbackErrors: number;
  byDay: Map<string, number>;
};

/** Один снимок дашборда: все цифры сняты в один момент и не расходятся между собой. */
export type PlatformAnalyticsSnapshot = {
  clinics: NamedCountRaw;
  specialists: NamedCountRaw;
  patients: NamedCountRaw;
  pageViews: PageViewRaw[];
  bookings: { created: number; cancelled: number };
  programsAssigned: number;
  clinicalVisits: number;
  cmsArticlesCreated: number;
  exercises: ExerciseSplitRaw;
  videoVolumeExercises: VideoVolumeRaw;
  videoVolumeCms: VideoVolumeRaw;
  completions: { completions: number; withRepsOrDifficulty: number };
  homeWellbeingMarks: number;
  programActivity: ProgramActivityRaw;
  playback: VideoPlaybackRaw;
};

export type PlatformAnalyticsPort = {
  readSnapshot(window: PlatformAnalyticsWindow): Promise<PlatformAnalyticsSnapshot>;
};

export type { PlatformAnalyticsDashboard };
