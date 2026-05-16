import { env, isS3MediaEnabled } from "@/config/env";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { s3PublicUrl } from "@/infra/s3/client";
import { getVideoPresignTtlSeconds } from "@/app-layer/media/videoPresignTtl";
import { presignGetUrl } from "@/app-layer/media/s3Client";
import { NUTRITION_ANSWER_LABELS } from "@/modules/online-intake/types";
import type { IntakeRequestFullWithPatientIdentity } from "@/modules/online-intake/types";

export type DoctorLfkAttachmentFile = {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type DoctorOnlineIntakeDetailJson = {
  id: string;
  type: "lfk" | "nutrition";
  status: string;
  patientName: string;
  patientPhone: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  attachmentUrls?: string[];
  attachmentFiles?: DoctorLfkAttachmentFile[];
  answers?: Array<{
    questionId: string;
    questionText: string;
    value: string;
    ordinal: number;
  }>;
  statusHistory: Array<{
    fromStatus: string | null;
    toStatus: string;
    changedBy: string;
    note: string | null;
    changedAt: string;
  }>;
};

/** Presigned or public URL; `null` if S3 is misconfigured (no private and no public bucket for legacy URL). */
async function urlForIntakeS3Key(s3Key: string): Promise<string | null> {
  if (isS3MediaEnabled(env)) {
    const ttlSec = await getVideoPresignTtlSeconds();
    return presignGetUrl(s3Key, ttlSec);
  }
  if (env.S3_ENDPOINT && env.S3_PUBLIC_BUCKET) {
    return s3PublicUrl(s3Key);
  }
  logServerRuntimeError("online_intake_s3_url", new Error("intake_s3_url_misconfigured"), {
    keyKind: s3Key.startsWith("media/") ? "media" : "other",
  });
  return null;
}

export async function buildDoctorOnlineIntakeDetailResponse(
  full: IntakeRequestFullWithPatientIdentity,
): Promise<DoctorOnlineIntakeDetailJson> {
  const base = {
    id: full.id,
    type: full.type,
    status: full.status,
    patientName: full.patientName,
    patientPhone: full.patientPhone,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    statusHistory: full.statusHistory.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedBy: h.changedBy ?? "",
      note: h.note,
      changedAt: h.changedAt,
    })),
  };

  if (full.type === "lfk") {
    const desc = full.answers.find((a) => a.questionId === "lfk_description");
    const attachmentUrls: string[] = [];
    const attachmentFiles: DoctorLfkAttachmentFile[] = [];
    for (const a of full.attachments) {
      if (a.attachmentType === "url" && a.url) {
        attachmentUrls.push(a.url);
      } else if (a.attachmentType === "file" && a.s3Key) {
        const url = (await urlForIntakeS3Key(a.s3Key)) ?? "";
        attachmentFiles.push({
          id: a.id,
          url,
          originalName: a.originalName ?? "file",
          mimeType: a.mimeType ?? "application/octet-stream",
          sizeBytes: a.sizeBytes ?? 0,
        });
      }
    }
    return {
      ...base,
      description: desc?.value,
      attachmentUrls: attachmentUrls.length ? attachmentUrls : undefined,
      attachmentFiles: attachmentFiles.length ? attachmentFiles : undefined,
    };
  }

  const qText = new Map(Object.entries(NUTRITION_ANSWER_LABELS));
  return {
    ...base,
    answers: full.answers.map((a) => ({
      questionId: a.questionId,
      questionText: qText.get(a.questionId) ?? a.questionId,
      value: a.value,
      ordinal: a.ordinal,
    })),
  };
}
