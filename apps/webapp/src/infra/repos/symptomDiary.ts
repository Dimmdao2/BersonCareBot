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
      symptomTypeRefId: params.symptomTypeRefId ?? null,
      regionRefId: params.regionRefId ?? null,
      side: params.side ?? null,
      diagnosisText: params.diagnosisText ?? null,
      diagnosisRefId: params.diagnosisRefId ?? null,
      stageRefId: params.stageRefId ?? null,
      deletedAt: null,
    };
    trackings.push(tracking);
    return tracking;
  },

  async listTrackings(userId, activeOnly = true) {
    return trackings
      .filter(
        (t) =>
          t.userId === userId &&
          !t.deletedAt &&
          (!activeOnly || t.isActive)
      )
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
      .filter((e) => {
        if (e.userId !== userId) return false;
        const t = trackings.find((x) => x.id === e.trackingId);
        return t && !t.deletedAt;
      })
      .sort((a, b) => (b.recordedAt > a.recordedAt ? 1 : -1))
      .slice(0, limit)
      .map((e) => {
        const t = trackings.find((x) => x.id === e.trackingId);
        return { ...e, symptomTitle: t?.symptomTitle };
      });
  },

  async getTrackingForUser(params) {
    const t = trackings.find(
      (x) => x.id === params.trackingId && x.userId === params.userId && !x.deletedAt
    );
    return t ?? null;
  },

  async listEntriesForTrackingInRange(params) {
    const t = trackings.find(
      (x) => x.id === params.trackingId && x.userId === params.userId && !x.deletedAt
    );
    if (!t) return [];
    const fromMs = new Date(params.fromRecordedAt).getTime();
    const toEx = new Date(params.toRecordedAtExclusive).getTime();
    return entries
      .filter((e) => {
        if (e.userId !== params.userId || e.trackingId !== params.trackingId) return false;
        const ts = new Date(e.recordedAt).getTime();
        return ts >= fromMs && ts < toEx;
      })
      .sort((a, b) => (a.recordedAt > b.recordedAt ? 1 : -1))
      .map((e) => ({ ...e, symptomTitle: t.symptomTitle }));
  },

  async updateTrackingTitle(params) {
    const t = trackings.find((x) => x.id === params.trackingId && x.userId === params.userId);
    if (t && !t.deletedAt) {
      t.symptomTitle = params.symptomTitle;
      t.updatedAt = new Date().toISOString();
    }
  },

  async setTrackingActive(params) {
    const t = trackings.find((x) => x.id === params.trackingId && x.userId === params.userId);
    if (t && !t.deletedAt) {
      t.isActive = params.isActive;
      t.updatedAt = new Date().toISOString();
    }
  },

  async softDeleteTracking(params) {
    const t = trackings.find((x) => x.id === params.trackingId && x.userId === params.userId);
    if (t && !t.deletedAt) {
      t.isActive = false;
      t.deletedAt = new Date().toISOString();
      t.updatedAt = t.deletedAt;
    }
  },
};
