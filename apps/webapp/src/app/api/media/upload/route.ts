import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";
import { ALLOWED_MEDIA_MIME, MAX_PROXY_UPLOAD_BYTES } from "@/modules/media/uploadAllowedMime";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

/** ISO BMFF: 4-byte size then "ftyp" at offset 4. */
function isIsoBmffFtyp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function readBrand4(bytes: Uint8Array, offset: number): string {
  if (bytes.length < offset + 4) return "";
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function isHeicHeif(bytes: Uint8Array): boolean {
  if (!isIsoBmffFtyp(bytes)) return false;
  const b = readBrand4(bytes, 8);
  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(b);
}

function isAvifBrand(bytes: Uint8Array): boolean {
  if (!isIsoBmffFtyp(bytes)) return false;
  const b = readBrand4(bytes, 8);
  return b === "avif" || b === "avis";
}

/** M4A / generic audio in MP4 container. */
function isAudioMp4Container(bytes: Uint8Array): boolean {
  if (!isIsoBmffFtyp(bytes)) return false;
  const b = readBrand4(bytes, 8);
  return ["isom", "iso2", "mp41", "mp42", "M4A ", "M4V ", "dash"].includes(b);
}

function isSvgText(bytes: Uint8Array): boolean {
  try {
    const dec = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(512, bytes.length)));
    const t = dec.trimStart().replace(/^\uFEFF/, "");
    const lower = t.slice(0, 32).toLowerCase();
    return lower.startsWith("<?xml") || lower.startsWith("<svg");
  } catch {
    return false;
  }
}

function isAllowedByMagicBytes(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/jpeg") {
    return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  }
  if (mime === "image/png") {
    return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mime === "image/gif") {
    return hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  }
  if (mime === "image/webp") {
    return bytes.length >= 12 && hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (mime === "image/heic" || mime === "image/heif") {
    return isHeicHeif(bytes);
  }
  if (mime === "image/avif") {
    return isAvifBrand(bytes);
  }
  if (mime === "image/tiff") {
    return (
      (bytes.length >= 4 && bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
      (bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)
    );
  }
  if (mime === "image/svg+xml") {
    /* Do not render raw SVG in <img> without sanitization — download-only in CMS. */
    return isSvgText(bytes);
  }
  if (mime === "video/mp4" || mime === "video/quicktime") {
    return isIsoBmffFtyp(bytes);
  }
  if (mime === "video/webm") {
    return hasPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (mime === "audio/mpeg") {
    return hasPrefix(bytes, [0x49, 0x44, 0x33]) || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (mime === "audio/wav") {
    return (
      bytes.length >= 12 &&
      hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45
    );
  }
  if (mime === "audio/ogg") {
    return hasPrefix(bytes, [0x4f, 0x67, 0x67, 0x53]);
  }
  if (mime === "audio/aac") {
    /* ADTS sync (0xFFF…) or MP4-wrapped AAC. */
    return (
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) || isAudioMp4Container(bytes)
    );
  }
  if (mime === "audio/mp4" || mime === "audio/x-m4a") {
    return isAudioMp4Container(bytes);
  }
  if (mime === "application/pdf") {
    return hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  }
  if (mime === "application/msword" || mime === "application/vnd.ms-excel" || mime === "application/vnd.ms-powerpoint") {
    return hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]);
  }
  if (mime === "text/plain" || mime === "text/csv") {
    return true;
  }
  return false;
}

type UploadCandidate = {
  file: File;
  filename: string;
  mime: string;
  body: ArrayBuffer;
};

type UploadCandidateMeta = {
  file: File;
  filename: string;
  mime: string;
};

const MEDIA_FOLDER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUploadFolderIdFromForm(form: FormData): Promise<
  | { ok: true; folderId: string | null | undefined }
  | { ok: false; status: number; payload: Record<string, unknown> }
> {
  const raw = form.get("folderId");
  if (raw === null || raw === undefined) return { ok: true, folderId: undefined };
  if (typeof raw !== "string") return { ok: true, folderId: undefined };
  const t = raw.trim();
  if (t === "" || t === "root") return { ok: true, folderId: null };
  if (!MEDIA_FOLDER_ID_RE.test(t)) {
    return { ok: false, status: 400, payload: { error: "invalid_folder_id" } };
  }
  const pool = getPool();
  const r = await pool.query<{ id: string }>(`SELECT id FROM media_folders WHERE id = $1::uuid LIMIT 1`, [t]);
  if (r.rowCount === 0) {
    return { ok: false, status: 400, payload: { error: "folder_not_found" } };
  }
  return { ok: true, folderId: t };
}

function collectFilesFromForm(form: FormData): File[] {
  const fromSingle = form.get("file");
  const fromFiles = form.getAll("files");
  const fromFilesArray = form.getAll("files[]");
  const all = [fromSingle, ...fromFiles, ...fromFilesArray];
  return all.filter((entry): entry is File => entry instanceof File);
}

function validateFile(
  file: File,
  index: number,
): { ok: true; value: UploadCandidateMeta } | { ok: false; status: number; payload: Record<string, unknown> } {
  if (file.size > MAX_PROXY_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      payload: { error: "file_too_large", maxBytes: MAX_PROXY_UPLOAD_BYTES, index, filename: file.name || "upload" },
    };
  }
  if (file.size === 0) {
    return {
      ok: false,
      status: 400,
      payload: { error: "empty_file", index, filename: file.name || "upload" },
    };
  }
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MEDIA_MIME.has(mime)) {
    return {
      ok: false,
      status: 415,
      payload: { error: "mime_not_allowed", mime, index, filename: file.name || "upload" },
    };
  }
  return {
    ok: true,
    value: {
      file,
      filename: file.name || "upload",
      mime,
    },
  };
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const files = collectFilesFromForm(form);
  if (files.length === 0) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const folderRes = await resolveUploadFolderIdFromForm(form);
  if (!folderRes.ok) {
    return NextResponse.json(folderRes.payload, { status: folderRes.status });
  }

  const candidates: UploadCandidate[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    const validation = validateFile(file, i);
    if (!validation.ok) {
      return NextResponse.json(validation.payload, { status: validation.status });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isAllowedByMagicBytes(validation.value.mime, bytes)) {
      return NextResponse.json(
        {
          error: "file_signature_mismatch",
          mime: validation.value.mime,
          index: i,
          filename: validation.value.filename,
        },
        { status: 415 },
      );
    }
    candidates.push({
      ...validation.value,
      body: bytes.buffer,
    });
  }

  const deps = buildAppDeps();
  const uploaded: Array<{
    mediaId: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }> = [];
  try {
    for (const candidate of candidates) {
      const result = await deps.media.upload({
        body: candidate.body,
        filename: candidate.filename,
        mimeType: candidate.mime,
        userId: session.user.userId,
        ...(folderRes.folderId !== undefined ? { folderId: folderRes.folderId } : {}),
      });
      uploaded.push({
        mediaId: result.record.id,
        url: result.url,
        filename: candidate.filename,
        mimeType: candidate.mime,
        size: candidate.file.size,
      });
    }
    if (uploaded.length === 1) {
      const single = uploaded[0]!;
      return NextResponse.json({
        ok: true as const,
        mediaId: single.mediaId,
        url: single.url,
        uploaded,
      });
    }
    return NextResponse.json({
      ok: true as const,
      uploaded,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload_failed";
    if (msg === "media_upload_too_large") {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    logger.error({ err: e }, "[media/upload] failed");
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
