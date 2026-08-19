import { resolveAdminStatsLocalRange } from '@/modules/admin-platform-stats/registrationTimeRange';
import {
  emptyEntryChannelCounts,
  platformEntryChannel,
} from '@/modules/platform-analytics/entryChannels';
import {
  isDoctorCabinetPageKey,
  isPatientCabinetPageKey,
  pageAudienceFromPageKey,
  pageAudienceHasIngest,
  type PageAudience,
} from '@/modules/platform-analytics/pageAudience';
import type {
  PageViewRaw,
  PlatformAnalyticsPort,
  VideoVolumeRaw,
} from '@/modules/platform-analytics/ports';
import type {
  NamedDaySeries,
  PageViewSlice,
  PlatformAnalyticsDashboard,
  PlatformAnalyticsRangeInput,
  VideoVolumeSlice,
} from '@/modules/platform-analytics/types';

const TOP_PAGES_LIMIT = 12;

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

function audienceSlice(
  audience: PageAudience,
  rows: PageViewRaw[],
  isCabinet: (pageKey: string) => boolean,
): PageViewSlice {
  const byPage = new Map<string, number>();
  const byChannel = emptyEntryChannelCounts();
  let pageViews = 0;
  let cabinetViews = 0;
  for (const row of rows) {
    pageViews += row.views;
    byPage.set(row.pageKey, (byPage.get(row.pageKey) ?? 0) + row.views);
    byChannel[platformEntryChannel(row.entryChannel)] += row.views;
    if (isCabinet(row.pageKey)) cabinetViews += row.views;
  }
  const topPages = [...byPage.entries()]
    .map(([pageKey, views]) => ({ pageKey, views }))
    .sort((a, b) => b.views - a.views || a.pageKey.localeCompare(b.pageKey))
    .slice(0, TOP_PAGES_LIMIT);
  return {
    ingestAvailable: pageAudienceHasIngest(audience),
    pageViews,
    cabinetViews,
    byChannel,
    topPages,
  };
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
      const snapshot = await port.readSnapshot({
        iana: input.iana,
        startUtcIso,
        endExclusiveUtcIso,
        dayKeys,
        audience: input.audience,
      });

      const doctorRows = snapshot.pageViews.filter(
        (row) => pageAudienceFromPageKey(row.pageKey) === 'doctor',
      );
      const patientRows = snapshot.pageViews.filter(
        (row) => pageAudienceFromPageKey(row.pageKey) === 'patient',
      );

      const exercises = snapshot.exercises;
      const avgPerCreator = exercises.creators > 0 ? exercises.created / exercises.creators : null;
      const { patientsWithProgram, visitDaysSum, markDaysSum } = snapshot.programActivity;
      const avgVisitDays = patientsWithProgram > 0 ? visitDaysSum / patientsWithProgram : null;
      const avgMarkDays = patientsWithProgram > 0 ? markDaysSum / patientsWithProgram : null;
      const avgMarkShareOfVisitDays = visitDaysSum > 0 ? markDaysSum / visitDaysSum : null;

      return {
        iana: input.iana,
        fromDay,
        toDay,
        startUtcIso,
        endExclusiveUtcIso,
        clients: {
          clinics: seriesFromRaw(dayKeys, snapshot.clinics),
          specialists: seriesFromRaw(dayKeys, snapshot.specialists),
          patients: seriesFromRaw(dayKeys, snapshot.patients),
        },
        visits: {
          doctor: audienceSlice('doctor', doctorRows, isDoctorCabinetPageKey),
          patient: audienceSlice('patient', patientRows, isPatientCabinetPageKey),
        },
        bookings: snapshot.bookings,
        programsAssigned: snapshot.programsAssigned,
        clinicalVisits: snapshot.clinicalVisits,
        cmsArticlesCreated: snapshot.cmsArticlesCreated,
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
          exercises: volumeSlice(snapshot.videoVolumeExercises),
          cms: volumeSlice(snapshot.videoVolumeCms),
        },
        patientActivity: {
          completions: snapshot.completions.completions,
          completionsWithRepsOrDifficulty: snapshot.completions.withRepsOrDifficulty,
          homeWellbeingMarks: snapshot.homeWellbeingMarks,
          symptomDiary: null,
          programActivity: {
            patientsWithProgram,
            avgVisitDays,
            avgMarkDays,
            avgMarkShareOfVisitDays,
          },
          videoViewsTotal: snapshot.playback.viewsTotal,
          videoViewsUnique: snapshot.playback.viewsUnique,
          hlsResolves: snapshot.playback.hlsResolves,
          mp4Resolves: snapshot.playback.mp4Resolves,
          playbackErrors: snapshot.playback.playbackErrors,
          playbackSeries: dayKeys.map((day) => ({
            day,
            count: snapshot.playback.byDay.get(day) ?? 0,
          })),
          hostingIframeShown: null,
        },
      };
    },
  };
}
