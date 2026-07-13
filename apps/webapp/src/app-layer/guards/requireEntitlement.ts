import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext, type DoctorWorkspaceAccessContext } from "@/app-layer/guards/requireRole";
import { isMechanicEnabled } from "@/modules/org-entitlements/service";
import type { OrgMechanic } from "@/modules/org-entitlements/types";

export async function requireEntitlement(
  mechanic: OrgMechanic,
): Promise<{ ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }> {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate;

  // P1 wires only selected mechanics route-by-route; the remaining mechanics are intentionally ungated for now.
  const enabled = await isMechanicEnabled(buildAppDeps().orgEntitlements, gate.ctx.organizationId, mechanic);
  if (!enabled) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic }, { status: 403 }),
    };
  }

  return gate;
}
