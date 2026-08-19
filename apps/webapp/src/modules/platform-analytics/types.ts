import type { AdminStatsTimePreset } from '@/modules/admin-platform-stats/types';
import type { VideoDurationBucket } from '@/modules/platform-analytics/durationBuckets';
import type { PlatformEntryChannel } from '@/modules/platform-analytics/entryChannels';
import type { PlatformAnalyticsAudienceSpec } from '@/modules/platform-analytics/ports';

export type PlatformAnalyticsRangeInput = {
  iana: string;
  preset: AdminStatsTimePreset;
  customFrom?: string;
  customTo?: string;
  audience: PlatformAnalyticsAudienceSpec;
};

export type DayCountPoint = {
  day: string;
  count: number;
};

export type NamedDaySeries = {
  now: number;
  inPeriod: number;
  series: DayCountPoint[];
};

export type TopPageEntry = {
  pageKey: string;
  views: number;
};

export type PageViewSlice = {
  /**
   * Приём событий для этой аудитории существует. `false` — цифры не «ноль заходов», а
   * «не измеряется»; экран обязан показать заглушку, а не уверенный ноль.
   */
  ingestAvailable: boolean;
  pageViews: number;
  cabinetViews: number;
  byChannel: Record<PlatformEntryChannel, number>;
  topPages: TopPageEntry[];
};

export type VideoVolumeSlice = {
  originalsBytes: number;
  videoCount: number;
  averageBytes: number | null;
  durationBuckets: Record<VideoDurationBucket, number>;
  transcodeBytes: null;
};

export type PlatformAnalyticsDashboard = {
  iana: string;
  fromDay: string;
  toDay: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  clients: {
    clinics: NamedDaySeries;
    specialists: NamedDaySeries;
    patients: NamedDaySeries;
  };
  visits: {
    doctor: PageViewSlice;
    patient: PageViewSlice;
  };
  bookings: {
    created: number;
    cancelled: number;
  };
  programsAssigned: number;
  clinicalVisits: number;
  cmsArticlesCreated: number;
  exercises: {
    created: number;
    creators: number;
    averagePerCreator: number | null;
    personal: number;
    catalog: number;
    videoFiles: number;
    videoIframe: number;
  };
  videoVolume: {
    exercises: VideoVolumeSlice;
    cms: VideoVolumeSlice;
  };
  patientActivity: {
    completions: number;
    completionsWithRepsOrDifficulty: number;
    homeWellbeingMarks: number;
    symptomDiary: null;
    programActivity: {
      patientsWithProgram: number;
      avgVisitDays: number | null;
      avgMarkDays: number | null;
      avgMarkShareOfVisitDays: number | null;
    };
    videoViewsTotal: number;
    videoViewsUnique: number;
    hlsResolves: number;
    mp4Resolves: number;
    playbackErrors: number;
    /** GA-A-08a «просмотры файла … ряд» — выдачи видео по дням выбранного периода. */
    playbackSeries: DayCountPoint[];
    hostingIframeShown: null;
  };
};

export const VIDEO_DURATION_BUCKET_LABELS: Record<VideoDurationBucket, string> = {
  le3: 'до 3 мин',
  m3_5: '3–5 мин',
  m5_7: '5–7 мин',
  m7_10: '7–10 мин',
  m10_15: '10–15 мин',
  m15_20: '15–20 мин',
  over20: 'дольше 20 мин',
  unknown: 'длительность неизвестна',
};
