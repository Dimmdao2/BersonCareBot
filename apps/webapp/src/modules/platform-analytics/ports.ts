import type { PlatformAnalyticsDashboard } from '@/modules/platform-analytics/types';
import type { VideoDurationBucket } from '@/modules/platform-analytics/durationBuckets';

export type PlatformAnalyticsWindow = {
  iana: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  dayKeys: string[];
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
  patientsWithVisitDays: number;
};

export type PlatformAnalyticsPort = {
  countClinics(window: PlatformAnalyticsWindow): Promise<NamedCountRaw>;
  countSpecialists(window: PlatformAnalyticsWindow): Promise<NamedCountRaw>;
  countPatients(window: PlatformAnalyticsWindow): Promise<NamedCountRaw>;
  listPageViews(window: PlatformAnalyticsWindow): Promise<PageViewRaw[]>;
  countBookings(window: PlatformAnalyticsWindow): Promise<{ created: number; cancelled: number }>;
  countProgramsAssigned(window: PlatformAnalyticsWindow): Promise<number>;
  countClinicalVisits(window: PlatformAnalyticsWindow): Promise<number>;
  countCmsArticles(window: PlatformAnalyticsWindow): Promise<number>;
  countExercises(window: PlatformAnalyticsWindow): Promise<ExerciseSplitRaw>;
  videoVolumeExercises(window: PlatformAnalyticsWindow): Promise<VideoVolumeRaw>;
  videoVolumeCms(window: PlatformAnalyticsWindow): Promise<VideoVolumeRaw>;
  countCompletions(window: PlatformAnalyticsWindow): Promise<{
    completions: number;
    withRepsOrDifficulty: number;
  }>;
  countHomeWellbeing(window: PlatformAnalyticsWindow): Promise<number>;
  programActivity(window: PlatformAnalyticsWindow): Promise<ProgramActivityRaw>;
  videoPlayback(window: PlatformAnalyticsWindow): Promise<{
    viewsTotal: number;
    viewsUnique: number;
    hlsResolves: number;
    mp4Resolves: number;
    playbackErrors: number;
  }>;
};

export type PlatformAnalyticsDashboardParams = PlatformAnalyticsWindow & {
  fromDay: string;
  toDay: string;
};

export type { PlatformAnalyticsDashboard };
