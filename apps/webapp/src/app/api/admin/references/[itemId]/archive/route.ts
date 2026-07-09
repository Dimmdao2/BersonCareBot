import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

/** Админ: soft-delete значения справочника (is_active = false). */
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const auth = await requireAdminWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { itemId } = await context.params;
  if (!itemId?.trim()) {
    return NextResponse.json({ ok: false, error: "item_required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const item = await deps.references.findItemById(itemId.trim());
  if (!item) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await withDoctorWorkspacePrincipal(workspace, "admin.references.archive", () =>
    deps.references.archiveItem(item.id),
  );
  return NextResponse.json({ ok: true });
}
