import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";

/** Админ: soft-delete значения справочника (is_active = false). */
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { itemId } = await context.params;
  if (!itemId?.trim()) {
    return NextResponse.json({ ok: false, error: "item_required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const item = await deps.references.findItemById(itemId.trim());
  if (!item) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await deps.references.archiveItem(item.id);
  return NextResponse.json({ ok: true });
}
