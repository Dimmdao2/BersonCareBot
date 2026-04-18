import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { TestSetItemInput } from "@/modules/tests/types";

export type SaveTestSetState = { ok: boolean; error?: string };
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

  if (!title) return { ok: false, error: "Название набора обязательно" };

  const deps = buildAppDeps();
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";

  try {
    if (id) {
      await deps.testSets.updateTestSet(id, {
        title,
        description: description || null,
      });
      return { ok: true, setId: id, wasUpdate: true };
    }
    const row = await deps.testSets.createTestSet(
      { title, description: description || null },
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
    await deps.testSets.setTestSetItems(setId, items);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения состава" };
  }
}

export async function archiveTestSetCore(formData: FormData): Promise<{ archivedId: string | null }> {
  await requireDoctorAccess();
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
  if (!id) return { archivedId: null };

  const deps = buildAppDeps();
  await deps.testSets.archiveTestSet(id);
  return { archivedId: id };
}
