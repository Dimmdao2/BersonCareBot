import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlementForMutation } from "@/app-layer/guards/requireEntitlement";
import { requireClinicManagementApiContext } from "@/app-layer/guards/requireRole";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, "clinic_team");
  if (!entitlement.ok) return entitlement.response;

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const revoked = await deps.organizationInvites.revokeInvite({
    organizationId: gate.ctx.organizationId,
    inviteId: parsed.data.id,
  });
  if (!revoked) {
    return NextResponse.json({ ok: false, error: "invite_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
