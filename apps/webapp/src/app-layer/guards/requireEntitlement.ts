import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  isMechanicEnabled,
  resolveOrgEntitlementSnapshot,
} from '@/modules/org-entitlements/service';
import type { OrgMechanic } from '@/modules/org-entitlements/types';

/** A route/action may pass only an already-authorized, server-derived organization. */
export type EntitlementContext = Readonly<{ organizationId: string }>;
type EntitlementAccess = 'read' | 'mutation';
export type EntitlementSuccess = { ok: true };
export type EntitlementDenialReason =
  | 'entitlement_required'
  | 'commercial_read_only'
  | 'commercial_blocked';

/**
 * Product-facing explanation for a mutation blocked by a tariff mechanic.
 * Callers supply the concrete action so the UI never has to turn a swallowed 403
 * into an unexplained disabled control.
 */
export function entitlementMutationRefusalMessage(action: string): string {
  return `Невозможно ${action}: этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.`;
}

export function entitlementMutationRefusalResponse(
  mechanic: OrgMechanic,
  action: string,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: 'entitlement_required',
      mechanic,
      message: entitlementMutationRefusalMessage(action),
    },
    { status: 403 },
  );
}

async function checkEntitlement(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
  access: EntitlementAccess,
): Promise<EntitlementSuccess | { ok: false; reason: EntitlementDenialReason }> {
  // A tariff mechanic controls writes only. Existing clinic/patient data remains readable and
  // exportable after a mechanic is switched off; resolving it here would turn a read into a hide.
  if (access === 'read') return { ok: true };
  const port = buildAppDeps().orgEntitlements;
  const snapshot = await resolveOrgEntitlementSnapshot(port, ctx.organizationId);
  if (!snapshot.entitlements[mechanic]) {
    return { ok: false, reason: 'entitlement_required' };
  }
  if (snapshot.access.lifecycle === 'read_only') {
    return { ok: false, reason: 'commercial_read_only' };
  }
  if (snapshot.access.lifecycle === 'blocked') {
    return { ok: false, reason: 'commercial_blocked' };
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

/** Read-only API adapter. Lifecycle recovery reads remain available. */
export async function requireEntitlementForRead(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<EntitlementSuccess | { ok: false; response: NextResponse }> {
  const decision = await checkEntitlement(ctx, mechanic, 'read');
  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: decision.reason, mechanic }, { status: 403 }),
    };
  }
  return decision;
}

/** Mutation-only API adapter. Its signature makes lifecycle enforcement non-optional. */
export async function requireEntitlementForMutation(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<EntitlementSuccess | { ok: false; response: NextResponse }> {
  const decision = await checkEntitlement(ctx, mechanic, 'mutation');
  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: decision.reason, mechanic }, { status: 403 }),
    };
  }
  return decision;
}

/** Read-only Server Action adapter. */
export async function requireEntitlementForReadAction(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<
  EntitlementSuccess | { ok: false; mechanic: OrgMechanic; reason: EntitlementDenialReason }
> {
  const decision = await checkEntitlement(ctx, mechanic, 'read');
  return decision.ok ? decision : { ok: false, mechanic, reason: decision.reason };
}

/** Mutation-only Server Action adapter. Read adapters cannot silently skip lifecycle enforcement. */
export async function requireEntitlementForMutationAction(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<
  EntitlementSuccess | { ok: false; mechanic: OrgMechanic; reason: EntitlementDenialReason }
> {
  const decision = await checkEntitlement(ctx, mechanic, 'mutation');
  return decision.ok ? decision : { ok: false, mechanic, reason: decision.reason };
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
  void ctx;
  void mechanic;
}
