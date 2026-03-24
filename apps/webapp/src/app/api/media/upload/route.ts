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

  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
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
