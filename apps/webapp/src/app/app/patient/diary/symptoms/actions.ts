"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

function parseOptionalId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function parseSide(raw: unknown): "left" | "right" | "both" | null {
  if (raw !== "left" && raw !== "right" && raw !== "both") return null;
  return raw;
}

export async function addSymptomEntry(formData: FormData): Promise<{ ok: boolean }> {
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

  try {
    await deps.diaries.addSymptomEntry({
      userId: session.user.userId,
      trackingId,
      value0_10,
      entryType: entryTypeRaw,
      recordedAt: new Date().toISOString(),
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

export async function createSymptomTracking(formData: FormData): Promise<{ ok: boolean }> {
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
    await deps.diaries.createSymptomTracking({
      userId: session.user.userId,
      symptomTitle: resolvedTitle,
      symptomTypeRefId,
      regionRefId,
      side,
      diagnosisText,
      diagnosisRefId,
      stageRefId,
    });
  } catch (err) {
    console.error("createSymptomTracking failed:", err);
    return { ok: false };
  }
  revalidatePath(routePaths.diary);
  return { ok: true };
}

export async function renameSymptomTracking(formData: FormData) {
  const session = await requirePatientAccess(routePaths.diary);
  const trackingId = parseOptionalId(formData.get("trackingId"));
  const newTitleRaw = formData.get("newTitle");
  if (!trackingId || typeof newTitleRaw !== "string") return;
  const newTitle = newTitleRaw.trim();
  if (!newTitle || newTitle.length > 200) return;
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId, false);
  const t = trackings.find((x) => x.id === trackingId);
  if (!t || t.deletedAt) return;
  try {
    await deps.diaries.renameSymptomTracking({
      userId: session.user.userId,
      trackingId,
      symptomTitle: newTitle,
    });
  } catch (e) {
    console.error("renameSymptomTracking", e);
    return;
  }
  revalidatePath(routePaths.diary);
}

export async function archiveSymptomTracking(formData: FormData) {
  const session = await requirePatientAccess(routePaths.diary);
  const trackingId = parseOptionalId(formData.get("trackingId"));
  if (!trackingId) return;
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId, false);
  const t = trackings.find((x) => x.id === trackingId);
  if (!t || t.deletedAt) return;
  try {
    await deps.diaries.archiveSymptomTracking({
      userId: session.user.userId,
      trackingId,
    });
  } catch (e) {
    console.error("archiveSymptomTracking", e);
    return;
  }
  revalidatePath(routePaths.diary);
}

export async function deleteSymptomTracking(formData: FormData) {
  const session = await requirePatientAccess(routePaths.diary);
  const trackingId = parseOptionalId(formData.get("trackingId"));
  if (!trackingId) return;
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId, false);
  const t = trackings.find((x) => x.id === trackingId);
  if (!t || t.deletedAt) return;
  try {
    await deps.diaries.deleteSymptomTracking({
      userId: session.user.userId,
      trackingId,
    });
  } catch (e) {
    console.error("deleteSymptomTracking", e);
    return;
  }
  revalidatePath(routePaths.diary);
}
