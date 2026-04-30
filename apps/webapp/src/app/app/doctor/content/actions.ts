"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

export type SaveContentPageState = { ok: boolean; error?: string };

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
  const isPublished = formData.get("is_published") === "on";
  const requiresAuth = formData.get("requires_auth") === "on";
  const videoUrlRaw = (formData.get("video_url") as string)?.trim() || "";
  const imageUrlRaw = (formData.get("image_url") as string)?.trim() || "";
  const videoUrl = videoUrlRaw.length ? videoUrlRaw : null;
  const imageUrl = imageUrlRaw.length ? imageUrlRaw : null;

  const linkedRaw = (formData.get("linked_course_id") as string | null)?.trim() ?? "";
  let linkedCourseId: string | null = null;
  if (linkedRaw.length > 0) {
    const uuidParsed = z.string().uuid().safeParse(linkedRaw);
    if (!uuidParsed.success) {
      return { ok: false, error: "Связанный курс: укажите корректный UUID или оставьте пустым." };
    }
    linkedCourseId = uuidParsed.data;
  }

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

  const pageIdRaw = (formData.get("page_id") as string)?.trim() ?? "";
  const pageIdParsed = pageIdRaw.length > 0 ? z.string().uuid().safeParse(pageIdRaw) : null;
  if (pageIdRaw.length > 0 && !pageIdParsed?.success) {
    return { ok: false, error: "Некорректный идентификатор страницы" };
  }

  let allPages: Awaited<ReturnType<typeof deps.contentPages.listAll>>;
  try {
    allPages = await deps.contentPages.listAll();
  } catch (err) {
    console.error("saveContentPage listAll failed:", err);
    return {
      ok: false,
      error: "Не удалось загрузить список страниц. Попробуйте ещё раз.",
    };
  }

  const editingId = pageIdParsed?.success ? pageIdParsed.data : null;

  if (editingId) {
    const existingById = await deps.contentPages.getById(editingId);
    if (!existingById) {
      return { ok: false, error: "Страница не найдена" };
    }
    const dup = allPages.find((p) => p.section === section && p.slug === slug && p.id !== editingId);
    if (dup) {
      return { ok: false, error: "В выбранном разделе уже есть материал с таким slug" };
    }
    const sortOrder =
      existingById.section === section
        ? existingById.sortOrder
        : allPages
            .filter((p) => p.section === section)
            .reduce((max, pageRow) => Math.max(max, pageRow.sortOrder), -1) + 1;

    if (linkedCourseId) {
      const course = await deps.courses.getCourseForDoctor(linkedCourseId);
      if (!course || course.status !== "published") {
        return { ok: false, error: "Курс не найден или не опубликован." };
      }
    }

    try {
      await deps.contentPages.updateFull(editingId, {
        section,
        slug,
        title,
        summary,
        bodyMd: bodyMdStored,
        bodyHtml: bodyHtmlStored,
        sortOrder,
        isPublished,
        requiresAuth,
        videoUrl,
        videoType,
        imageUrl,
        linkedCourseId,
      });
    } catch (err) {
      console.error("saveContentPage failed:", err);
      return { ok: false, error: "Не удалось сохранить страницу. Попробуйте ещё раз." };
    }

    revalidatePath("/app/doctor/content");
    if (existingById.slug !== slug) {
      revalidatePath(`/app/patient/content/${existingById.slug}`);
    }
    revalidatePath(`/app/patient/content/${slug}`);
    revalidatePath("/app/patient/sections", "layout");
    return { ok: true };
  }

  const existingPage = allPages.find((p) => p.section === section && p.slug === slug);
  const sortOrder = existingPage
    ? existingPage.sortOrder
    : allPages
        .filter((p) => p.section === section)
        .reduce((max, pageRow) => Math.max(max, pageRow.sortOrder), -1) + 1;

  if (linkedCourseId) {
    const course = await deps.courses.getCourseForDoctor(linkedCourseId);
    if (!course || course.status !== "published") {
      return { ok: false, error: "Курс не найден или не опубликован." };
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
      requiresAuth,
      videoUrl,
      videoType,
      imageUrl,
      linkedCourseId,
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
