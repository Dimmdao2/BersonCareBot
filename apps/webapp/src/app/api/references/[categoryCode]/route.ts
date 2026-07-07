import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const PRIVATE_REFERENCE_CATEGORY_CODES = new Set(["visit_manipulation"]);

/** Публичный список активных значений справочника (для селектов в UI). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ categoryCode: string }> }
) {
  const { categoryCode } = await context.params;
  if (!categoryCode || categoryCode.trim() === "") {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }
  const code = categoryCode.trim();
  if (PRIVATE_REFERENCE_CATEGORY_CODES.has(code)) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }
  const deps = buildAppDeps();
  const category = await deps.references.findCategoryByCode(code);
  if (!category) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }
  const items = await deps.references.listActiveItemsByCategoryCode(code);
  return NextResponse.json({
    ok: true,
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      title: i.title,
      sortOrder: i.sortOrder,
    })),
  });
}
