/** Client upload for patient program-item submission (presign → PUT → confirm). */

import { MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS } from '@/modules/media/programSubmissionUploadLimits';

export type ProgramSubmissionUploadResult =
  | { ok: true; mediaId: string; url: string; isVideo: boolean }
  | { ok: false; error: string };

async function readVideoDurationSeconds(file: File): Promise<number | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number | null>((resolve) => {
      const video = document.createElement('video');
      let settled = false;
      let timeoutId: number | undefined;
      const finish = (duration: number | null) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
        resolve(duration);
      };
      timeoutId = window.setTimeout(() => finish(null), 5_000);
      video.preload = 'metadata';
      video.onloadedmetadata = () =>
        finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
      video.onerror = () => finish(null);
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadProgramSubmissionMedia(
  file: File,
): Promise<ProgramSubmissionUploadResult> {
  const mime = (file.type || 'application/octet-stream').toLowerCase();
  const isVideo = mime.startsWith('video/');
  const durationSeconds = isVideo ? await readVideoDurationSeconds(file) : null;
  if (isVideo) {
    if (durationSeconds === null) {
      return { ok: false, error: 'video_metadata_unavailable' };
    }
    if (durationSeconds < MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS) {
      return { ok: false, error: 'video_too_short' };
    }
  }
  const presignRes = await fetch('/api/patient/media/program-submission/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: mime,
      size: file.size,
      ...(isVideo && durationSeconds !== null ? { durationSeconds } : {}),
    }),
  });
  const presignData = (await presignRes.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    mediaId?: string;
    uploadUrl?: string;
  } | null;
  if (!presignRes.ok || !presignData?.ok || !presignData.mediaId || !presignData.uploadUrl) {
    return { ok: false, error: presignData?.error ?? 'presign_failed' };
  }

  const putRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: file,
  });
  if (!putRes.ok) {
    return { ok: false, error: 'upload_failed' };
  }

  const confirmRes = await fetch('/api/patient/media/program-submission/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId: presignData.mediaId }),
  });
  const confirmData = (await confirmRes.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    mediaId?: string;
    url?: string;
  } | null;
  if (!confirmRes.ok || !confirmData?.ok || !confirmData.mediaId || !confirmData.url) {
    return { ok: false, error: confirmData?.error ?? 'confirm_failed' };
  }

  return {
    ok: true,
    mediaId: confirmData.mediaId,
    url: confirmData.url,
    isVideo,
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
    const res = await fetch(
      `/api/patient/media/program-submission/${encodeURIComponent(mediaId)}/status`,
    );
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      ready?: boolean;
      state?: string;
    } | null;
    if (res.ok && data?.ok && data.ready) return true;
    if (res.ok && data?.ok && data.state === 'failed') return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
