import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";

const PRIVATE_REFERENCE_CATEGORY_CODES = new Set(["visit_manipulation"]);

/** Public read-only current baseline. Tenant-owned mutable snapshots are never exposed here. */
export async function GET(
  request: Request,
  context: { params: Promise<{ categoryCode: string }> }
) {
  stampBootstrapPrincipal("api/references/[categoryCode]:GET", request);
  const { categoryCode } = await context.params;
  if (!categoryCode || categoryCode.trim() === "") {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }
  const code = categoryCode.trim();
  if (PRIVATE_REFERENCE_CATEGORY_CODES.has(code)) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }
  const items = await buildAppDeps().references.listPublicBaselineItemsByCategoryCode(code);
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      sortOrder: item.sortOrder,
    })),
  });
}
