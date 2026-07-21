import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isMechanicEnabled,
  resolveOrgEntitlementSnapshot,
} from "@/modules/org-entitlements/service";
import type { OrgMechanic } from "@/modules/org-entitlements/types";

/** A route/action may pass only an already-authorized, server-derived organization. */
export type EntitlementContext = Readonly<{ organizationId: string }>;
export type EntitlementMutationIntent = Readonly<{
  kind: "mutation";
}>;
export type EntitlementSuccess = { ok: true };
export type EntitlementDenialReason =
  | "entitlement_required"
  | "commercial_read_only"
  | "commercial_blocked";

async function checkEntitlement(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
  intent?: EntitlementMutationIntent,
): Promise<EntitlementSuccess | { ok: false; reason: EntitlementDenialReason }> {
  const port = buildAppDeps().orgEntitlements;
  const snapshot = await resolveOrgEntitlementSnapshot(port, ctx.organizationId);
  if (!snapshot.entitlements[mechanic]) {
    return { ok: false, reason: "entitlement_required" };
  }
  if (!intent) return { ok: true };

  if (snapshot.access.lifecycle === "read_only") {
    return { ok: false, reason: "commercial_read_only" };
  }
  if (snapshot.access.lifecycle === "blocked") {
    return { ok: false, reason: "commercial_blocked" };
  }
  return { ok: true };
}

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
  intent?: EntitlementMutationIntent,
): Promise<EntitlementSuccess | { ok: false; response: NextResponse }> {
  const decision = await checkEntitlement(ctx, mechanic, intent);
  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: decision.reason, mechanic },
        { status: 403 },
      ),
    };
  }
  return decision;
}

/** Server Action adapter: same resolver, intentionally no NextResponse dependency in its result. */
export async function requireEntitlementForAction(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
  intent?: EntitlementMutationIntent,
): Promise<EntitlementSuccess | { ok: false; mechanic: OrgMechanic; reason: EntitlementDenialReason }> {
  const decision = await checkEntitlement(ctx, mechanic, intent);
  return decision.ok
    ? decision
    : { ok: false, mechanic, reason: decision.reason };
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
