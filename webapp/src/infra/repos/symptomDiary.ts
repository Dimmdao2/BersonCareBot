/**
 * In-memory implementation of SymptomDiaryPort.
 * For tests and dev when DATABASE_URL is not set.
 */
import type { SymptomDiaryPort } from "@/modules/diaries/ports";
import type { SymptomEntry, SymptomTracking } from "@/modules/diaries/types";

const trackings: SymptomTracking[] = [];
const entries: SymptomEntry[] = [];
let trackingIdCounter = 1;
let entryIdCounter = 1;

export const inMemorySymptomDiaryPort: SymptomDiaryPort = {
  async createTracking(params) {
    const now = new Date().toISOString();
    const tracking: SymptomTracking = {
      id: `tr-${trackingIdCounter++}`,
      userId: params.userId,
      symptomKey: params.symptomKey ?? null,
      symptomTitle: params.symptomTitle,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    trackings.push(tracking);
    return tracking;
  },

  async listTrackings(userId, activeOnly = true) {
    return trackings
      .filter((t) => t.userId === userId && (!activeOnly || t.isActive))
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  },

  async addEntry(params) {
    const tracking = trackings.find((t) => t.id === params.trackingId);
    const entry: SymptomEntry = {
      id: `ent-${entryIdCounter++}`,
      userId: params.userId,
      trackingId: params.trackingId,
      value0_10: params.value0_10,
      entryType: params.entryType,
      recordedAt: params.recordedAt,
      source: params.source,
      notes: params.notes ?? null,
      createdAt: new Date().toISOString(),
      symptomTitle: tracking?.symptomTitle,
    };
    entries.push(entry);
    return entry;
  },

  async listEntries(userId, limit = 50) {
    return entries
      .filter((e) => e.userId === userId)
      .sort((a, b) => (b.recordedAt > a.recordedAt ? 1 : -1))
      .slice(0, limit)
      .map((e) => {
        const t = trackings.find((x) => x.id === e.trackingId);
        return { ...e, symptomTitle: t?.symptomTitle };
      });
  },
};
