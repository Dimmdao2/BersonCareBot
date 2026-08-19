import { emptyDurationBucketCounts } from '@/modules/platform-analytics/durationBuckets';
import type {
  PlatformAnalyticsPort,
  PlatformAnalyticsSnapshot,
} from '@/modules/platform-analytics/ports';

function emptyNamed() {
  return { now: 0, inPeriod: 0, byDay: new Map<string, number>() };
}

function emptyVolume() {
  return { originalsBytes: 0, videoCount: 0, durationBuckets: emptyDurationBucketCounts() };
}

export function createInMemoryPlatformAnalyticsPort(): PlatformAnalyticsPort {
  return {
    async readSnapshot(): Promise<PlatformAnalyticsSnapshot> {
      return {
        clinics: emptyNamed(),
        specialists: emptyNamed(),
        patients: emptyNamed(),
        pageViews: [],
        bookings: { created: 0, cancelled: 0 },
        programsAssigned: 0,
        clinicalVisits: 0,
        cmsArticlesCreated: 0,
        exercises: {
          created: 0,
          creators: 0,
          personal: 0,
          catalog: 0,
          videoFiles: 0,
          videoIframe: 0,
        },
        videoVolumeExercises: emptyVolume(),
        videoVolumeCms: emptyVolume(),
        completions: { completions: 0, withRepsOrDifficulty: 0 },
        homeWellbeingMarks: 0,
        programActivity: { patientsWithProgram: 0, visitDaysSum: 0, markDaysSum: 0 },
        playback: {
          viewsTotal: 0,
          viewsUnique: 0,
          hlsResolves: 0,
          mp4Resolves: 0,
          playbackErrors: 0,
          byDay: new Map<string, number>(),
        },
      };
    },
  };
}
