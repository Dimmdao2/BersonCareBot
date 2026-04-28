import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { quoteDayKeyUtc, quoteIndexForDaySeed } from "@/modules/patient-home/patientHomeQuoteUtils";
import type {
  HomeNews,
  HomeQuote,
  PatientHomeBanner,
  PatientHomeLegacyContentPort,
  PatientHomeMailingRow,
} from "@/modules/patient-home/patientHomeLegacyContentPort";
import {
  mailingLogsWebapp,
  mailingTopicsWebapp,
  motivationalQuotes,
  newsItems,
  newsItemViews,
  platformUsers,
} from "../../../db/schema";

function toIsoString(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

export function createPgPatientHomeLegacyContentPort(): PatientHomeLegacyContentPort {
  return {
    async getPatientHomeBannerTopic(): Promise<PatientHomeBanner | null> {
      try {
        const db = getDrizzle();
        const rows = await db
          .select({
            title: mailingTopicsWebapp.title,
            key: mailingTopicsWebapp.key,
            code: mailingTopicsWebapp.code,
          })
          .from(mailingTopicsWebapp)
          .where(eq(mailingTopicsWebapp.isActive, true))
          .orderBy(asc(mailingTopicsWebapp.integratorTopicId))
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        const important =
          row.key.toLowerCase().includes("important") || row.code.toLowerCase() === "important";
        return { title: row.title, variant: important ? "important" : "info", key: row.key };
      } catch {
        return null;
      }
    },

    async listRecentMailingLogsForPlatformUser(platformUserId: string): Promise<PatientHomeMailingRow[]> {
      try {
        const db = getDrizzle();
        const rows = await db
          .select({
            integratorMailingId: mailingLogsWebapp.integratorMailingId,
            status: mailingLogsWebapp.status,
            sentAt: mailingLogsWebapp.sentAt,
          })
          .from(mailingLogsWebapp)
          .innerJoin(
            platformUsers,
            and(
              eq(platformUsers.id, platformUserId),
              sql`${platformUsers.integratorUserId} IS NOT NULL`,
              eq(platformUsers.integratorUserId, mailingLogsWebapp.integratorUserId),
            ),
          )
          .orderBy(desc(mailingLogsWebapp.sentAt))
          .limit(8);
        return rows.map((row) => ({
          id: `ml-${row.integratorMailingId}`,
          label: `Рассылка №${row.integratorMailingId}`,
          sentAt: toIsoString(row.sentAt),
          status: row.status,
        }));
      } catch {
        return [];
      }
    },

    async getHomeNews(): Promise<HomeNews | null> {
      try {
        const db = getDrizzle();
        const rows = await db
          .select({
            id: newsItems.id,
            title: newsItems.title,
            bodyMd: newsItems.bodyMd,
          })
          .from(newsItems)
          .where(and(eq(newsItems.isVisible, true), isNull(newsItems.archivedAt)))
          .orderBy(
            desc(newsItems.sortOrder),
            desc(sql`coalesce(${newsItems.publishedAt}, ${newsItems.createdAt})`),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return { id: row.id, title: row.title, bodyMd: row.bodyMd ?? "" };
      } catch {
        return null;
      }
    },

    async incrementNewsViews(newsId: string, userId: string): Promise<void> {
      try {
        const db = getDrizzle();
        const updated = await db
          .update(newsItemViews)
          .set({
            viewedAt: sql`LEAST(${newsItemViews.viewedAt}::timestamptz, now())` as unknown as string,
          })
          .where(
            and(
              eq(newsItemViews.newsId, newsId),
              or(eq(newsItemViews.platformUserId, userId), eq(newsItemViews.userId, userId)),
            ),
          )
          .returning({ newsId: newsItemViews.newsId });
        if (updated.length > 0) {
          return;
        }
        const inserted = await db
          .insert(newsItemViews)
          .values({
            newsId,
            userId,
            platformUserId: userId,
            viewedAt: sql`now()` as unknown as string,
          })
          .onConflictDoNothing({ target: [newsItemViews.newsId, newsItemViews.userId] })
          .returning({ newsId: newsItemViews.newsId });
        if (inserted.length > 0) {
          await db
            .update(newsItems)
            .set({
              viewsCount: sql`${newsItems.viewsCount} + 1`,
              updatedAt: sql`now()` as unknown as string,
            })
            .where(eq(newsItems.id, newsId));
        }
      } catch {
        /* ignore — как в legacy */
      }
    },

    async getQuoteForDay(daySeed: string, referenceDate: Date = new Date()): Promise<HomeQuote | null> {
      try {
        const db = getDrizzle();
        const [countRow] = await db
          .select({ total: count() })
          .from(motivationalQuotes)
          .where(and(eq(motivationalQuotes.isActive, true), isNull(motivationalQuotes.archivedAt)));
        const total = Number(countRow?.total ?? 0);
        if (total <= 0) return null;

        const dayKey = quoteDayKeyUtc(referenceDate);
        const idx = quoteIndexForDaySeed(daySeed, dayKey, total);

        const rows = await db
          .select({
            id: motivationalQuotes.id,
            bodyText: motivationalQuotes.bodyText,
            author: motivationalQuotes.author,
          })
          .from(motivationalQuotes)
          .where(and(eq(motivationalQuotes.isActive, true), isNull(motivationalQuotes.archivedAt)))
          .orderBy(asc(motivationalQuotes.sortOrder), asc(motivationalQuotes.id))
          .limit(1)
          .offset(idx);
        const row = rows[0];
        if (!row) return null;
        return { id: row.id, body: row.bodyText, author: row.author };
      } catch {
        return null;
      }
    },
  };
}
