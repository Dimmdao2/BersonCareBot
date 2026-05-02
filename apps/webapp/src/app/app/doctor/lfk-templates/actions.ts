"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/infra/logging/logger";
import {
  isLfkTemplateUsageConfirmationRequiredError,
  isTemplateArchiveAlreadyArchivedError,
  isTemplateArchiveNotFoundError,
  isTemplateUnarchiveNotArchivedError,
} from "@/modules/lfk-templates/errors";
import type { LfkTemplateUsageSnapshot, TemplateExerciseInput } from "@/modules/lfk-templates/types";
import { EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT } from "@/modules/lfk-templates/types";
import { sanitizeLfkTemplatesListPreserveQuery } from "./lfkTemplatesListPreserveQuery";

const BASE = "/app/doctor/lfk-templates";

export type ArchiveDoctorLfkTemplateState =
  | { ok: true }
  | { ok: false; code: "USAGE_CONFIRMATION_REQUIRED"; usage: LfkTemplateUsageSnapshot }
  | { ok: false; error: string };

export type UnarchiveDoctorLfkTemplateState = { ok: true } | { ok: false; error: string };

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get("acknowledgeUsageWarning");
  return v === "1" || v === "true" || v === "on";
}

async function archiveDoctorLfkTemplateCore(
  formData: FormData,
): Promise<
  | { kind: "archived" }
  | { kind: "needs_confirmation"; usage: LfkTemplateUsageSnapshot }
  | { kind: "invalid"; error: string }
> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указан шаблон комплекса" };

  const acknowledgeUsageWarning = parseAcknowledgeUsageWarning(formData);
  const deps = buildAppDeps();
  try {
    await deps.lfkTemplates.archiveTemplate(id, { acknowledgeUsageWarning });
    return { kind: "archived" };
  } catch (e) {
    if (isLfkTemplateUsageConfirmationRequiredError(e)) {
      return { kind: "needs_confirmation", usage: e.usage };
    }
    if (isTemplateArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isTemplateArchiveAlreadyArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn({ event: "doctor_lfk_template_archive_unexpected_error", templateId: id, err: e }, "archive failed");
    return { kind: "invalid", error: "Не удалось архивировать комплекс" };
  }
}

async function unarchiveDoctorLfkTemplateCore(
  formData: FormData,
): Promise<{ kind: "unarchived"; id: string } | { kind: "invalid"; error: string }> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указан шаблон комплекса" };

  const deps = buildAppDeps();
  try {
    await deps.lfkTemplates.unarchiveTemplate(id);
    return { kind: "unarchived", id };
  } catch (e) {
    if (isTemplateArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isTemplateUnarchiveNotArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn({ event: "doctor_lfk_template_unarchive_unexpected_error", templateId: id, err: e }, "unarchive failed");
    return { kind: "invalid", error: "Не удалось вернуть комплекс из архива" };
  }
}

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
    const cur = await deps.lfkTemplates.getTemplate(payload.templateId);
    if (!cur) return { ok: false, error: "Шаблон не найден" };
    if (cur.status === "archived") {
      return { ok: false, error: "Комплекс в архиве. Верните из архива, чтобы редактировать." };
    }
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

export async function archiveDoctorLfkTemplate(
  _prev: ArchiveDoctorLfkTemplateState | null,
  formData: FormData,
): Promise<ArchiveDoctorLfkTemplateState> {
  const result = await archiveDoctorLfkTemplateCore(formData);
  if (result.kind === "needs_confirmation") {
    return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: result.usage };
  }
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(BASE);
  const preserveRaw = formData.get("listPreserveQuery");
  const safePreserve = sanitizeLfkTemplatesListPreserveQuery(
    typeof preserveRaw === "string" ? preserveRaw : "",
  );
  redirect(safePreserve ? `${BASE}?${safePreserve}` : BASE);
}

export async function unarchiveDoctorLfkTemplate(
  _prev: UnarchiveDoctorLfkTemplateState | null,
  formData: FormData,
): Promise<UnarchiveDoctorLfkTemplateState> {
  const result = await unarchiveDoctorLfkTemplateCore(formData);
  if (result.kind === "invalid") {
    return { ok: false, error: result.error };
  }
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${result.id}`);
  redirect(`${BASE}/${result.id}`);
}

export async function fetchDoctorLfkTemplateUsageSnapshot(templateId: string) {
  await requireDoctorAccess();
  const id = templateId.trim();
  if (!id) return { ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT };
  const deps = buildAppDeps();
  return deps.lfkTemplates.getTemplateUsage(id);
}
