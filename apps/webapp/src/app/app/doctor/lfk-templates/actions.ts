"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { TemplateExerciseInput } from "@/modules/lfk-templates/types";

const BASE = "/app/doctor/lfk-templates";

export async function createLfkTemplateDraft(formData: FormData) {
  const session = await requireDoctorAccess();
  const titleRaw = formData.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : "Новый шаблон";
  const deps = buildAppDeps();
  const t = await deps.lfkTemplates.createTemplate({ title }, session.user.userId);
  revalidatePath(BASE);
  redirect(`${BASE}/${t.id}`);
}

export async function persistLfkTemplateDraft(payload: {
  templateId: string;
  title: string;
  description: string | null;
  exercises: TemplateExerciseInput[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireDoctorAccess();
    const deps = buildAppDeps();
    await deps.lfkTemplates.updateTemplate(payload.templateId, {
      title: payload.title,
      description: payload.description,
    });
    await deps.lfkTemplates.updateExercises(payload.templateId, payload.exercises);
    revalidatePath(BASE);
    revalidatePath(`${BASE}/${payload.templateId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить" };
  }
}

export async function publishLfkTemplateAction(
  templateId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireDoctorAccess();
    const deps = buildAppDeps();
    await deps.lfkTemplates.publishTemplate(templateId);
    revalidatePath(BASE);
    revalidatePath(`${BASE}/${templateId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось опубликовать" };
  }
}

export async function archiveLfkTemplateAction(templateId: string) {
  await requireDoctorAccess();
  const deps = buildAppDeps();
  await deps.lfkTemplates.archiveTemplate(templateId);
  revalidatePath(BASE);
  redirect(BASE);
}
