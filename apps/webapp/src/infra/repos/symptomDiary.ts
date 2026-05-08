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

async function ensureWarmupFeelingTrackingMem(params: {
  userId: string;
  symptomTitle: string;
  symptomTypeRefId: string;
}): Promise<SymptomTracking> {
  const existing = trackings.find(
    (t) => t.userId === params.userId && t.symptomKey === "warmup_feeling" && !t.deletedAt,
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const tracking: SymptomTracking = {
    id: `tr-${trackingIdCounter++}`,
    userId: params.userId,
    symptomKey: "warmup_feeling",
    symptomTitle: params.symptomTitle,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    symptomTypeRefId: params.symptomTypeRefId,
    regionRefId: null,
    side: null,
    diagnosisText: null,
    diagnosisRefId: null,
    stageRefId: null,
    deletedAt: null,
  };
  trackings.push(tracking);
  return tracking;
}

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

  async ensureGeneralWellbeingTracking(params) {
    const existing = trackings.find(
      (t) =>
        t.userId === params.userId &&
        t.symptomKey === "general_wellbeing" &&
        !t.deletedAt,
    );
    if (existing) return existing;
    const now = new Date().toISOString();
    const tracking: SymptomTracking = {
      id: `tr-${trackingIdCounter++}`,
      userId: params.userId,
      symptomKey: "general_wellbeing",
      symptomTitle: params.symptomTitle,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      symptomTypeRefId: params.symptomTypeRefId,
      regionRefId: null,
      side: null,
      diagnosisText: null,
      diagnosisRefId: null,
      stageRefId: null,
      deletedAt: null,
    };
    trackings.push(tracking);
    return tracking;
  },

  async ensureWarmupFeelingTracking(params) {
    return ensureWarmupFeelingTrackingMem(params);
  },

  async upsertWarmupFeelingTrackingIdInTx(_tx, params) {
    const t = await ensureWarmupFeelingTrackingMem(params);
    return t.id;
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

  async listEntriesForUserInRange(params) {
    const fromMs = new Date(params.fromRecordedAt).getTime();
    const toEx = new Date(params.toRecordedAtExclusive).getTime();
    const lim = Math.min(params.limit ?? 500, 2000);
    const tid = params.trackingId?.trim();
    return entries
      .filter((e) => {
        if (e.userId !== params.userId) return false;
        if (tid && e.trackingId !== tid) return false;
        const t = trackings.find((x) => x.id === e.trackingId);
        if (!t || t.deletedAt) return false;
        const ts = new Date(e.recordedAt).getTime();
        return ts >= fromMs && ts < toEx;
      })
      .sort((a, b) => (b.recordedAt > a.recordedAt ? 1 : -1))
      .slice(0, lim)
      .map((e) => {
        const t = trackings.find((x) => x.id === e.trackingId);
        return { ...e, symptomTitle: t?.symptomTitle };
      });
  },

  async minRecordedAtForTracking(params) {
    const t = trackings.find(
      (x) => x.id === params.trackingId && x.userId === params.userId && !x.deletedAt
    );
    if (!t) return null;
    let min: string | null = null;
    for (const e of entries) {
      if (e.userId !== params.userId || e.trackingId !== params.trackingId) continue;
      if (!min || e.recordedAt < min) min = e.recordedAt;
    }
    return min;
  },

  async getEntryForUser(params) {
    const e = entries.find((x) => x.id === params.entryId && x.userId === params.userId);
    if (!e) return null;
    const t = trackings.find((x) => x.id === e.trackingId);
    if (!t || t.deletedAt) return null;
    return { ...e, symptomTitle: t.symptomTitle };
  },

  async updateEntry(params) {
    const e = entries.find((x) => x.id === params.entryId && x.userId === params.userId);
    if (!e) return;
    const t = trackings.find((x) => x.id === e.trackingId);
    if (!t || t.deletedAt) return;
    e.value0_10 = params.value0_10;
    e.entryType = params.entryType;
    e.recordedAt = params.recordedAt;
    e.notes = params.notes;
  },

  async deleteEntry(params) {
    const i = entries.findIndex((x) => x.id === params.entryId && x.userId === params.userId);
    if (i >= 0) entries.splice(i, 1);
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

/** In-memory purge для dev/tests без БД. */
export function purgeInMemorySymptomDiaryForUser(userId: string): void {
  const tIds = new Set(trackings.filter((t) => t.userId === userId).map((t) => t.id));
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.userId === userId || tIds.has(entries[i]!.trackingId)) {
      entries.splice(i, 1);
    }
  }
  for (let i = trackings.length - 1; i >= 0; i--) {
    if (trackings[i]!.userId === userId) {
      trackings.splice(i, 1);
    }
  }
}
