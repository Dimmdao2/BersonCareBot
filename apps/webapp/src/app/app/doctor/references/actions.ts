"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";

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

type CatalogRowInput = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
};

type CatalogAddInput = {
  code: string;
  title: string;
  sortOrder: number;
};

const SAVE_CATALOG_KNOWN_CODES = new Set([
  "duplicate_code",
  "invalid_update_payload",
  "invalid_add_payload",
  "category_required",
  "category_not_found",
  "category_not_extensible",
  "item_not_found",
  "empty_update",
]);

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export type SaveReferenceCatalogResult =
  | { ok: true }
  | { ok: false; code: string; invalidValue?: string; conflictingCodes?: string[] };

export async function saveReferenceCatalog(input: {
  categoryCode: string;
  updates: CatalogRowInput[];
  additions: CatalogAddInput[];
}): Promise<SaveReferenceCatalogResult> {
  await requireDoctorAccess();
  const categoryCode = input.categoryCode.trim();
  if (!categoryCode) return { ok: false, code: "category_required" };
  const deps = buildAppDeps();
  const updates = input.updates.map((item) => ({
    id: item.id.trim(),
    code: item.code.trim(),
    title: item.title.trim(),
    sortOrder: item.sortOrder,
    isActive: item.isActive,
  }));
  const additions = input.additions
    .map((item) => ({
      code: item.code.trim(),
      title: item.title.trim(),
      sortOrder: item.sortOrder,
    }))
    .filter((item) => item.code !== "" || item.title !== "");
  const badUpdate = updates.find(
    (item) => !item.id || !item.title || !/^[a-z][a-z0-9_]*$/.test(item.code)
  );
  if (badUpdate) {
    const invalidValue =
      !badUpdate.title.trim()
        ? badUpdate.id
        : !/^[a-z][a-z0-9_]*$/.test(badUpdate.code)
          ? badUpdate.code
          : badUpdate.title;
    return { ok: false, code: "invalid_update_payload", invalidValue };
  }
  const badAddition = additions.find((item) => !/^[a-z][a-z0-9_]*$/.test(item.code) || !item.title);
  if (badAddition) {
    const invalidValue =
      !/^[a-z][a-z0-9_]*$/.test(badAddition.code) && badAddition.code !== ""
        ? badAddition.code
        : !badAddition.title.trim() && badAddition.code !== ""
          ? badAddition.code
          : badAddition.title || badAddition.code;
    return { ok: false, code: "invalid_add_payload", invalidValue };
  }
  try {
    await deps.references.saveCatalog(categoryCode, { updates, additions });
  } catch (err) {
    if (err instanceof Error && SAVE_CATALOG_KNOWN_CODES.has(err.message)) {
      const conflictingCodes = (err as Error & { conflictingCodes?: string[] }).conflictingCodes;
      return {
        ok: false,
        code: err.message,
        ...(Array.isArray(conflictingCodes) && conflictingCodes.length > 0 ? { conflictingCodes } : {}),
      };
    }
    if (isPgUniqueViolation(err)) {
      return { ok: false, code: "duplicate_code" };
    }
    logServerRuntimeError("saveReferenceCatalog", err, { categoryCode });
    return { ok: false, code: "save_failed" };
  }
  revalidateReferencePaths(categoryCode);
  return { ok: true };
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

export type SoftDeleteReferenceItemResult = { ok: true } | { ok: false; code: string };

/** Soft-delete reference item (deleted_at); distinct from archive (is_active). */
export async function softDeleteReferenceItem(formData: FormData): Promise<SoftDeleteReferenceItemResult> {
  await requireDoctorAccess();
  let categoryCode: string;
  try {
    categoryCode = parseCategoryCode(formData);
  } catch (err) {
    if (err instanceof Error && err.message === "category_required") {
      return { ok: false, code: "category_required" };
    }
    throw err;
  }
  const itemId = (formData.get("itemId") as string | null)?.trim() ?? "";
  if (!itemId) return { ok: false, code: "item_required" };
  const deps = buildAppDeps();
  try {
    await deps.references.softDeleteItem(itemId);
  } catch (err) {
    logServerRuntimeError("softDeleteReferenceItem", err, { categoryCode, itemId });
    return { ok: false, code: "delete_failed" };
  }
  revalidateReferencePaths(categoryCode);
  return { ok: true };
}
