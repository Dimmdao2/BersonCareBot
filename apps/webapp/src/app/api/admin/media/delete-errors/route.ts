import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { listMediaDeleteErrors } from "@/app-layer/media/s3MediaStorage";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

/**
 * GET — list media_files rows in delete queue with failed S3 attempts (retry backlog).
 */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let limit = 100;
  try {
    const q = new URL(request.url).searchParams.get("limit");
    if (q) limit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  try {
    const { items, total } = await listMediaDeleteErrors(Number.isFinite(limit) ? limit : 100);
    return NextResponse.json({ ok: true, items, total });
  } catch (e) {
    logger.error({ err: e }, "[admin/media/delete-errors] list_failed");
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
