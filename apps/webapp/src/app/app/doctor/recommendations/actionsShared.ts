import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/infra/logging/logger";
import {
  isRecommendationArchiveAlreadyArchivedError,
  isRecommendationArchiveNotFoundError,
  isRecommendationUnarchiveNotArchivedError,
  isRecommendationUsageConfirmationRequiredError,
} from "@/modules/recommendations/errors";
import type { RecommendationMediaItem, RecommendationUsageSnapshot } from "@/modules/recommendations/types";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

export type SaveRecommendationState = { ok: boolean; error?: string };

export type ArchiveRecommendationState =
  | { ok: true }
  | { ok: false; code: "USAGE_CONFIRMATION_REQUIRED"; usage: RecommendationUsageSnapshot }
  | { ok: false; error: string };

export type ArchiveRecommendationCoreResult =
  | { kind: "archived"; id: string }
  | { kind: "needs_confirmation"; usage: RecommendationUsageSnapshot }
  | { kind: "invalid"; error: string };

export type UnarchiveRecommendationState = { ok: true } | { ok: false; error: string };

export type UnarchiveRecommendationCoreResult =
  | { kind: "unarchived"; id: string }
  | { kind: "invalid"; error: string };

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get("acknowledgeUsageWarning");
  return v === "1" || v === "true" || v === "on";
}
export { RECOMMENDATIONS_PATH } from "./paths";

function parseTags(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function parseDomainField(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

const RECOMMENDATION_METRIC_TEXT_MAX = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBodyRegionIdsFromFormData(fd: FormData, fieldName: string): string[] {
  const raw = fd.getAll(fieldName);
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!UUID_RE.test(t)) continue;
    out.push(t);
  }
  return [...new Set(out)];
}

function parseOptionalMetricText(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

function validateMedia(mediaUrl: string | null, mediaType: "image" | "video" | "gif" | ""): string | null {
  if (mediaType && !mediaUrl) return "Укажите файл из библиотеки или очистите тип медиа.";
  if (mediaUrl && !mediaType) return "Выберите файл из библиотеки.";
  if (mediaUrl && !(API_MEDIA_URL_RE.test(mediaUrl) || isLegacyAbsoluteUrl(mediaUrl))) {
    return "Медиа должно быть из библиотеки (/api/media/…) или допустимый URL.";
  }
  return null;
}

export async function saveRecommendationCore(formData: FormData): Promise<
  | { ok: true; recommendationId: string; wasUpdate: boolean }
  | { ok: false; error: string }
> {
  const session = await requireDoctorAccess();

  const idRaw = formData.get("id");
  const titleField = formData.get("title");
  const title = typeof titleField === "string" ? titleField.trim() : "";
  const bodyMdField = formData.get("bodyMd");
  const bodyMd = typeof bodyMdField === "string" ? bodyMdField.trim() : "";

  const mediaUrlField = formData.get("mediaUrl");
  const mediaUrl = typeof mediaUrlField === "string" ? mediaUrlField.trim() : "";
  const mediaTypeField = formData.get("mediaType");
  const mediaTypeRaw = typeof mediaTypeField === "string" ? mediaTypeField.trim() : "";
  const mediaType =
    mediaTypeRaw === "image" || mediaTypeRaw === "video" || mediaTypeRaw === "gif"
      ? mediaTypeRaw
      : ("" as const);

  const mediaErr = validateMedia(mediaUrl || null, mediaType);
  if (mediaErr) return { ok: false, error: mediaErr };

  const media: RecommendationMediaItem[] = [];
  if (mediaUrl && mediaType) {
    media.push({ mediaUrl, mediaType, sortOrder: 0 });
  }

  const tags = parseTags(formData.get("tags"));
  const domain = parseDomainField(formData.get("domain"));
  const deps = buildAppDeps();
  const allowRegions = new Set(
    (await deps.references.listActiveItemsByCategoryCode("body_region")).map((i) => i.id),
  );
  const bodyRegionIds = parseBodyRegionIdsFromFormData(formData, "bodyRegionIds").filter((id) =>
    allowRegions.has(id),
  );
  const quantityTextRaw = parseOptionalMetricText(formData.get("quantityText"));
  const frequencyTextRaw = parseOptionalMetricText(formData.get("frequencyText"));
  const durationTextRaw = parseOptionalMetricText(formData.get("durationText"));
  for (const [label, val] of [
    ["Количество", quantityTextRaw],
    ["Частота", frequencyTextRaw],
    ["Длительность", durationTextRaw],
  ] as const) {
    if (val && val.length > RECOMMENDATION_METRIC_TEXT_MAX) {
      return { ok: false, error: `${label}: не более ${RECOMMENDATION_METRIC_TEXT_MAX} символов` };
    }
  }
  if (!title) return { ok: false, error: "Название обязательно" };

  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";

  try {
    if (id) {
      const cur = await deps.recommendations.getRecommendation(id);
      if (!cur) return { ok: false, error: "Рекомендация не найдена" };
      if (cur.isArchived) {
        return { ok: false, error: "Рекомендация в архиве. Верните из архива, чтобы редактировать." };
      }
      await deps.recommendations.updateRecommendation(id, {
        title,
        bodyMd,
        tags,
        media,
        domain,
        bodyRegionIds,
        quantityText: quantityTextRaw,
        frequencyText: frequencyTextRaw,
        durationText: durationTextRaw,
      });
      return { ok: true, recommendationId: id, wasUpdate: true };
    }
    const row = await deps.recommendations.createRecommendation(
      {
        title,
        bodyMd,
        tags,
        media,
        domain,
        bodyRegionIds,
        quantityText: quantityTextRaw,
        frequencyText: frequencyTextRaw,
        durationText: durationTextRaw,
      },
      session.user.userId,
    );
    return { ok: true, recommendationId: row.id, wasUpdate: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения" };
  }
}

export async function archiveRecommendationCore(formData: FormData): Promise<ArchiveRecommendationCoreResult> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указана рекомендация" };

  const acknowledgeUsageWarning = parseAcknowledgeUsageWarning(formData);
  const deps = buildAppDeps();
  try {
    await deps.recommendations.archiveRecommendation(id, { acknowledgeUsageWarning });
    return { kind: "archived", id };
  } catch (e) {
    if (isRecommendationUsageConfirmationRequiredError(e)) {
      return { kind: "needs_confirmation", usage: e.usage };
    }
    if (isRecommendationArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isRecommendationArchiveAlreadyArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn({ event: "doctor_recommendation_archive_unexpected_error", recommendationId: id, err: e }, "archive failed");
    return { kind: "invalid", error: "Не удалось архивировать рекомендацию" };
  }
}

export async function unarchiveRecommendationCore(formData: FormData): Promise<UnarchiveRecommendationCoreResult> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указана рекомендация" };

  const deps = buildAppDeps();
  try {
    await deps.recommendations.unarchiveRecommendation(id);
    return { kind: "unarchived", id };
  } catch (e) {
    if (isRecommendationArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isRecommendationUnarchiveNotArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn(
      { event: "doctor_recommendation_unarchive_unexpected_error", recommendationId: id, err: e },
      "unarchive failed",
    );
    return { kind: "invalid", error: "Не удалось вернуть рекомендацию из архива" };
  }
}
