"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type SaveContentPageState = { ok: boolean; error?: string };

export async function saveContentPage(
  _prev: SaveContentPageState | null,
  formData: FormData,
): Promise<SaveContentPageState> {
  await requireDoctorAccess();
  const deps = buildAppDeps();

  const section = (formData.get("section") as string)?.trim() || "lessons";
  const slug = (formData.get("slug") as string)?.trim() || "";
  const ALLOWED_SECTIONS = ["lessons", "emergency"];
  if (!ALLOWED_SECTIONS.includes(section)) {
    return { ok: false, error: "Недопустимый раздел" };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug: только латиница, цифры и дефис" };
  }
  const title = (formData.get("title") as string)?.trim() || "";
  const summary = (formData.get("summary") as string)?.trim() || "";
  const bodyHtml = (formData.get("body_html") as string) || "";
  if (title.length > 500) return { ok: false, error: "Заголовок слишком длинный" };
  if (summary.length > 2000) return { ok: false, error: "Краткое описание слишком длинное" };
  if (bodyHtml.length > 50000) return { ok: false, error: "HTML слишком большой" };
  if (slug.length > 200) return { ok: false, error: "Slug слишком длинный" };
  const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
  const isPublished = formData.get("is_published") === "on";
  const videoUrl = (formData.get("video_url") as string)?.trim() || null;

  if (!slug || !title) return { ok: false, error: "Заполните заголовок и slug" };

  let videoType: string | null = null;
  if (videoUrl) {
    videoType =
      videoUrl.includes("youtube") || videoUrl.includes("youtu.be")
        ? "youtube"
        : "url";
  }

  try {
    await deps.contentPages.upsert({
      section,
      slug,
      title,
      summary,
      bodyHtml,
      sortOrder,
      isPublished,
      videoUrl,
      videoType,
      imageUrl: null,
    });
  } catch (err) {
    console.error("saveContentPage failed:", err);
    return { ok: false, error: "Не удалось сохранить страницу. Попробуйте ещё раз." };
  }

  revalidatePath("/app/doctor/content");
  revalidatePath(`/app/patient/content/${slug}`);
  revalidatePath("/app/patient/lessons");
  revalidatePath("/app/patient/emergency");
  return { ok: true };
}
