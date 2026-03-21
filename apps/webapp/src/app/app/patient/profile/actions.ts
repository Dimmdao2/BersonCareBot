"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function updateDisplayName(newName: string) {
  const trimmedName = newName.trim();
  if (!trimmedName) return;
  if (trimmedName.length > 200) return;

  const session = await requirePatientAccess(routePaths.profile);
  const deps = buildAppDeps();
  try {
    await deps.userProjection.updateDisplayName(session.user.userId, trimmedName);
  } catch (err) {
    console.error("updateDisplayName failed:", err);
    return;
  }
  revalidatePath(routePaths.profile);
}
