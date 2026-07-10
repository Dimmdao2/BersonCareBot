"use server";

import { revalidatePath } from "next/cache";
import { revalidatePatientContentPaths } from "@/app-layer/content/revalidatePatientContentPaths";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

export type ContentPageAuthState = { ok: boolean; error?: string };

export async function setContentPageRequiresAuth(
  id: string,
  requiresAuth: boolean,
): Promise<ContentPageAuthState> {
  const workspace = await requireDoctorWorkspaceContext();
  const pageId = id?.trim();
  if (!pageId) return { ok: false, error: "Нет id" };

  const deps = buildAppDeps();
  const page = await deps.contentPages.getById(pageId);
  try {
    await withDoctorWorkspacePrincipal(workspace, "doctor.content.page.requires-auth", () =>
      deps.contentPages.updateLifecycle(pageId, { requiresAuth }),
    );
  } catch (e) {
    console.error("setContentPageRequiresAuth", e);
    return { ok: false, error: "Не удалось обновить доступ" };
  }

  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  if (page) {
    revalidatePatientContentPaths({ slug: page.slug, section: page.section });
  } else {
    revalidatePath("/app/patient/sections", "layout");
  }
  return { ok: true };
}
