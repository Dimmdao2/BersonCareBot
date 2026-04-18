import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ClinicalTestMediaItem } from "@/modules/tests/types";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

export type SaveClinicalTestState = { ok: boolean; error?: string };

export { CLINICAL_TESTS_PATH } from "./paths";

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

function parseScoringJson(raw: FormDataEntryValue | null): unknown | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    throw new Error("Некорректный JSON в поле scoring_config");
  }
}

export async function saveClinicalTestCore(formData: FormData): Promise<
  | { ok: true; testId: string; wasUpdate: boolean }
  | { ok: false; error: string }
> {
  const session = await requireDoctorAccess();

  const idRaw = formData.get("id");
  const titleField = formData.get("title");
  const title = typeof titleField === "string" ? titleField.trim() : "";
  const descField = formData.get("description");
  const description = typeof descField === "string" ? descField.trim() : "";
  const testTypeField = formData.get("testType");
  const testType = typeof testTypeField === "string" ? testTypeField.trim() : "";
  let scoringConfig: unknown | null = null;
  try {
    scoringConfig = parseScoringJson(formData.get("scoringConfigJson"));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка scoring_config" };
  }

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

  const media: ClinicalTestMediaItem[] = [];
  if (mediaUrl && mediaType) {
    media.push({ mediaUrl, mediaType, sortOrder: 0 });
  }

  const deps = buildAppDeps();
  const tags = parseTags(formData.get("tags"));

  if (!title) return { ok: false, error: "Название обязательно" };

  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";

  try {
    if (id) {
      await deps.clinicalTests.updateClinicalTest(id, {
        title,
        description: description || null,
        testType: testType || null,
        scoringConfig,
        tags,
        media,
      });
      return { ok: true, testId: id, wasUpdate: true };
    }
    const row = await deps.clinicalTests.createClinicalTest(
      {
        title,
        description: description || null,
        testType: testType || null,
        scoringConfig,
        tags,
        media,
      },
      session.user.userId,
    );
    return { ok: true, testId: row.id, wasUpdate: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения" };
  }
}

export async function archiveClinicalTestCore(formData: FormData): Promise<{ archivedId: string | null }> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { archivedId: null };

  const deps = buildAppDeps();
  await deps.clinicalTests.archiveClinicalTest(id);
  return { archivedId: id };
}
