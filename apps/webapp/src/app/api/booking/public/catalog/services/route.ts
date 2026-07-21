import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  cityCode: z.string().trim().min(1),
});

export async function GET(request: Request) {
  stampBootstrapPrincipal("api/booking/public/catalog/services:GET", request);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ cityCode: url.searchParams.get("cityCode") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  return NextResponse.json(
    { ok: false, error: "organization_selection_required" },
    { status: 409 },
  );
}
