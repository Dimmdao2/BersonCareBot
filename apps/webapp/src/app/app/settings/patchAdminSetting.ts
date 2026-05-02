/**
 * PATCH ключей scope=admin через `/api/admin/settings`.
 */
export async function patchAdminSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: { value } }),
  });
  return res.ok;
}

export type AdminModesBatchItem = { key: string; value: unknown };

export type PatchAdminSettingsBatchResult =
  | { ok: true }
  | { ok: false; error?: string; atIndex?: number; key?: string };

/**
 * Один PATCH со списком ключей формы «Режимы» (`items`), атомарная запись в БД.
 */
export async function patchAdminSettingsBatch(items: AdminModesBatchItem[]): Promise<PatchAdminSettingsBatchResult> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((it) => ({
        key: it.key,
        value: { value: it.value },
      })),
    }),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { ok: true };
  return {
    ok: false,
    error: typeof data?.error === "string" ? data.error : undefined,
    atIndex: typeof data?.atIndex === "number" ? data.atIndex : undefined,
    key: typeof data?.key === "string" ? data.key : undefined,
  };
}
