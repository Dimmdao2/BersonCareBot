import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "application/pdf",
]);

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
  if (mime === "video/mp4") {
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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  const bytes = new Uint8Array(buf);

  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
  }
  if (!isAllowedByMagicBytes(mime, bytes)) {
    return NextResponse.json({ error: "file_signature_mismatch", mime }, { status: 415 });
  }

  const deps = buildAppDeps();
  try {
    const result = await deps.media.upload({
      body: buf,
      filename: file.name || "upload",
      mimeType: mime,
      userId: session.user.userId,
    });
    return NextResponse.json({
      ok: true as const,
      mediaId: result.record.id,
      url: result.url,
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
