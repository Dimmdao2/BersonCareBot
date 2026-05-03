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

function parseAcknowledgeUsageWarning(fd: FormData): boolean {
  const v = fd.get("acknowledgeUsageWarning");
  return v === "1" || v === "true" || v === "on";
}

export { TEST_SETS_PATH } from "./paths";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseItemLines(raw: string): TestSetItemInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: TestSetItemInput[] = [];
  for (let i = 0; i < lines.length; i++) {
    const testId = lines[i]!;
    if (!UUID_RE.test(testId)) {
      throw new Error(`Некорректный UUID в строке ${i + 1}: ${testId}`);
    }
    out.push({ testId, sortOrder: i });
  }
  return out;
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
  const pubField = formData.get("publicationStatus");
  const publicationStatus =
    pubField === "draft" || pubField === "published" ? pubField : undefined;

  if (!title) return { ok: false, error: "Название набора обязательно" };

  const deps = buildAppDeps();
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";

  try {
    if (id) {
      const cur = await deps.testSets.getTestSet(id);
      if (!cur) return { ok: false, error: "Набор не найден" };
      if (cur.isArchived) {
        return { ok: false, error: "Набор в архиве. Верните из архива, чтобы редактировать." };
      }
      await deps.testSets.updateTestSet(id, {
        title,
        description: description || null,
        ...(publicationStatus !== undefined ? { publicationStatus } : {}),
      });
      return { ok: true, setId: id, wasUpdate: true };
    }
    const row = await deps.testSets.createTestSet(
      {
        title,
        description: description || null,
        ...(publicationStatus !== undefined ? { publicationStatus } : {}),
      },
      session.user.userId,
    );
    return { ok: true, setId: row.id, wasUpdate: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения" };
  }
}

export async function saveTestSetItemsCore(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireDoctorAccess();
  const setIdRaw = formData.get("setId");
  const linesRaw = formData.get("itemLines");
  const setId = typeof setIdRaw === "string" ? setIdRaw.trim() : "";
  const linesText = typeof linesRaw === "string" ? linesRaw : "";

  if (!setId) return { ok: false, error: "Не указан набор" };

  let items: TestSetItemInput[];
  try {
    items = parseItemLines(linesText);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка разбора строк" };
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
