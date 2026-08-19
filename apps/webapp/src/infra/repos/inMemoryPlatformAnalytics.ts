import { emptyDurationBucketCounts } from '@/modules/platform-analytics/durationBuckets';
import type { PlatformAnalyticsPort } from '@/modules/platform-analytics/ports';

function emptyNamed() {
  return { now: 0, inPeriod: 0, byDay: new Map<string, number>() };
}

export function createInMemoryPlatformAnalyticsPort(): PlatformAnalyticsPort {
  return {
    async countClinics() {
      return emptyNamed();
    },
    async countSpecialists() {
      return emptyNamed();
    },
    async countPatients() {
      return emptyNamed();
    },
    async listPageViews() {
      return [];
    },
    async countBookings() {
      return { created: 0, cancelled: 0 };
    },
    async countProgramsAssigned() {
      return 0;
    },
    async countClinicalVisits() {
      return 0;
    },
    async countCmsArticles() {
      return 0;
    },
    async countExercises() {
      return {
        created: 0,
        creators: 0,
        personal: 0,
        catalog: 0,
        videoFiles: 0,
        videoIframe: 0,
      };
    },
    async videoVolumeExercises() {
      return { originalsBytes: 0, videoCount: 0, durationBuckets: emptyDurationBucketCounts() };
    },
    async videoVolumeCms() {
      return { originalsBytes: 0, videoCount: 0, durationBuckets: emptyDurationBucketCounts() };
    },
    async countCompletions() {
      return { completions: 0, withRepsOrDifficulty: 0 };
    },
    async countHomeWellbeing() {
      return 0;
    },
    async programActivity() {
      return {
        patientsWithProgram: 0,
        visitDaysSum: 0,
        markDaysSum: 0,
        patientsWithVisitDays: 0,
      };
    },
    async videoPlayback() {
      return {
        viewsTotal: 0,
        viewsUnique: 0,
        hlsResolves: 0,
        mp4Resolves: 0,
        playbackErrors: 0,
      };
    },
  };
}
