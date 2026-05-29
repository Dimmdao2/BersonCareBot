import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "token_required" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const link = await deps.products.resolvePayLink(token);
  if (!link) {
    return NextResponse.json({ ok: false, error: "link_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    product: {
      id: link.product.id,
      title: link.product.title,
      priceMinor: link.product.priceMinor,
      currency: link.product.currency,
      productType: link.product.productType,
    },
  });
}
