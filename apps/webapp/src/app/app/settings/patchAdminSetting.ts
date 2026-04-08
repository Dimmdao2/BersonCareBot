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
