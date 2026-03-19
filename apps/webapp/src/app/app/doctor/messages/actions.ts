"use server";

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type { PrepareDraftResult } from "@/modules/doctor-messaging/service";

export async function getMessageDraftAction(userId: string): Promise<PrepareDraftResult | null> {
  await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorMessaging.prepareMessageDraft({ userId });
}
