"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import {
  getUtcDayRange,
  hasInstantDuplicateInWindow,
  SYMPTOM_INSTANT_DEDUP_MS,
} from "./symptomEntryDedup";
import { isSymptomJournalEntryEditable } from "./symptomJournalEditWindow";

function parseOptionalId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function parseSide(raw: unknown): "left" | "right" | "both" | null {
  if (raw !== "left" && raw !== "right" && raw !== "both") return null;
  return raw;
}

export async function addSymptomEntry(
  formData: FormData,
): Promise<{ ok: boolean; reason?: "duplicate_instant" | "duplicate_daily" }> {
  const session = await requirePatientAccess(routePaths.diary);
  const deps = buildAppDeps();
  const trackingIdRaw = formData.get("trackingId");
  const valueRaw = formData.get("value");
  const entryTypeRaw = formData.get("entryType");
  const notesRaw = formData.get("notes");

  if (typeof trackingIdRaw !== "string" || !trackingIdRaw.trim()) {
    return { ok: false };
  }
  if (typeof valueRaw !== "string") {
    return { ok: false };
  }
  const value0_10 = Number.parseInt(valueRaw, 10);
  if (Number.isNaN(value0_10) || value0_10 < 0 || value0_10 > 10) {
    return { ok: false };
  }
  if (entryTypeRaw !== "instant" && entryTypeRaw !== "daily") {
    return { ok: false };
  }

  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const trackingId = trackingIdRaw.trim();
  if (!trackings.some((t) => t.id === trackingId)) {
    return { ok: false };
  }

  const notes =
    typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;
  if (notes && notes.length > 2000) return { ok: false };

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  if (entryTypeRaw === "instant") {
    const from = new Date(now - SYMPTOM_INSTANT_DEDUP_MS).toISOString();
    const recentEntries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId: session.user.userId,
      trackingId,
      fromRecordedAt: from,
      toRecordedAtExclusive: nowIso,
    });
    if (
      hasInstantDuplicateInWindow(recentEntries, {
        recordedAtMs: now,
        value0_10,
        notes,
      })
    ) {
      return { ok: false, reason: "duplicate_instant" };
    }
  } else {
    const dayRange = getUtcDayRange(now);
    const dayEntries = await deps.diaries.listSymptomEntriesForTrackingInRange({
      userId: session.user.userId,
      trackingId,
      fromRecordedAt: dayRange.fromRecordedAt,
      toRecordedAtExclusive: dayRange.toRecordedAtExclusive,
    });
    if (dayEntries.some((entry) => entry.entryType === "daily")) {
      return { ok: false, reason: "duplicate_daily" };
    }
  }

  try {
    await deps.diaries.addSymptomEntry({
      userId: session.user.userId,
      trackingId,
      value0_10,
      entryType: entryTypeRaw,
      recordedAt: nowIso,
      source: "webapp",
      notes,
    });
  } catch (err) {
    console.error("addSymptomEntry failed:", err);
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  return { ok: true };
}

export type CreateSymptomTrackingResult =
  | { ok: false }
  | { ok: true; tracking: { id: string; symptomTitle: string } };

export async function createSymptomTracking(formData: FormData): Promise<CreateSymptomTrackingResult> {
  const session = await requirePatientAccess(routePaths.diary);
  const deps = buildAppDeps();

  const symptomTitleRaw = formData.get("symptomTitle");
  const title =
    typeof symptomTitleRaw === "string" ? symptomTitleRaw.trim() : "";
  if (title.length > 200) return { ok: false };

  const symptomTypeRefId = parseOptionalId(formData.get("symptomTypeRefId"));
  const regionRefId = parseOptionalId(formData.get("regionRefId"));
  const diagnosisRefId = parseOptionalId(formData.get("diagnosisRefId"));
  const stageRefId = parseOptionalId(formData.get("stageRefId"));
  const side = parseSide(formData.get("side"));
  const diagnosisTextRaw = formData.get("diagnosisText");
  const diagnosisText =
    typeof diagnosisTextRaw === "string" && diagnosisTextRaw.trim()
      ? diagnosisTextRaw.trim().slice(0, 500)
      : null;

  if (!title && !symptomTypeRefId) {
    return { ok: false };
  }

  let resolvedTitle = title;
  if (!resolvedTitle && symptomTypeRefId) {
    const item = await deps.references.findItemById(symptomTypeRefId);
    resolvedTitle = item?.title?.trim() ?? "—";
  }
  if (!resolvedTitle) resolvedTitle = "—";

  try {
    const created = await deps.diaries.createSymptomTracking({
      userId: session.user.userId,
      symptomTitle: resolvedTitle,
      symptomTypeRefId,
      regionRefId,
      side,
      diagnosisText,
      diagnosisRefId,
      stageRefId,
    });
    revalidatePath(routePaths.diary);
    return {
      ok: true,
      tracking: { id: created.id, symptomTitle: created.symptomTitle ?? "—" },
    };
  } catch (err) {
    console.error("createSymptomTracking failed:", err);
    return { ok: false };
  }
}

export async function renameSymptomTracking(formData: FormData): Promise<{ ok: boolean }> {
  const session = await requirePatientAccess(routePaths.diary);
  const trackingId = parseOptionalId(formData.get("trackingId"));
  const newTitleRaw = formData.get("newTitle");
  if (!trackingId || typeof newTitleRaw !== "string") return { ok: false };
  const newTitle = newTitleRaw.trim();
  if (!newTitle || newTitle.length > 200) return { ok: false };
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId, false);
  const t = trackings.find((x) => x.id === trackingId);
  if (!t || t.deletedAt) return { ok: false };
  try {
    await deps.diaries.renameSymptomTracking({
      userId: session.user.userId,
      trackingId,
      symptomTitle: newTitle,
    });
  } catch (e) {
    console.error("renameSymptomTracking", e);
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  return { ok: true };
}

export async function archiveSymptomTracking(formData: FormData): Promise<{ ok: boolean }> {
  const session = await requirePatientAccess(routePaths.diary);
  const trackingId = parseOptionalId(formData.get("trackingId"));
  if (!trackingId) return { ok: false };
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId, false);
  const t = trackings.find((x) => x.id === trackingId);
  if (!t || t.deletedAt) return { ok: false };
  try {
    await deps.diaries.archiveSymptomTracking({
      userId: session.user.userId,
      trackingId,
    });
  } catch (e) {
    console.error("archiveSymptomTracking", e);
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  return { ok: true };
}

export async function updateSymptomJournalEntry(formData: FormData): Promise<{ ok: boolean }> {
  const session = await requirePatientAccess(routePaths.diarySymptomsJournal);
  const entryIdRaw = formData.get("entryId");
  const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
  const recordedAtRawVal = formData.get("recordedAt");
  const recordedAtRaw = typeof recordedAtRawVal === "string" ? recordedAtRawVal.trim() : "";
  const valueRaw = formData.get("value");
  const notesRaw = formData.get("notes");
  if (!entryId || !recordedAtRaw) return { ok: false };
  const at = new Date(recordedAtRaw);
  if (Number.isNaN(at.getTime())) return { ok: false };
  if (typeof valueRaw !== "string") return { ok: false };
  const value0_10 = Number.parseInt(valueRaw, 10);
  if (Number.isNaN(value0_10) || value0_10 < 0 || value0_10 > 10) return { ok: false };
  const notes =
    typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;
  if (notes && notes.length > 2000) return { ok: false };

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const existing = await deps.diaries.getSymptomEntryForUser({ userId, entryId });
  if (!existing) return { ok: false };
  if (!isSymptomJournalEntryEditable(existing.recordedAt)) return { ok: false };

  try {
    await deps.diaries.updateSymptomEntry({
      userId,
      entryId,
      value0_10,
      entryType: existing.entryType,
      recordedAt: at.toISOString(),
      notes,
    });
  } catch (e) {
    console.error("updateSymptomJournalEntry", e);
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  revalidatePath(routePaths.diarySymptomsJournal);
  return { ok: true };
}

export async function deleteSymptomJournalEntry(formData: FormData): Promise<{ ok: boolean }> {
  const session = await requirePatientAccess(routePaths.diarySymptomsJournal);
  const entryIdRaw = formData.get("entryId");
  const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
  if (!entryId) return { ok: false };
  const deps = buildAppDeps();
  const userId = session.user.userId;
  const existing = await deps.diaries.getSymptomEntryForUser({ userId, entryId });
  if (!existing) return { ok: false };
  try {
    await deps.diaries.deleteSymptomEntry({ userId, entryId });
  } catch (e) {
    console.error("deleteSymptomJournalEntry", e);
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  revalidatePath(routePaths.diarySymptomsJournal);
  return { ok: true };
}
