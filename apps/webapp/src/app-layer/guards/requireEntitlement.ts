import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isMechanicEnabled,
  resolveEffectiveCommercialAccess,
  resolveQuotaGrowthAccess,
} from "@/modules/org-entitlements/service";
import type {
  OrgMechanic,
  QuotaGrowthByUnit,
  QuotaReservationDecision,
} from "@/modules/org-entitlements/types";

/** A route/action may pass only an already-authorized, server-derived organization. */
export type EntitlementContext = Readonly<{ organizationId: string }>;
export type EntitlementMutationIntent = Readonly<{
  kind: "mutation";
  growthByUnit?: QuotaGrowthByUnit;
}>;
export type EntitlementSuccess = { ok: true; quota: QuotaReservationDecision | null };
export type EntitlementDenialReason =
  | "entitlement_required"
  | "commercial_read_only"
  | "commercial_blocked"
  | "quota_reached";

async function checkEntitlement(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
  intent?: EntitlementMutationIntent,
): Promise<EntitlementSuccess | { ok: false; reason: EntitlementDenialReason; quota: QuotaReservationDecision | null }> {
  const port = buildAppDeps().orgEntitlements;
  if (!(await isMechanicEnabled(port, ctx.organizationId, mechanic))) {
    return { ok: false, reason: "entitlement_required", quota: null };
  }
  if (!intent) return { ok: true, quota: null };

  const effective = await resolveEffectiveCommercialAccess(port, ctx.organizationId);
  if (effective.lifecycle === "read_only") {
    return { ok: false, reason: "commercial_read_only", quota: null };
  }
  if (effective.lifecycle === "blocked") {
    return { ok: false, reason: "commercial_blocked", quota: null };
  }
  if (!intent.growthByUnit) return { ok: true, quota: null };
  for (const value of Object.values(intent.growthByUnit)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error("quota_growth_invalid");
    }
  }
  const quota = await resolveQuotaGrowthAccess({
    port,
    organizationId: ctx.organizationId,
    mechanic,
    growthByUnit: intent.growthByUnit,
  });
  return quota.allowed
    ? { ok: true, quota }
    : { ok: false, reason: "quota_reached", quota };
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
        { ok: false, error: decision.reason, mechanic, quota: decision.quota },
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
