import { resolveAdminStatsLocalRange } from '@/modules/admin-platform-stats/registrationTimeRange';
import {
  isDoctorCabinetPageKey,
  isPatientCabinetPageKey,
  pageAudienceFromPageKey,
} from '@/modules/platform-analytics/pageAudience';
import type { PlatformAnalyticsPort, VideoVolumeRaw } from '@/modules/platform-analytics/ports';
import type {
  NamedDaySeries,
  PageViewSlice,
  PlatformAnalyticsDashboard,
  PlatformAnalyticsRangeInput,
  VideoVolumeSlice,
} from '@/modules/platform-analytics/types';

const APP_CHANNELS = new Set(['pwa', 'telegram', 'max']);

function seriesFromRaw(
  dayKeys: string[],
  raw: { now: number; inPeriod: number; byDay: Map<string, number> },
): NamedDaySeries {
  return {
    now: raw.now,
    inPeriod: raw.inPeriod,
    series: dayKeys.map((day) => ({ day, count: raw.byDay.get(day) ?? 0 })),
  };
}

function pageSlice(rows: { pageKey: string; entryChannel: string; views: number }[]): PageViewSlice {
  const byPage = new Map<string, number>();
  let pageViews = 0;
  let cabinetViews = 0;
  let appChannelViews = 0;
  let siteChannelViews = 0;
  for (const row of rows) {
    pageViews += row.views;
    byPage.set(row.pageKey, (byPage.get(row.pageKey) ?? 0) + row.views);
    if (APP_CHANNELS.has(row.entryChannel)) appChannelViews += row.views;
    if (row.entryChannel === 'browser') siteChannelViews += row.views;
  }
  const topPages = [...byPage.entries()]
    .map(([pageKey, views]) => ({ pageKey, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);
  return { pageViews, cabinetViews, appChannelViews, siteChannelViews, topPages };
}

function withCabinet(
  slice: PageViewSlice,
  rows: { pageKey: string; views: number }[],
  isCabinet: (pageKey: string) => boolean,
): PageViewSlice {
  let cabinetViews = 0;
  for (const row of rows) {
    if (isCabinet(row.pageKey)) cabinetViews += row.views;
  }
  return { ...slice, cabinetViews };
}

function volumeSlice(raw: VideoVolumeRaw): VideoVolumeSlice {
  return {
    originalsBytes: raw.originalsBytes,
    videoCount: raw.videoCount,
    averageBytes: raw.videoCount > 0 ? raw.originalsBytes / raw.videoCount : null,
    durationBuckets: raw.durationBuckets,
    transcodeBytes: null,
  };
}

export function createPlatformAnalyticsService(port: PlatformAnalyticsPort) {
  return {
    async getDashboard(input: PlatformAnalyticsRangeInput): Promise<PlatformAnalyticsDashboard> {
      const { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys } =
        resolveAdminStatsLocalRange(input.iana, input.preset, input.customFrom, input.customTo);
      const window = { iana: input.iana, startUtcIso, endExclusiveUtcIso, dayKeys };

      const [
        clinics,
        specialists,
        patients,
        pageViews,
        bookings,
        programsAssigned,
        clinicalVisits,
        cmsArticlesCreated,
        exercises,
        exerciseVolume,
        cmsVolume,
        completions,
        homeWellbeingMarks,
        programActivity,
        playback,
      ] = await Promise.all([
        port.countClinics(window),
        port.countSpecialists(window),
        port.countPatients(window),
        port.listPageViews(window),
        port.countBookings(window),
        port.countProgramsAssigned(window),
        port.countClinicalVisits(window),
        port.countCmsArticles(window),
        port.countExercises(window),
        port.videoVolumeExercises(window),
        port.videoVolumeCms(window),
        port.countCompletions(window),
        port.countHomeWellbeing(window),
        port.programActivity(window),
        port.videoPlayback(window),
      ]);

      const doctorRows = pageViews.filter((row) => pageAudienceFromPageKey(row.pageKey) === 'doctor');
      const patientRows = pageViews.filter((row) => pageAudienceFromPageKey(row.pageKey) === 'patient');
      const doctor = withCabinet(pageSlice(doctorRows), doctorRows, isDoctorCabinetPageKey);
      const patient = withCabinet(pageSlice(patientRows), patientRows, isPatientCabinetPageKey);

      const avgPerCreator =
        exercises.creators > 0 ? exercises.created / exercises.creators : null;
      const patientsWithProgram = programActivity.patientsWithProgram;
      const avgVisitDays =
        patientsWithProgram > 0 ? programActivity.visitDaysSum / patientsWithProgram : null;
      const avgMarkDays =
        patientsWithProgram > 0 ? programActivity.markDaysSum / patientsWithProgram : null;
      const avgMarkShareOfVisitDays =
        programActivity.visitDaysSum > 0
          ? programActivity.markDaysSum / programActivity.visitDaysSum
          : null;

      return {
        iana: input.iana,
        fromDay,
        toDay,
        startUtcIso,
        endExclusiveUtcIso,
        clients: {
          clinics: seriesFromRaw(dayKeys, clinics),
          specialists: seriesFromRaw(dayKeys, specialists),
          patients: seriesFromRaw(dayKeys, patients),
        },
        visits: { doctor, patient },
        bookings,
        programsAssigned,
        clinicalVisits,
        cmsArticlesCreated,
        exercises: {
          created: exercises.created,
          creators: exercises.creators,
          averagePerCreator: avgPerCreator,
          personal: exercises.personal,
          catalog: exercises.catalog,
          videoFiles: exercises.videoFiles,
          videoIframe: exercises.videoIframe,
        },
        videoVolume: {
          exercises: volumeSlice(exerciseVolume),
          cms: volumeSlice(cmsVolume),
        },
        patientActivity: {
          completions: completions.completions,
          completionsWithRepsOrDifficulty: completions.withRepsOrDifficulty,
          homeWellbeingMarks,
          symptomDiary: null,
          programActivity: {
            patientsWithProgram,
            avgVisitDays,
            avgMarkDays,
            avgMarkShareOfVisitDays,
          },
          videoViewsTotal: playback.viewsTotal,
          videoViewsUnique: playback.viewsUnique,
          hlsResolves: playback.hlsResolves,
          mp4Resolves: playback.mp4Resolves,
          playbackErrors: playback.playbackErrors,
          hostingIframeShown: null,
        },
      };
    },
  };
}
