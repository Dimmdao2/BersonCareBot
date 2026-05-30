/** Client upload for patient program-item submission (presign → PUT → confirm). */

export type ProgramSubmissionUploadResult =
  | { ok: true; mediaId: string; url: string; isVideo: boolean }
  | { ok: false; error: string };

export async function uploadProgramSubmissionMedia(file: File): Promise<ProgramSubmissionUploadResult> {
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const presignRes = await fetch("/api/patient/media/program-submission/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: mime,
      size: file.size,
    }),
  });
  const presignData = (await presignRes.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    mediaId?: string;
    uploadUrl?: string;
  } | null;
  if (!presignRes.ok || !presignData?.ok || !presignData.mediaId || !presignData.uploadUrl) {
    return { ok: false, error: presignData?.error ?? "presign_failed" };
  }

  const putRes = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!putRes.ok) {
    return { ok: false, error: "upload_failed" };
  }

  const confirmRes = await fetch("/api/patient/media/program-submission/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId: presignData.mediaId }),
  });
  const confirmData = (await confirmRes.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    mediaId?: string;
    url?: string;
  } | null;
  if (!confirmRes.ok || !confirmData?.ok || !confirmData.mediaId || !confirmData.url) {
    return { ok: false, error: confirmData?.error ?? "confirm_failed" };
  }

  return {
    ok: true,
    mediaId: confirmData.mediaId,
    url: confirmData.url,
    isVideo: mime.startsWith("video/"),
  };
}

export async function waitForProgramSubmissionMediaReady(
  mediaId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const intervalMs = opts?.intervalMs ?? 2_500;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`/api/patient/media/program-submission/${encodeURIComponent(mediaId)}/status`);
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      ready?: boolean;
      state?: string;
    } | null;
    if (res.ok && data?.ok && data.ready) return true;
    if (res.ok && data?.ok && data.state === "failed") return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
