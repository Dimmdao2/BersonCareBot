import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { listMediaDeleteErrors } from "@/app-layer/media/s3MediaStorage";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

/**
 * GET — list media_files rows in delete queue with failed S3 attempts (retry backlog).
 */
export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  let limit = 100;
  try {
    const q = new URL(request.url).searchParams.get("limit");
    if (q) limit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  try {
    const { items, total } = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      listMediaDeleteErrors(Number.isFinite(limit) ? limit : 100),
    );
    return NextResponse.json({ ok: true, items, total });
  } catch (e) {
    logger.error({ err: e }, "[admin/media/delete-errors] list_failed");
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
