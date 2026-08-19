import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  ALWAYS_EXCLUDED_ANALYTICS_PHONES,
  STAFF_ANALYTICS_ROLES,
} from '@/infra/repos/pgAnalyticsAudience';
import {
  classifyMediaUrlKind,
  isHostingIframeKind,
} from '@/modules/platform-analytics/hostingUrlKind';
import {
  emptyDurationBucketCounts,
  VIDEO_DURATION_BUCKETS,
  type VideoDurationBucket,
} from '@/modules/platform-analytics/durationBuckets';
import type {
  NamedCountRaw,
  PageViewRaw,
  PlatformAnalyticsAudienceSpec,
  PlatformAnalyticsPort,
  PlatformAnalyticsSnapshot,
  VideoVolumeRaw,
} from '@/modules/platform-analytics/ports';

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function namedCount(value: unknown): NamedCountRaw {
  const node = asRecord(value);
  const byDay = new Map<string, number>();
  for (const [day, count] of Object.entries(asRecord(node.byDay))) {
    byDay.set(day, asCount(count));
  }
  return { now: asCount(node.now), inPeriod: asCount(node.inPeriod), byDay };
}

function dayMap(value: unknown): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const [day, count] of Object.entries(asRecord(value))) byDay.set(day, asCount(count));
  return byDay;
}

function pageViews(value: unknown): PageViewRaw[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const node = asRecord(row);
    return {
      pageKey: typeof node.pageKey === 'string' ? node.pageKey : '',
      entryChannel: typeof node.entryChannel === 'string' ? node.entryChannel : '',
      views: asCount(node.views),
    };
  });
}

function videoVolume(value: unknown): VideoVolumeRaw {
  const node = asRecord(value);
  const rawBuckets = asRecord(node.durationBuckets);
  const durationBuckets = emptyDurationBucketCounts();
  for (const bucket of VIDEO_DURATION_BUCKETS satisfies readonly VideoDurationBucket[]) {
    durationBuckets[bucket] = asCount(rawBuckets[bucket]);
  }
  return {
    originalsBytes: asCount(node.originalsBytes),
    videoCount: asCount(node.videoCount),
    durationBuckets,
  };
}

/**
 * Файл vs iframe хостинга классифицируется ОДНИМ классификатором (`hostingUrlKind.ts`) — тем же,
 * которым пользуется остальной код. Дверь отдаёт пары «адрес → сколько», а не готовый счёт, чтобы
 * второй копии правила в SQL не появилось.
 */
function exerciseVideoSplit(value: unknown): { videoFiles: number; videoIframe: number } {
  let videoFiles = 0;
  let videoIframe = 0;
  if (Array.isArray(value)) {
    for (const row of value) {
      const node = asRecord(row);
      if (typeof node.url !== 'string') continue;
      const count = asCount(node.count);
      const kind = classifyMediaUrlKind(node.url);
      if (isHostingIframeKind(kind)) videoIframe += count;
      else if (kind === 'file') videoFiles += count;
    }
  }
  return { videoFiles, videoIframe };
}

function audienceJson(audience: PlatformAnalyticsAudienceSpec): string {
  return JSON.stringify({
    excludeStaffRoles: true,
    staffRoles: [...STAFF_ANALYTICS_ROLES],
    excludedPhones: [...ALWAYS_EXCLUDED_ANALYTICS_PHONES, ...audience.testPhones],
    telegramIds: audience.testTelegramIds,
    maxIds: audience.testMaxIds,
  });
}

export function createPgPlatformAnalyticsPort(): PlatformAnalyticsPort {
  return {
    async readSnapshot(window): Promise<PlatformAnalyticsSnapshot> {
      // Идентичность корня пишется ЛИТЕРАЛОМ в самом вызове: каталог call-site читает её из AST,
      // и вынесенная в константу строка для него — «dynamic named-root identity», то есть дверь
      // перестаёт быть проверяемой. Один объявленный корень на весь дашборд: платформенная роль
      // не имеет привилегий на семнадцать из девятнадцати читаемых таблиц (замер 19.08,
      // миграция 0043) и по решению владельца D1 получить их не должна — дверь отдаёт СЧЁТ, а не
      // строки, поэтому цифры появляются, а медицинские данные роли по-прежнему не видны.
      const args = [
        window.startUtcIso,
        window.endExclusiveUtcIso,
        window.iana,
        audienceJson(window.audience),
      ] as const;
      const result = await runWebappNamedRoot<{ snapshot: unknown }>(
        getWebappSqlDb(),
        'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)',
        args,
        sql`SELECT app.read_platform_analytics_dashboard(
          ${sql.param(args[0])}::timestamptz,
          ${sql.param(args[1])}::timestamptz,
          ${sql.param(args[2])}::text,
          ${sql.param(args[3])}::text
        ) AS snapshot`,
      );

      const raw = asRecord(result.rows[0]?.snapshot);
      const exercises = asRecord(raw.exercises);
      const split = exerciseVideoSplit(exercises.mediaUrls);
      const playback = asRecord(raw.playback);
      const programActivity = asRecord(raw.programActivity);
      const completions = asRecord(raw.completions);
      const bookings = asRecord(raw.bookings);

      return {
        clinics: namedCount(raw.clinics),
        specialists: namedCount(raw.specialists),
        patients: namedCount(raw.patients),
        pageViews: pageViews(raw.pageViews),
        bookings: {
          created: asCount(bookings.created),
          cancelled: asCount(bookings.cancelled),
        },
        programsAssigned: asCount(raw.programsAssigned),
        clinicalVisits: asCount(raw.clinicalVisits),
        cmsArticlesCreated: asCount(raw.cmsArticlesCreated),
        exercises: {
          created: asCount(exercises.created),
          creators: asCount(exercises.creators),
          personal: asCount(exercises.personal),
          catalog: asCount(exercises.catalog),
          videoFiles: split.videoFiles,
          videoIframe: split.videoIframe,
        },
        videoVolumeExercises: videoVolume(raw.videoVolumeExercises),
        videoVolumeCms: videoVolume(raw.videoVolumeCms),
        completions: {
          completions: asCount(completions.completions),
          withRepsOrDifficulty: asCount(completions.withRepsOrDifficulty),
        },
        homeWellbeingMarks: asCount(raw.homeWellbeingMarks),
        programActivity: {
          patientsWithProgram: asCount(programActivity.patientsWithProgram),
          visitDaysSum: asCount(programActivity.visitDaysSum),
          markDaysSum: asCount(programActivity.markDaysSum),
        },
        playback: {
          viewsTotal: asCount(playback.viewsTotal),
          viewsUnique: asCount(playback.viewsUnique),
          hlsResolves: asCount(playback.hlsResolves),
          mp4Resolves: asCount(playback.mp4Resolves),
          playbackErrors: asCount(playback.playbackErrors),
          byDay: dayMap(playback.byDay),
        },
      };
    },
  };
}
