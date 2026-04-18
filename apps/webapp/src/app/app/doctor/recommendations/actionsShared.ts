import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

export type SaveRecommendationState = { ok: boolean; error?: string };
export { RECOMMENDATIONS_PATH } from "./paths";

function parseTags(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
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
  if (!title) return { ok: false, error: "Название обязательно" };

  const deps = buildAppDeps();
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";

  try {
    if (id) {
      await deps.recommendations.updateRecommendation(id, {
        title,
        bodyMd,
        tags,
        media,
      });
      return { ok: true, recommendationId: id, wasUpdate: true };
    }
    const row = await deps.recommendations.createRecommendation(
      {
        title,
        bodyMd,
        tags,
        media,
      },
      session.user.userId,
    );
    return { ok: true, recommendationId: row.id, wasUpdate: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения" };
  }
}

export async function archiveRecommendationCore(formData: FormData): Promise<{ archivedId: string | null }> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { archivedId: null };

  const deps = buildAppDeps();
  await deps.recommendations.archiveRecommendation(id);
  return { archivedId: id };
}
