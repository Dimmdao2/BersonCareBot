"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type {
  BroadcastAuditEntry,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";
import type { BroadcastChannelCounts, BroadcastDraft } from "@/modules/doctor-broadcasts/draftPort";

/**
 * Zod-схема для входящего черновика рассылки.
 * Server Actions сериализуют/десериализуют аргументы, поэтому проверяем
 * допустимые значения и длины на границе — прежде чем передавать в репозиторий.
 */
const draftSchema = z.object({
  category: z
    .enum([
      "service",
      "organizational",
      "marketing",
      "important_notice",
      "schedule_change",
      "reminder",
      "education",
      "survey",
    ])
    .nullable(),
  audience: z
    .enum([
      "all",
      "active_clients",
      "with_upcoming_appointment",
      "without_appointment",
      "with_telegram",
      "with_max",
      "sms_only",
      "inactive",
    ])
    .nullable(),
  channels: z
    .array(z.enum(["bot_message", "sms", "push", "home_banner", "notification_bell"]))
    .max(10),
  title: z.string().max(200),
  body: z.string().max(4000),
  // RASSL-06 phase 1: опц. прикреплённая картинка (round-trip черновика).
  mediaUrl: z.string().url().nullable().optional(),
  mediaType: z.string().nullable().optional(),
});

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
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error("draft_validation_error");
  }
  const deps = buildAppDeps();
  await deps.doctorBroadcastComposer.saveDraft(session.user.userId, parsed.data as BroadcastDraft);
}

export async function getChannelCountsAction(): Promise<BroadcastChannelCounts> {
  await requireDoctorAccess();
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.getChannelCounts();
}

const audienceFilterSchema = z.enum([
  "all",
  "active_clients",
  "with_upcoming_appointment",
  "without_appointment",
  "with_telegram",
  "with_max",
  "sms_only",
  "inactive",
]);

export async function getChannelCountsByAudienceAction(
  audience: string,
): Promise<BroadcastChannelCounts> {
  await requireDoctorAccess();
  const parsed = audienceFilterSchema.safeParse(audience);
  if (!parsed.success) throw new Error("invalid_audience_filter");
  const deps = buildAppDeps();
  return deps.doctorBroadcastComposer.getChannelCountsByAudience(parsed.data);
}
