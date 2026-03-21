"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function addSymptomEntry(formData: FormData) {
  const session = await requirePatientAccess(routePaths.symptoms);
  const deps = buildAppDeps();
  const trackingIdRaw = formData.get("trackingId");
  const valueRaw = formData.get("value");
  const entryTypeRaw = formData.get("entryType");
  const notesRaw = formData.get("notes");

  if (typeof trackingIdRaw !== "string" || !trackingIdRaw.trim()) {
    return;
  }
  if (typeof valueRaw !== "string") {
    return;
  }
  const value0_10 = Number.parseInt(valueRaw, 10);
  if (Number.isNaN(value0_10) || value0_10 < 0 || value0_10 > 10) {
    return;
  }
  if (entryTypeRaw !== "instant" && entryTypeRaw !== "daily") {
    return;
  }

  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const trackingId = trackingIdRaw.trim();
  if (!trackings.some((t) => t.id === trackingId)) {
    return;
  }

  const notes =
    typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

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
    return;
  }
  revalidatePath(routePaths.symptoms);
}

export async function createSymptomTracking(formData: FormData) {
  const session = await requirePatientAccess(routePaths.symptoms);
  const symptomTitleRaw = formData.get("symptomTitle");
  if (typeof symptomTitleRaw !== "string" || !symptomTitleRaw.trim()) {
    return;
  }
  const deps = buildAppDeps();
  try {
    await deps.diaries.createSymptomTracking({
      userId: session.user.userId,
      symptomTitle: symptomTitleRaw.trim(),
    });
  } catch (err) {
    console.error("createSymptomTracking failed:", err);
    return;
  }
  revalidatePath(routePaths.symptoms);
}
