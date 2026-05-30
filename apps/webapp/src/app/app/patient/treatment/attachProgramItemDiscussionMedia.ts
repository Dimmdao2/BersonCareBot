/** Attach uploaded submission media to item discussion thread. */
export async function attachProgramItemDiscussionMedia(params: {
  instanceId: string;
  itemId: string;
  mediaFileId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `/api/patient/treatment-program-instances/${encodeURIComponent(params.instanceId)}/items/${encodeURIComponent(params.itemId)}/discussion/media`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaFileId: params.mediaFileId }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "attach_failed" };
  }
  return { ok: true };
}
