"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type {
  BroadcastAuditEntry,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";

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
