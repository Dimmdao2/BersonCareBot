import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const organizations = await gate.ctx.service.organization.listOrganizations();
  return NextResponse.json({ ok: true, organizations });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const organization = await gate.ctx.service.organization.upsertOrganization({
    id: gate.ctx.organizationId,
    title: parsed.data.title.trim(),
    isActive: parsed.data.isActive,
    sortOrder: parsed.data.sortOrder,
  });
  return NextResponse.json({ ok: true, organization });
}
