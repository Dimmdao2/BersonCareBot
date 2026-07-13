import { NextResponse } from "next/server";
import { z } from "zod";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { requireClinicManagementBookingEngine } from "../_requireAdminBookingEngine";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  cityCode: z.string().min(1).max(80),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().max(80).optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const branches = await gate.ctx.service.catalog.listBranches(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, branches });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const branch = await withDoctorWorkspacePrincipal(gate.ctx, "admin.booking-engine.branches.upsert", () =>
    gate.ctx.service.catalog.upsertBranch({
      organizationId: gate.ctx.organizationId,
      title: parsed.data.title.trim(),
      color: parsed.data.color ?? null,
      cityCode: parsed.data.cityCode.trim().toLowerCase(),
      address: parsed.data.address ?? null,
      timezone: parsed.data.timezone,
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
    }),
  );
  return NextResponse.json({ ok: true, branch });
}
