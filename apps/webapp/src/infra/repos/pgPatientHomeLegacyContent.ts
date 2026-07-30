import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { quoteDayKeyUtc, quoteIndexForDaySeed } from '@/modules/patient-home/patientHomeQuoteUtils';
import type {
  HomeQuote,
  PatientHomeLegacyContentPort,
} from '@/modules/patient-home/patientHomeLegacyContentPort';
import { motivationalQuotes } from '../../../db/schema';

export function createPgPatientHomeLegacyContentPort(): PatientHomeLegacyContentPort {
  return {
    async getQuoteForDay(
      daySeed: string,
      referenceDate: Date = new Date(),
    ): Promise<HomeQuote | null> {
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
