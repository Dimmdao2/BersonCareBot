import { presignGetUrl, s3PublicUrl } from "@/infra/s3/client";
import { env } from "@/config/env";
import { NUTRITION_QUESTIONS } from "@/modules/online-intake/types";
import type { IntakeRequestFull } from "@/modules/online-intake/types";

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
    changedBy: string | null;
    note: string | null;
    changedAt: string;
  }>;
};

function s3Configured(): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_PUBLIC_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);
}

async function urlForIntakeS3Key(s3Key: string): Promise<string> {
  if (s3Configured()) {
    return presignGetUrl(s3Key);
  }
  return s3PublicUrl(s3Key);
}

export async function buildDoctorOnlineIntakeDetailResponse(
  full: IntakeRequestFull,
  patientDisplay: { patientName: string; patientPhone: string },
): Promise<DoctorOnlineIntakeDetailJson> {
  const base = {
    id: full.id,
    type: full.type,
    status: full.status,
    patientName: patientDisplay.patientName,
    patientPhone: patientDisplay.patientPhone,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    statusHistory: full.statusHistory.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedBy: h.changedBy,
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
        const url = await urlForIntakeS3Key(a.s3Key);
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

  const qText = new Map(NUTRITION_QUESTIONS.map((q) => [q.id, q.text]));
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
