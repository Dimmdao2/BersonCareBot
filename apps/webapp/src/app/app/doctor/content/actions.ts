"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function saveContentPage(formData: FormData) {
  await requireDoctorAccess();
  const deps = buildAppDeps();

  const section = (formData.get("section") as string)?.trim() || "lessons";
  const slug = (formData.get("slug") as string)?.trim() || "";
  const ALLOWED_SECTIONS = ["lessons", "emergency"];
  if (!ALLOWED_SECTIONS.includes(section)) return;
  if (!/^[a-z0-9-]+$/.test(slug)) return;
  const title = (formData.get("title") as string)?.trim() || "";
  const summary = (formData.get("summary") as string)?.trim() || "";
  const bodyHtml = (formData.get("body_html") as string) || "";
  const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
  const isPublished = formData.get("is_published") === "on";
  const videoUrl = (formData.get("video_url") as string)?.trim() || null;

  if (!slug || !title) return;

  let videoType: string | null = null;
  if (videoUrl) {
    videoType =
      videoUrl.includes("youtube") || videoUrl.includes("youtu.be")
        ? "youtube"
        : "url";
  }

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

  revalidatePath("/app/doctor/content");
  revalidatePath(`/app/patient/content/${slug}`);
  revalidatePath("/app/patient/lessons");
  revalidatePath("/app/patient/emergency");
}
