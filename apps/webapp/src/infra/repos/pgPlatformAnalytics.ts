import { and, count, countDistinct, eq, gte, inArray, isNull, lt, ne, or, sql, sum } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  beAppointments,
  beOrganizations,
  beSpecialists,
} from '../../../db/schema/bookingEngine';
import { clinicalVisit } from '../../../db/schema/patientClinical';
import { programActionLog } from '../../../db/schema/programActionLog';
import { productAnalyticsHourly, productAnalyticsUserHourly } from '../../../db/schema/productAnalytics';
import { treatmentProgramInstances } from '../../../db/schema/treatmentProgramInstances';
import {
  contentPages,
  contentSections,
  lfkExerciseMedia,
  lfkExercises,
  mediaFiles,
  mediaPlaybackClientEvents,
  mediaPlaybackResolutionEvents,
  mediaHlsProxyErrorEvents,
  platformUsers,
  symptomEntries,
  symptomTrackings,
} from '../../../db/schema/schema';
import { PRODUCT_ANALYTICS_DIM_ALL } from '@/modules/product-analytics/types';
import {
  classifyMediaUrlKind,
  isHostingIframeKind,
} from '@/modules/platform-analytics/hostingUrlKind';
import {
  emptyDurationBucketCounts,
  videoDurationBucket,
  type VideoDurationBucket,
} from '@/modules/platform-analytics/durationBuckets';
import type {
  NamedCountRaw,
  PlatformAnalyticsPort,
  PlatformAnalyticsWindow,
  VideoVolumeRaw,
} from '@/modules/platform-analytics/ports';
import { GENERAL_WELLBEING_SYMPTOM_KEY } from '@/modules/patient-mood/wellbeingConstants';

const CANCELLED_STATUSES = [
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
] as const;

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}

function inWindow(col: Parameters<typeof gte>[0], window: PlatformAnalyticsWindow) {
  return and(gte(col, window.startUtcIso), lt(col, window.endExclusiveUtcIso));
}

function localDaySql(iana: string, col: unknown) {
  return sql<string>`(timezone(${iana}::text, ${col}))::date::text`;
}

async function countNowAndByDay(args: {
  now: Promise<{ c: unknown }[]>;
  period: Promise<{ c: unknown }[]>;
  days: Promise<{ d: string | null; c: unknown }[]>;
}): Promise<NamedCountRaw> {
  const [nowRows, periodRows, dayRows] = await Promise.all([args.now, args.period, args.days]);
  const byDay = new Map<string, number>();
  for (const row of dayRows) {
    if (row.d) byDay.set(row.d, asCount(row.c));
  }
  return {
    now: asCount(nowRows[0]?.c),
    inPeriod: asCount(periodRows[0]?.c),
    byDay,
  };
}

function accumulateDuration(
  buckets: Record<VideoDurationBucket, number>,
  seconds: number | null,
  n = 1,
) {
  buckets[videoDurationBucket(seconds)] += n;
}

export function createPgPlatformAnalyticsPort(): PlatformAnalyticsPort {
  return {
    async countClinics(window) {
      const db = getDrizzle();
      const day = localDaySql(window.iana, beOrganizations.createdAt);
      return countNowAndByDay({
        now: db
          .select({ c: count() })
          .from(beOrganizations)
          .where(eq(beOrganizations.isActive, true)),
        period: db
          .select({ c: count() })
          .from(beOrganizations)
          .where(inWindow(beOrganizations.createdAt, window)),
        days: db
          .select({ d: day, c: count() })
          .from(beOrganizations)
          .where(inWindow(beOrganizations.createdAt, window))
          .groupBy(day),
      });
    },

    async countSpecialists(window) {
      const db = getDrizzle();
      const day = localDaySql(window.iana, beSpecialists.createdAt);
      return countNowAndByDay({
        now: db
          .select({ c: count() })
          .from(beSpecialists)
          .where(eq(beSpecialists.isActive, true)),
        period: db
          .select({ c: count() })
          .from(beSpecialists)
          .where(inWindow(beSpecialists.createdAt, window)),
        days: db
          .select({ d: day, c: count() })
          .from(beSpecialists)
          .where(inWindow(beSpecialists.createdAt, window))
          .groupBy(day),
      });
    },

    async countPatients(window) {
      const db = getDrizzle();
      const patientNow = and(
        eq(platformUsers.role, 'client'),
        isNull(platformUsers.mergedIntoId),
        eq(platformUsers.isArchived, false),
      );
      const day = localDaySql(window.iana, platformUsers.createdAt);
      return countNowAndByDay({
        now: db.select({ c: count() }).from(platformUsers).where(patientNow),
        period: db
          .select({ c: count() })
          .from(platformUsers)
          .where(
            and(
              eq(platformUsers.role, 'client'),
              isNull(platformUsers.mergedIntoId),
              inWindow(platformUsers.createdAt, window),
            ),
          ),
        days: db
          .select({ d: day, c: count() })
          .from(platformUsers)
          .where(
            and(
              eq(platformUsers.role, 'client'),
              isNull(platformUsers.mergedIntoId),
              inWindow(platformUsers.createdAt, window),
            ),
          )
          .groupBy(day),
      });
    },

    async listPageViews(window) {
      const db = getDrizzle();
      const rows = await db
        .select({
          pageKey: productAnalyticsHourly.pageKey,
          entryChannel: productAnalyticsHourly.entryChannel,
          views: sum(productAnalyticsHourly.eventCount),
        })
        .from(productAnalyticsHourly)
        .where(
          and(
            eq(productAnalyticsHourly.eventType, 'page_view'),
            ne(productAnalyticsHourly.pageKey, PRODUCT_ANALYTICS_DIM_ALL),
            gte(productAnalyticsHourly.bucketHour, window.startUtcIso),
            lt(productAnalyticsHourly.bucketHour, window.endExclusiveUtcIso),
          ),
        )
        .groupBy(productAnalyticsHourly.pageKey, productAnalyticsHourly.entryChannel);
      return rows.map((row) => ({
        pageKey: row.pageKey,
        entryChannel: row.entryChannel,
        views: asCount(row.views),
      }));
    },

    async countBookings(window) {
      const db = getDrizzle();
      const [createdRows, cancelledRows] = await Promise.all([
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(and(isNull(beAppointments.deletedAt), inWindow(beAppointments.createdAt, window))),
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(
            and(
              isNull(beAppointments.deletedAt),
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              inWindow(beAppointments.updatedAt, window),
            ),
          ),
      ]);
      return { created: asCount(createdRows[0]?.c), cancelled: asCount(cancelledRows[0]?.c) };
    },

    async countProgramsAssigned(window) {
      const db = getDrizzle();
      const rows = await db
        .select({ c: count() })
        .from(treatmentProgramInstances)
        .where(inWindow(treatmentProgramInstances.createdAt, window));
      return asCount(rows[0]?.c);
    },

    async countClinicalVisits(window) {
      const db = getDrizzle();
      const rows = await db
        .select({ c: count() })
        .from(clinicalVisit)
        .where(inWindow(clinicalVisit.createdAt, window));
      return asCount(rows[0]?.c);
    },

    async countCmsArticles(window) {
      const db = getDrizzle();
      const rows = await db
        .select({ c: count() })
        .from(contentPages)
        .innerJoin(contentSections, eq(contentPages.section, contentSections.slug))
        .where(
          and(
            isNull(contentPages.deletedAt),
            or(isNull(contentSections.systemParentCode), ne(contentSections.systemParentCode, 'warmups')),
            inWindow(contentPages.createdAt, window),
          ),
        );
      return asCount(rows[0]?.c);
    },

    async countExercises(window) {
      const db = getDrizzle();
      const exerciseWhere = and(
        eq(lfkExercises.ownerKind, 'organization'),
        inWindow(lfkExercises.createdAt, window),
      );
      const [totals, media] = await Promise.all([
        db
          .select({
            created: count(),
            creators: countDistinct(lfkExercises.createdBy),
            personal: sql<number>`cast(count(*) filter (where ${lfkExercises.catalogScope} = 'personal') as int)`,
            catalog: sql<number>`cast(count(*) filter (where ${lfkExercises.catalogScope} = 'catalog') as int)`,
          })
          .from(lfkExercises)
          .where(exerciseWhere),
        db
          .select({ url: lfkExerciseMedia.mediaUrl })
          .from(lfkExerciseMedia)
          .innerJoin(lfkExercises, eq(lfkExerciseMedia.exerciseId, lfkExercises.id))
          .where(and(exerciseWhere, eq(lfkExerciseMedia.mediaType, 'video'))),
      ]);
      let videoFiles = 0;
      let videoIframe = 0;
      for (const row of media) {
        const kind = classifyMediaUrlKind(row.url);
        if (isHostingIframeKind(kind)) videoIframe += 1;
        else if (kind === 'file') videoFiles += 1;
      }
      const t = totals[0];
      return {
        created: asCount(t?.created),
        creators: asCount(t?.creators),
        personal: asCount(t?.personal),
        catalog: asCount(t?.catalog),
        videoFiles,
        videoIframe,
      };
    },

    async videoVolumeExercises(window) {
      const db = getDrizzle();
      const mediaIdSql = sql<string>`substring(${lfkExerciseMedia.mediaUrl} from '/api/media/([0-9a-fA-F-]{36})')`;
      const rows = await db
        .select({
          sizeBytes: mediaFiles.sizeBytes,
          duration: mediaFiles.videoDurationSeconds,
        })
        .from(lfkExerciseMedia)
        .innerJoin(lfkExercises, eq(lfkExerciseMedia.exerciseId, lfkExercises.id))
        .innerJoin(mediaFiles, sql`${mediaFiles.id}::text = ${mediaIdSql}`)
        .where(
          and(
            eq(lfkExercises.ownerKind, 'organization'),
            eq(lfkExerciseMedia.mediaType, 'video'),
            inWindow(lfkExercises.createdAt, window),
          ),
        );
      return volumeFromRows(rows);
    },

    async videoVolumeCms(window) {
      const db = getDrizzle();
      const mediaIdSql = sql<string>`substring(${contentPages.videoUrl} from '/api/media/([0-9a-fA-F-]{36})')`;
      const rows = await db
        .select({
          sizeBytes: mediaFiles.sizeBytes,
          duration: mediaFiles.videoDurationSeconds,
        })
        .from(contentPages)
        .innerJoin(contentSections, eq(contentPages.section, contentSections.slug))
        .innerJoin(mediaFiles, sql`${mediaFiles.id}::text = ${mediaIdSql}`)
        .where(
          and(
            isNull(contentPages.deletedAt),
            or(isNull(contentSections.systemParentCode), ne(contentSections.systemParentCode, 'warmups')),
            inWindow(contentPages.createdAt, window),
          ),
        );
      return volumeFromRows(rows);
    },

    async countCompletions(window) {
      const db = getDrizzle();
      const [allRows, metricRows] = await Promise.all([
        db
          .select({ c: count() })
          .from(programActionLog)
          .where(and(eq(programActionLog.actionType, 'done'), inWindow(programActionLog.createdAt, window))),
        db
          .select({ c: count() })
          .from(programActionLog)
          .where(
            and(
              eq(programActionLog.actionType, 'done'),
              inWindow(programActionLog.createdAt, window),
              sql`(
                (${programActionLog.payload} ->> 'reps') is not null
                or (${programActionLog.payload} ->> 'perceivedDifficulty') is not null
                or (${programActionLog.payload} ->> 'difficulty') is not null
              )`,
            ),
          ),
      ]);
      return {
        completions: asCount(allRows[0]?.c),
        withRepsOrDifficulty: asCount(metricRows[0]?.c),
      };
    },

    async countHomeWellbeing(window) {
      const db = getDrizzle();
      const rows = await db
        .select({ c: count() })
        .from(symptomEntries)
        .innerJoin(symptomTrackings, eq(symptomEntries.trackingId, symptomTrackings.id))
        .where(
          and(
            eq(symptomTrackings.symptomKey, GENERAL_WELLBEING_SYMPTOM_KEY),
            inWindow(symptomEntries.recordedAt, window),
          ),
        );
      return asCount(rows[0]?.c);
    },

    async programActivity(window) {
      const db = getDrizzle();
      const visitDay = localDaySql(window.iana, productAnalyticsUserHourly.bucketHour);
      const markDay = localDaySql(window.iana, programActionLog.createdAt);
      const [patientRows, visitRows, markRows] = await Promise.all([
        db
          .select({ c: countDistinct(treatmentProgramInstances.patientUserId) })
          .from(treatmentProgramInstances)
          .where(eq(treatmentProgramInstances.status, 'active')),
        db
          .select({ c: sql<number>`count(distinct (${productAnalyticsUserHourly.userId}::text || ':' || ${visitDay}))` })
          .from(productAnalyticsUserHourly)
          .innerJoin(
            treatmentProgramInstances,
            and(
              eq(treatmentProgramInstances.patientUserId, productAnalyticsUserHourly.userId),
              eq(treatmentProgramInstances.status, 'active'),
            ),
          )
          .where(
            and(
              gte(productAnalyticsUserHourly.bucketHour, window.startUtcIso),
              lt(productAnalyticsUserHourly.bucketHour, window.endExclusiveUtcIso),
              sql`${productAnalyticsUserHourly.pageViews} > 0`,
              sql`${productAnalyticsUserHourly.pageKey} like '/app/patient/treatment%'`,
            ),
          ),
        db
          .select({ c: sql<number>`count(distinct (${programActionLog.patientUserId}::text || ':' || ${markDay}))` })
          .from(programActionLog)
          .innerJoin(
            treatmentProgramInstances,
            and(
              eq(treatmentProgramInstances.id, programActionLog.instanceId),
              eq(treatmentProgramInstances.status, 'active'),
            ),
          )
          .where(
            and(eq(programActionLog.actionType, 'done'), inWindow(programActionLog.createdAt, window)),
          ),
      ]);
      return {
        patientsWithProgram: asCount(patientRows[0]?.c),
        visitDaysSum: asCount(visitRows[0]?.c),
        markDaysSum: asCount(markRows[0]?.c),
        patientsWithVisitDays: 0,
      };
    },

    async videoPlayback(window) {
      const db = getDrizzle();
      const [totalRows, uniqueRows, deliveryRows, clientErr, proxyErr] = await Promise.all([
        db
          .select({ c: count() })
          .from(mediaPlaybackResolutionEvents)
          .where(inWindow(mediaPlaybackResolutionEvents.resolvedAt, window)),
        db
          .select({
            c: sql<number>`count(distinct (${mediaPlaybackResolutionEvents.userId}::text || ':' || ${mediaPlaybackResolutionEvents.mediaId}::text))`,
          })
          .from(mediaPlaybackResolutionEvents)
          .where(inWindow(mediaPlaybackResolutionEvents.resolvedAt, window)),
        db
          .select({
            delivery: mediaPlaybackResolutionEvents.delivery,
            c: count(),
          })
          .from(mediaPlaybackResolutionEvents)
          .where(inWindow(mediaPlaybackResolutionEvents.resolvedAt, window))
          .groupBy(mediaPlaybackResolutionEvents.delivery),
        db
          .select({ c: count() })
          .from(mediaPlaybackClientEvents)
          .where(inWindow(mediaPlaybackClientEvents.createdAt, window)),
        db
          .select({ c: count() })
          .from(mediaHlsProxyErrorEvents)
          .where(inWindow(mediaHlsProxyErrorEvents.createdAt, window)),
      ]);
      let hlsResolves = 0;
      let mp4Resolves = 0;
      for (const row of deliveryRows) {
        if (row.delivery === 'hls') hlsResolves = asCount(row.c);
        if (row.delivery === 'mp4') mp4Resolves = asCount(row.c);
      }
      return {
        viewsTotal: asCount(totalRows[0]?.c),
        viewsUnique: asCount(uniqueRows[0]?.c),
        hlsResolves,
        mp4Resolves,
        playbackErrors: asCount(clientErr[0]?.c) + asCount(proxyErr[0]?.c),
      };
    },
  };
}

function volumeFromRows(
  rows: { sizeBytes: number | null; duration: number | null }[],
): VideoVolumeRaw {
  const durationBuckets = emptyDurationBucketCounts();
  let originalsBytes = 0;
  for (const row of rows) {
    originalsBytes += row.sizeBytes ?? 0;
    accumulateDuration(durationBuckets, row.duration);
  }
  return { originalsBytes, videoCount: rows.length, durationBuckets };
}
