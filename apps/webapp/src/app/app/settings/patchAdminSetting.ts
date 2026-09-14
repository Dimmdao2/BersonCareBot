import { apiJson, ApiRequestError } from '@/shared/lib/apiJson';

/**
 * PATCH ключей scope=admin через `/api/admin/settings`.
 */
export async function patchAdminSetting(key: string, value: unknown): Promise<boolean> {
  return (await patchAdminSettingWithResult(key, value)).ok;
}

export type PatchAdminSettingResult =
  | { ok: true }
  /** `code` — машинный код отказа маршрута; человеку его показывать нельзя, он для выбора фразы. */
  | { ok: false; error?: string; code?: string };

export async function patchAdminSettingWithResult(
  key: string,
  value: unknown,
): Promise<PatchAdminSettingResult> {
  try {
    await apiJson<{ ok: boolean }>('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: { value } }),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      ...(error instanceof Error ? { error: error.message } : {}),
      ...(error instanceof ApiRequestError ? { code: error.code } : {}),
    };
  }
}

export type AdminModesBatchItem = { key: string; value: unknown };

export type PatchAdminSettingsBatchResult =
  | { ok: true }
  | { ok: false; error?: string; atIndex?: number; key?: string };

/**
 * Один PATCH со списком ключей формы «Режимы» (`items`), атомарная запись в БД.
 */
export async function patchAdminSettingsBatch(
  items: AdminModesBatchItem[],
): Promise<PatchAdminSettingsBatchResult> {
  try {
    await apiJson<{ ok: boolean }>('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((it) => ({
          key: it.key,
          value: { value: it.value },
        })),
      }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : undefined };
  }
}
