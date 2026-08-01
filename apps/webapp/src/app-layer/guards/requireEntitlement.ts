import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveMechanicAccess } from '@/modules/org-entitlements/service';
import {
  accessNotificationConditionFor,
  dueAccessNotifications,
  renderAccessNotification,
} from '@/modules/org-entitlements/accessNotifications';
import type {
  MechanicAccessWarning,
  MechanicAccessResolution,
  OrgMechanic,
} from '@/modules/org-entitlements/types';
import { MECHANIC_REGISTRY } from '@/modules/org-entitlements/types';
import {
  ensureMechanicWriteClearanceContext,
  enterWithMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';

/** A route/action may pass only an already-authorized, server-derived organization. */
export type EntitlementContext = Readonly<{ organizationId: string }>;
type EntitlementAccess = 'read' | 'mutation';
export type EntitlementSuccess = { ok: true; warning?: MechanicAccessWarning | null };
export type EntitlementDenialReason =
  | 'entitlement_required'
  | 'commercial_read_only'
  | 'commercial_blocked'
  | 'access_lifecycle_unconfigured';

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
  markMutationClearance = true,
): Promise<EntitlementSuccess | { ok: false; reason: EntitlementDenialReason }> {
  const resolution = await resolveMechanicAccess(
    buildAppDeps().orgEntitlements,
    ctx.organizationId,
    mechanic,
  );
  if (resolution.state === 'disabled') {
    return { ok: false, reason: 'entitlement_required' };
  }
  if (resolution.state === 'unconfigured') {
    return { ok: false, reason: 'access_lifecycle_unconfigured' };
  }
  if (resolution.state === 'read_only' && access === 'mutation') {
    return { ok: false, reason: 'commercial_read_only' };
  }
  // 3.2 construction: a passing MUTATION decision marks this mechanic cleared for the rest of
  // this request's continuation, so `assertMechanicWriteClearance` at the actual write function
  // (wired from `buildAppDeps.ts`) can refuse to run without it — see mechanicWriteClearance.ts.
  if (access === 'mutation' && markMutationClearance) {
    enterWithMechanicWriteClearance(mechanic);
  }
  return { ok: true, warning: resolution.warning };
}

/**
 * Read-only availability for a mutation control. It shares the mutation lifecycle decision
 * without marking a request as cleared to write.
 */
export async function getMechanicMutationAvailability(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<{ available: true } | { available: false; reason: EntitlementDenialReason }> {
  const decision = await checkEntitlement(ctx, mechanic, 'mutation', false);
  return decision.ok ? { available: true } : { available: false, reason: decision.reason };
}

/**
 * The sole resolver bridge for application code. It intentionally performs no
 * session, role, request-body, or response work.
 */
export async function assertMechanicEnabled(
  organizationId: string,
  mechanic: OrgMechanic,
): Promise<boolean> {
  return (await getMechanicSurfaceVisibility({ organizationId }, mechanic)).directUrl;
}

/** One visibility adapter shared by specialist navigation, patient navigation and direct pages. */
export type MechanicSurfaceVisibility = {
  specialistNavigation: boolean;
  patientNavigation: boolean;
  directUrl: boolean;
  warning: MechanicAccessWarning | null;
};

export function resolveMechanicSurfaceVisibility(
  resolution: MechanicAccessResolution,
): MechanicSurfaceVisibility {
  const visible =
    resolution.state === 'full_access' ||
    resolution.state === 'grace' ||
    resolution.state === 'read_only';
  return {
    specialistNavigation: visible,
    patientNavigation: visible,
    directUrl: visible,
    warning: resolution.warning,
  };
}

/**
 * §5a item 2.6a (owner 31.07) — the warning texts are the owner's, not the agent's: this returns
 * the notification rows of his ladder that have already come due, rendered from his templates.
 * There is no sentence, no notification count and no fixed variable set in this file; a tariff
 * with no notification rows produces no banner, which is a configuration answer, not a default.
 *
 * `variables` is whatever the caller can supply for the placeholders the owner used — the set is
 * open, so adding one never changes this code or any stored template.
 */
export function entitlementGraceWarningMessages(
  warning: MechanicAccessWarning,
  variables: Readonly<Record<string, string>>,
  now: Date = new Date(),
): string[] {
  // §5a item 7.0 — same rule as the cabinet door: which payment outcome happened is read from the
  // period that actually lapsed, so «ошибка оплаты» reaches a clinic that did not pay and not one
  // whose trial simply ran out.
  const condition = accessNotificationConditionFor(warning.periodSource);
  if (condition === null) return [];
  return dueAccessNotifications({
    notifications: warning.notifications,
    periodEndsAt: warning.periodEndsAt,
    now,
    condition,
  }).map((rule) => renderAccessNotification(rule.template, variables));
}

export async function getMechanicSurfaceVisibility(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<MechanicSurfaceVisibility> {
  return resolveMechanicSurfaceVisibility(
    await resolveMechanicAccess(buildAppDeps().orgEntitlements, ctx.organizationId, mechanic),
  );
}

export async function isMechanicVisible(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<boolean> {
  return (await getMechanicSurfaceVisibility(ctx, mechanic)).directUrl;
}

/** @deprecated Use the shared surface visibility adapter. */
export const isMechanicIncluded = isMechanicVisible;

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
  ensureMechanicWriteClearanceContext();
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
  ensureMechanicWriteClearanceContext();
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
  if (!(await getMechanicSurfaceVisibility(ctx, mechanic)).directUrl) notFound();
}
