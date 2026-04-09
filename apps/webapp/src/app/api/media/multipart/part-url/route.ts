import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isS3MediaEnabled } from "@/config/env";
import { bumpSessionToUploading, gateUploadSessionForPartUrl } from "@/infra/repos/mediaUploadSessionsRepo";
import { presignUploadPartUrl } from "@/infra/s3/client";
import { getCurrentSession } from "@/modules/auth/service";
import { multipartMaxPartNumber } from "@/modules/media/multipartConstants";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  partNumber: z.number().int().min(1).max(10_000),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: "s3_not_configured" }, { status: 501 });
  }

  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const gated = await gateUploadSessionForPartUrl(parsed.data.sessionId, session.user.userId);
  if (!gated.ok) {
    const status = gated.error === "session_not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: gated.error }, { status });
  }
  const row = gated.row;

  const expectedSize = Number.parseInt(row.expected_size_bytes, 10);
  const maxPart = multipartMaxPartNumber(expectedSize, row.part_size_bytes);
  if (parsed.data.partNumber > maxPart) {
    return NextResponse.json({ ok: false, error: "part_out_of_range", maxPart }, { status: 400 });
  }

  await bumpSessionToUploading(parsed.data.sessionId);

  const uploadUrl = await presignUploadPartUrl(row.s3_key, row.upload_id, parsed.data.partNumber);
  return NextResponse.json({
    ok: true as const,
    uploadUrl,
    partNumber: parsed.data.partNumber,
  });
}
