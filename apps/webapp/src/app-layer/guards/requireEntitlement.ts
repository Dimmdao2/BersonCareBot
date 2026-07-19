import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isMechanicEnabled } from "@/modules/org-entitlements/service";
import type { OrgMechanic } from "@/modules/org-entitlements/types";

/** A route/action may pass only an already-authorized, server-derived organization. */
export type EntitlementContext = Readonly<{ organizationId: string }>;

/**
 * The sole resolver bridge for application code. It intentionally performs no
 * session, role, request-body, or response work.
 */
export async function assertMechanicEnabled(
  organizationId: string,
  mechanic: OrgMechanic,
): Promise<boolean> {
  return isMechanicEnabled(buildAppDeps().orgEntitlements, organizationId, mechanic);
}

export async function requireEntitlement(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const enabled = await assertMechanicEnabled(ctx.organizationId, mechanic);
  if (!enabled) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic }, { status: 403 }),
    };
  }

  return { ok: true };
}

/** Server Action adapter: same resolver, intentionally no NextResponse dependency in its result. */
export async function requireEntitlementForAction(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<{ ok: true } | { ok: false; mechanic: OrgMechanic }> {
  return (await assertMechanicEnabled(ctx.organizationId, mechanic))
    ? { ok: true }
    : { ok: false, mechanic };
}

/**
 * RSC page adapter: fail-closed `notFound()` when the trusted organization lacks the mechanic.
 * Keeps entitlement resolution inside this boundary — pages must call this instead of resolving
 * the mechanic themselves.
 */
export async function requireEntitlementForPage(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<void> {
  if (!(await assertMechanicEnabled(ctx.organizationId, mechanic))) {
    notFound();
  }
}
