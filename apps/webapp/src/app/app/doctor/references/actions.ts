"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

function parseSortOrder(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string") return 999;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 999;
}

function parseCategoryCode(formData: FormData): string {
  const code = (formData.get("categoryCode") as string | null)?.trim() ?? "";
  if (!code) throw new Error("category_required");
  return code;
}

function revalidateReferencePaths(categoryCode: string): void {
  revalidatePath("/app/doctor/references");
  revalidatePath(`/app/doctor/references/${categoryCode}`);
}

export async function addReferenceItem(formData: FormData): Promise<void> {
  await requireDoctorAccess();
  const categoryCode = parseCategoryCode(formData);
  const code = (formData.get("code") as string | null)?.trim() ?? "";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  if (!/^[a-z][a-z0-9_]*$/.test(code)) {
    throw new Error("invalid_code");
  }
  if (!title) {
    throw new Error("title_required");
  }
  const deps = buildAppDeps();
  await deps.references.insertItemStaff({
    categoryCode,
    code,
    title,
    sortOrder: parseSortOrder(formData.get("sortOrder")),
  });
  revalidateReferencePaths(categoryCode);
}

export async function saveReferenceItem(formData: FormData): Promise<void> {
  await requireDoctorAccess();
  const categoryCode = parseCategoryCode(formData);
  const itemId = (formData.get("itemId") as string | null)?.trim() ?? "";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  if (!itemId) throw new Error("item_required");
  if (!title) throw new Error("title_required");
  const deps = buildAppDeps();
  await deps.references.updateItem(itemId, {
    title,
    sortOrder: parseSortOrder(formData.get("sortOrder")),
  });
  revalidateReferencePaths(categoryCode);
}

export async function toggleReferenceItem(formData: FormData): Promise<void> {
  await requireDoctorAccess();
  const categoryCode = parseCategoryCode(formData);
  const itemId = (formData.get("itemId") as string | null)?.trim() ?? "";
  const nextActiveRaw = (formData.get("nextActive") as string | null)?.trim() ?? "";
  const nextActive = nextActiveRaw === "true";
  if (!itemId) throw new Error("item_required");
  const deps = buildAppDeps();
  await deps.references.updateItem(itemId, { isActive: nextActive });
  revalidateReferencePaths(categoryCode);
}
