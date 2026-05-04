import { z } from "zod";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/infra/logging/logger";
import {
  isTestSetArchiveAlreadyArchivedError,
  isTestSetArchiveNotFoundError,
  isTestSetUnarchiveNotArchivedError,
  isTestSetUsageConfirmationRequiredError,
} from "@/modules/tests/errors";
import type { TestSetItemInput, TestSetUsageSnapshot } from "@/modules/tests/types";

export type SaveTestSetState = { ok: boolean; error?: string };

export type ArchiveTestSetState =
  | { ok: true }
  | { ok: false; code: "USAGE_CONFIRMATION_REQUIRED"; usage: TestSetUsageSnapshot }
  | { ok: false; error: string };

export type ArchiveTestSetCoreResult =
  | { kind: "archived"; id: string }
  | { kind: "needs_confirmation"; usage: TestSetUsageSnapshot }
  | { kind: "invalid"; error: string };

export type UnarchiveTestSetState = { ok: true } | { ok: false; error: string };

export type UnarchiveTestSetCoreResult =
  | { kind: "unarchived"; id: string }
  | { kind: "invalid"; error: string };

export const NEW_TEST_SET_DRAFT_TITLE = "Новый набор тестов";

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get("acknowledgeUsageWarning");
  return v === "1" || v === "true" || v === "on";
}

export { TEST_SETS_PATH } from "./paths";

const itemsPayloadSchema = z.array(
  z.object({
    testId: z.string().uuid(),
    comment: z.union([z.string().max(10000), z.null()]).optional(),
  }),
);

/** Порядок элементов в JSON — порядок в наборе (sortOrder выставляется по индексу). */
export function parseTestSetItemsPayloadJson(raw: string): TestSetItemInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Некорректный JSON состава набора");
  }
  const arr = itemsPayloadSchema.parse(parsed);
  return arr.map((it, idx) => ({
    testId: it.testId,
    sortOrder: idx,
    comment:
      it.comment === undefined || it.comment === null || it.comment.trim() === "" ? null : it.comment.trim(),
  }));
}

export async function saveTestSetCore(
  formData: FormData,
): Promise<{ ok: true; setId: string; wasUpdate: boolean } | { ok: false; error: string }> {
  const session = await requireDoctorAccess();
  const idRaw = formData.get("id");
  const titleField = formData.get("title");
  const title = typeof titleField === "string" ? titleField.trim() : "";
  const descField = formData.get("description");
  const description = typeof descField === "string" ? descField.trim() : "";
  const intentRaw = formData.get("intent");
  const intent =
    typeof intentRaw === "string" && intentRaw.trim() === "publish" ? "publish" : "save_draft";
  const itemsPayloadRaw = formData.get("itemsPayload");

  if (!title) return { ok: false, error: "Название набора обязательно" };

  const deps = buildAppDeps();
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  let initialItems: TestSetItemInput[] | null = null;
  if (typeof itemsPayloadRaw === "string" && itemsPayloadRaw.trim().length > 0) {
    try {
      initialItems = parseTestSetItemsPayloadJson(itemsPayloadRaw);
    } catch (e) {
      if (e instanceof z.ZodError) return { ok: false, error: "Некорректный формат состава набора" };
      return { ok: false, error: e instanceof Error ? e.message : "Ошибка разбора состава" };
    }
  }

  try {
    if (id) {
      const cur = await deps.testSets.getTestSet(id);
      if (!cur) return { ok: false, error: "Набор не найден" };
      if (cur.isArchived) {
        return { ok: false, error: "Набор в архиве. Верните из архива, чтобы редактировать." };
      }
      const nextPublicationStatus = intent === "publish" ? "published" : cur.publicationStatus;
      await deps.testSets.updateTestSet(id, {
        title,
        description: description || null,
        publicationStatus: nextPublicationStatus,
      });
      return { ok: true, setId: id, wasUpdate: true };
    }
    const nextPublicationStatus = intent === "publish" ? "published" : "draft";
    const row = await deps.testSets.createTestSet(
      {
        title,
        description: description || null,
        publicationStatus: nextPublicationStatus,
      },
      session.user.userId,
    );
    if (initialItems) {
      await deps.testSets.setTestSetItems(row.id, initialItems);
    }
    return { ok: true, setId: row.id, wasUpdate: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения" };
  }
}

export async function createTestSetDraftCore(
  input: { title?: string; description?: string | null; publicationStatus?: "draft" | "published" } = {},
): Promise<{ ok: true; setId: string } | { ok: false; error: string }> {
  const session = await requireDoctorAccess();
  const title = input.title?.trim() || NEW_TEST_SET_DRAFT_TITLE;
  const description = input.description?.trim() || null;
  const publicationStatus = input.publicationStatus;
  const deps = buildAppDeps();
  try {
    const row = await deps.testSets.createTestSet(
      {
        title,
        description,
        ...(publicationStatus !== undefined ? { publicationStatus } : {}),
      },
      session.user.userId,
    );
    return { ok: true, setId: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось создать черновик набора" };
  }
}

export async function saveTestSetItemsCore(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireDoctorAccess();
  const setIdRaw = formData.get("setId");
  const payloadRaw = formData.get("itemsPayload");
  const setId = typeof setIdRaw === "string" ? setIdRaw.trim() : "";
  const payloadText = typeof payloadRaw === "string" ? payloadRaw : "";

  if (!setId) return { ok: false, error: "Не указан набор" };

  let items: TestSetItemInput[];
  try {
    items = parseTestSetItemsPayloadJson(payloadText);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Некорректный формат состава набора" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка разбора состава" };
  }

  const deps = buildAppDeps();
  try {
    const set = await deps.testSets.getTestSet(setId);
    if (!set) return { ok: false, error: "Набор не найден" };
    if (set.isArchived) {
      return { ok: false, error: "Набор в архиве. Верните из архива, чтобы менять состав." };
    }
    await deps.testSets.setTestSetItems(setId, items);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения состава" };
  }
}

export async function archiveTestSetCore(formData: FormData): Promise<ArchiveTestSetCoreResult> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указан набор" };

  const acknowledgeUsageWarning = parseAcknowledgeUsageWarning(formData);
  const deps = buildAppDeps();
  try {
    await deps.testSets.archiveTestSet(id, { acknowledgeUsageWarning });
    return { kind: "archived", id };
  } catch (e) {
    if (isTestSetUsageConfirmationRequiredError(e)) {
      return { kind: "needs_confirmation", usage: e.usage };
    }
    if (isTestSetArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isTestSetArchiveAlreadyArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn({ event: "doctor_test_set_archive_unexpected_error", testSetId: id, err: e }, "archive failed");
    return { kind: "invalid", error: "Не удалось архивировать набор" };
  }
}

export async function unarchiveTestSetCore(formData: FormData): Promise<UnarchiveTestSetCoreResult> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { kind: "invalid", error: "Не указан набор" };

  const deps = buildAppDeps();
  try {
    await deps.testSets.unarchiveTestSet(id);
    return { kind: "unarchived", id };
  } catch (e) {
    if (isTestSetArchiveNotFoundError(e)) {
      return { kind: "invalid", error: e.message };
    }
    if (isTestSetUnarchiveNotArchivedError(e)) {
      return { kind: "invalid", error: e.message };
    }
    logger.warn({ event: "doctor_test_set_unarchive_unexpected_error", testSetId: id, err: e }, "unarchive failed");
    return { kind: "invalid", error: "Не удалось вернуть набор из архива" };
  }
}
