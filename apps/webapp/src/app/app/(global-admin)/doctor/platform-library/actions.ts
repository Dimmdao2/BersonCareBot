"use server";

import { revalidatePath } from "next/cache";
import { enterWithDbInfraPrincipal } from "@bersoncare/db-principal";
import { requirePlatformOperationsPage } from "@/app-layer/guards/requireRole";
import { createPgPlatformLfkLibraryPort } from "@/infra/repos/pgPlatformLfkLibrary";
import { createPlatformLfkLibraryService } from "@/modules/platform-lfk-library/service";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

const PAGE_PATH = "/app/doctor/platform-library";

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

async function operatorContext() {
  const session = await requirePlatformOperationsPage();
  enterWithDbInfraPrincipal({ source: "platform-lfk-library" });
  return {
    actorId: isPlatformUserUuid(session.user.userId) ? session.user.userId : null,
    service: createPlatformLfkLibraryService(createPgPlatformLfkLibraryPort()),
  };
}

export async function savePlatformExerciseAction(formData: FormData): Promise<void> {
  const { actorId, service } = await operatorContext();
  const title = value(formData, "title");
  if (!title) throw new Error("Название упражнения обязательно");
  const mediaUrl = value(formData, "mediaUrl");
  const mediaTypeRaw = value(formData, "mediaType");
  const mediaType = mediaTypeRaw === "video" || mediaTypeRaw === "gif" ? mediaTypeRaw : "image";
  await service.saveExercise(actorId, {
    id: value(formData, "id") || undefined,
    title,
    description: value(formData, "description"),
    media: mediaUrl ? [{ url: mediaUrl, media_type: mediaType, sort_order: 0 }] : [],
  });
  revalidatePath(PAGE_PATH);
}

export async function setPlatformExerciseArchivedAction(formData: FormData): Promise<void> {
  const { actorId, service } = await operatorContext();
  await service.setExerciseArchived(actorId, value(formData, "id"), value(formData, "archived") === "1");
  revalidatePath(PAGE_PATH);
}

export async function savePlatformTemplateAction(formData: FormData): Promise<void> {
  const { actorId, service } = await operatorContext();
  const title = value(formData, "title");
  if (!title) throw new Error("Название комплекса обязательно");
  const exerciseIds = formData
    .getAll("exerciseIds")
    .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    .map((id) => id.trim());
  await service.saveTemplate(actorId, {
    id: value(formData, "id") || undefined,
    title,
    description: value(formData, "description"),
    exerciseIds,
  });
  revalidatePath(PAGE_PATH);
}

export async function setPlatformTemplateArchivedAction(formData: FormData): Promise<void> {
  const { actorId, service } = await operatorContext();
  await service.setTemplateArchived(actorId, value(formData, "id"), value(formData, "archived") === "1");
  revalidatePath(PAGE_PATH);
}
