import { normalizeInstanceEditorDraft, type InstanceEditorDraft } from "./instanceEditorDraft";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

export type InstanceEditorItemLoadSettingsPatch = {
  reps: number | null;
  sets: number | null;
  maxPain: number | null;
};

export const INSTANCE_EDITOR_LOAD_REPS_RANGE = [1, 999] as const;
export const INSTANCE_EDITOR_LOAD_SETS_RANGE = [1, 99] as const;
export const INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE = [0, 10] as const;

export function parseInstanceEditorLoadField(
  raw: string,
  label: string,
  range: readonly [number, number],
): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || String(n) !== t.trim()) {
    throw new Error(`${label}: целое число или пусто`);
  }
  const [min, max] = range;
  if (n < min || n > max) {
    throw new Error(`${label}: целое число от ${min} до ${max}`);
  }
  return n;
}

export function validateInstanceEditorLoadSettingsPatch(
  loadSettings: InstanceEditorItemLoadSettingsPatch,
): string | null {
  const checks: Array<[number | null, string, readonly [number, number]]> = [
    [loadSettings.reps, "Повторы", INSTANCE_EDITOR_LOAD_REPS_RANGE],
    [loadSettings.sets, "Подходы", INSTANCE_EDITOR_LOAD_SETS_RANGE],
    [loadSettings.maxPain, "Макс. боль", INSTANCE_EDITOR_LOAD_MAX_PAIN_RANGE],
  ];
  for (const [value, label, range] of checks) {
    if (value === null) continue;
    const [min, max] = range;
    const n = Math.round(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return `${label}: целое число от ${min} до ${max}`;
    }
  }
  return null;
}

export function validateInstanceEditorDraftLoadSettings(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
  options?: { alreadyNormalized?: boolean },
): string | null {
  const normalized = options?.alreadyNormalized
    ? draft
    : normalizeInstanceEditorDraft(draft, baseline);
  for (const patch of Object.values(normalized.itemPatches)) {
    if (patch.loadSettings) {
      const err = validateInstanceEditorLoadSettingsPatch(patch.loadSettings);
      if (err) return err;
    }
  }
  for (const create of normalized.itemCreates) {
    if (create.kind === "library_item" && create.loadSettings) {
      const err = validateInstanceEditorLoadSettingsPatch(create.loadSettings);
      if (err) return err;
    }
    if (create.kind === "test_set_expand" || create.kind === "lfk_complex_expand") {
      for (const line of create.items) {
        if (line.loadSettings) {
          const err = validateInstanceEditorLoadSettingsPatch(line.loadSettings);
          if (err) return err;
        }
      }
    }
  }
  return null;
}

/** Ошибка из-за рассинхрона черновика с сервером (не каталог/архив/валидация). */
export function isStaleInstanceEditorSaveError(error: string): boolean {
  if (/недоступен/i.test(error)) return false;
  if (/Объект для типа/i.test(error)) return false;
  if (/некорректн/i.test(error)) return false;
  if (/нельзя /i.test(error)) return false;
  if (/целое число/i.test(error)) return false;
  return /(?:элемент|этап|группа|программа) не найден/i.test(error);
}

export function formatInstanceEditorSaveError(error: string, staleRefreshed: boolean): string {
  if (!staleRefreshed || !isStaleInstanceEditorSaveError(error)) return error;
  return `${error}. Программа обновлена — проверьте черновик и сохраните снова.`;
}
