import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { quoteDayKeyUtc, quoteIndexForDaySeed } from "@/modules/patient-home/patientHomeQuoteUtils";
import type {
  HomeQuote,
  PatientHomeBanner,
  PatientHomeLegacyContentPort,
  PatientHomeMailingRow,
} from "@/modules/patient-home/patientHomeLegacyContentPort";
import {
  mailingLogsWebapp,
  mailingTopicsWebapp,
  motivationalQuotes,
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
