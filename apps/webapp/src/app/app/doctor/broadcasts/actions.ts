"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type {
  BroadcastAuditEntry,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";
import type { BroadcastChannelCounts, BroadcastDraft } from "@/modules/doctor-broadcasts/draftPort";

export async function previewBroadcastAction(
  command: Omit<BroadcastCommand, "actorId">
): Promise<BroadcastPreviewResult> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorBroadcasts.preview({ ...command, actorId: session.user.userId });
}

export async function executeBroadcastAction(
  command: Omit<BroadcastCommand, "actorId">
): Promise<{ auditEntry: BroadcastAuditEntry }> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const result = await deps.doctorBroadcasts.execute({ ...command, actorId: session.user.userId });
  revalidatePath("/app/doctor/broadcasts");
  return result;
}

export async function listBroadcastAuditAction(limit?: number): Promise<BroadcastAuditEntry[]> {
  await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorBroadcasts.listAudit(limit);
}

export async function loadDraftAction(): Promise<BroadcastDraft | null> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.loadDraft(session.user.userId);
}

export async function saveDraftAction(draft: BroadcastDraft): Promise<void> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  await deps.doctorBroadcastComposer.saveDraft(session.user.userId, draft);
}

export async function getChannelCountsAction(): Promise<BroadcastChannelCounts> {
  await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.getChannelCounts();
}
