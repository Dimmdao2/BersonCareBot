import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
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
  if (mime === "video/mp4" || mime === "video/quicktime") {
    /* ISO BMFF: size + "ftyp" — типично и для .mp4, и для .mov (QuickTime). */
    return bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
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
  if (mime === "application/pdf") {
    return hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
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
    console.error("media upload:", e);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
