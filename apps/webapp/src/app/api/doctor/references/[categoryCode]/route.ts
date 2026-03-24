import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
});

function makeDoctorItemCode(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Врач добавляет значение только в категорию с is_user_extensible (POST). */
export async function POST(
  request: Request,
  context: { params: Promise<{ categoryCode: string }> }
) {
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { categoryCode } = await context.params;
  if (!categoryCode?.trim()) {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const cat = await deps.references.findCategoryByCode(categoryCode.trim());
  if (!cat) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }
  if (!cat.isUserExtensible) {
    return NextResponse.json({ ok: false, error: "category_not_extensible" }, { status: 403 });
  }

  try {
    const item = await deps.references.insertItem({
      categoryCode: cat.code,
      code: makeDoctorItemCode(),
      title: parsed.data.title.trim(),
    });
    return NextResponse.json({
      ok: true,
      item: { id: item.id, code: item.code, title: item.title },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert_failed";
    if (msg === "category_not_extensible") {
      return NextResponse.json({ ok: false, error: "category_not_extensible" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }
}
