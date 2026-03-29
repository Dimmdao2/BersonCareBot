"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type SaveContentPageState = { ok: boolean; error?: string };

const API_MEDIA_URL_RE =
  /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLegacyAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function saveContentPage(
  _prev: SaveContentPageState | null,
  formData: FormData,
): Promise<SaveContentPageState> {
  await requireDoctorAccess();
  const deps = buildAppDeps();

  const section = (formData.get("section") as string)?.trim() || "";
  const slug = (formData.get("slug") as string)?.trim() || "";
  const sectionRow = await deps.contentSections.getBySlug(section);
  if (!sectionRow) {
    return { ok: false, error: "Раздел не найден. Создайте раздел в «Контент → Разделы»." };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug: только латиница, цифры и дефис" };
  }
  if (/^-+$/.test(slug)) {
    return { ok: false, error: "Slug не может состоять только из дефисов" };
  }
  const title = (formData.get("title") as string)?.trim() || "";
  const summary = (formData.get("summary") as string)?.trim() || "";
  const bodyMd = (formData.get("body_md") as string) ?? "";
  const bodyHtmlLegacy = (formData.get("body_html") as string) ?? "";
  if (title.length > 500) return { ok: false, error: "Заголовок слишком длинный" };
  if (summary.length > 2000) return { ok: false, error: "Краткое описание слишком длинное" };
  if (bodyMd.length > 50000) return { ok: false, error: "Текст страницы слишком большой" };
  if (bodyHtmlLegacy.length > 50000) return { ok: false, error: "HTML слишком большой" };
  const bodyMdStored = bodyMd.length > 0 ? bodyMd : "";
  const bodyHtmlStored = bodyMd.length > 0 ? "" : bodyHtmlLegacy;
  if (slug.length > 200) return { ok: false, error: "Slug слишком длинный" };
  const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
  const isPublished = formData.get("is_published") === "on";
  const videoUrlRaw = (formData.get("video_url") as string)?.trim() || "";
  const imageUrlRaw = (formData.get("image_url") as string)?.trim() || "";
  const videoUrl = videoUrlRaw.length ? videoUrlRaw : null;
  const imageUrl = imageUrlRaw.length ? imageUrlRaw : null;

  if (!slug || !title) return { ok: false, error: "Заполните заголовок и slug" };
  if (!section) return { ok: false, error: "Выберите раздел" };
  if (imageUrl && !(API_MEDIA_URL_RE.test(imageUrl) || isLegacyAbsoluteUrl(imageUrl))) {
    return { ok: false, error: "Картинка должна быть выбрана из библиотеки файлов" };
  }
  if (videoUrl && !(API_MEDIA_URL_RE.test(videoUrl) || isLegacyAbsoluteUrl(videoUrl))) {
    return { ok: false, error: "Видео должно быть выбрано из библиотеки файлов" };
  }

  let videoType: string | null = null;
  if (videoUrl) {
    if (API_MEDIA_URL_RE.test(videoUrl)) {
      videoType = "api";
    } else {
      videoType =
        videoUrl.includes("youtube") || videoUrl.includes("youtu.be")
          ? "youtube"
          : "url";
    }
  }

  try {
    await deps.contentPages.upsert({
      section,
      slug,
      title,
      summary,
      bodyMd: bodyMdStored,
      bodyHtml: bodyHtmlStored,
      sortOrder,
      isPublished,
      videoUrl,
      videoType,
      imageUrl,
    });
  } catch (err) {
    console.error("saveContentPage failed:", err);
    return { ok: false, error: "Не удалось сохранить страницу. Попробуйте ещё раз." };
  }

  revalidatePath("/app/doctor/content");
  revalidatePath(`/app/patient/content/${slug}`);
  revalidatePath("/app/patient/sections", "layout");
  return { ok: true };
}
