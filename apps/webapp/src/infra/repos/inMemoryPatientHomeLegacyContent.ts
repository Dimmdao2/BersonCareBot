import { quoteDayKeyUtc, quoteIndexForDaySeed } from "@/modules/patient-home/patientHomeQuoteUtils";
import type {
  HomeNews,
  HomeQuote,
  PatientHomeBanner,
  PatientHomeLegacyContentPort,
  PatientHomeMailingRow,
} from "@/modules/patient-home/patientHomeLegacyContentPort";

export type InMemoryPatientHomeLegacyQuote = {
  id: string;
  bodyText: string;
  author: string | null;
  sortOrder: number;
  isActive?: boolean;
  archivedAt?: string | null;
};

export type InMemoryPatientHomeLegacyContentOpts = {
  banner?: PatientHomeBanner | null;
  mailings?: PatientHomeMailingRow[];
  homeNews?: HomeNews | null;
  quotes?: InMemoryPatientHomeLegacyQuote[];
};

export function createInMemoryPatientHomeLegacyContentPort(
  opts: InMemoryPatientHomeLegacyContentOpts = {},
): PatientHomeLegacyContentPort {
  const banner = opts.banner ?? null;
  const mailings = opts.mailings ?? [];
  const homeNews = opts.homeNews ?? null;
  const quotes = opts.quotes ?? [];

  return {
    async getPatientHomeBannerTopic() {
      return banner;
    },
    async listRecentMailingLogsForPlatformUser() {
      return mailings;
    },
    async getHomeNews() {
      return homeNews;
    },
    async incrementNewsViews() {
      /* no-op */
    },
    async getQuoteForDay(daySeed: string, referenceDate: Date = new Date()) {
      const active = quotes.filter((q) => q.isActive !== false && q.archivedAt == null);
      const sorted = [...active].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id.localeCompare(b.id);
      });
      const total = sorted.length;
      if (total <= 0) return null;
      const dayKey = quoteDayKeyUtc(referenceDate);
      const idx = quoteIndexForDaySeed(daySeed, dayKey, total);
      const row = sorted[idx];
      if (!row) return null;
      return { id: row.id, body: row.bodyText, author: row.author };
    },
  };
}
