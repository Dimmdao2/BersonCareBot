import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveCabinetAccess, resolveMechanicAccess } from '@/modules/org-entitlements/service';
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
export function entitlementMutationRefusalMessage(
  action: string,
  reason: EntitlementDenialReason = 'entitlement_required',
): string {
  switch (reason) {
    case 'commercial_read_only':
      return `Невозможно ${action}: раздел сейчас доступен только для просмотра по тарифу клиники.`;
    case 'commercial_blocked':
      return `Невозможно ${action}: доступ к этому разделу временно приостановлен по тарифу клиники.`;
    case 'access_lifecycle_unconfigured':
      return `Невозможно ${action}: для этого раздела не настроены условия доступа в тарифе клиники.`;
    case 'entitlement_required':
      return `Невозможно ${action}: этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.`;
  }
}

/**
 * Owner 18.08 (L-1): a limit-bearing mechanic has no «выключено» state, so the only refusal its
 * write can still produce is «число тарифа исчерпано». That refusal reaches a person the same way
 * the missing-mechanic one already does — as a sentence naming the limit, not as
 * `branch_quota_reached`.
 */
export function quotaLimitReachedRefusalMessage(mechanic: OrgMechanic, action: string): string {
  return (
    `Невозможно ${action}: в тарифе клиники исчерпан лимит «${MECHANIC_REGISTRY[mechanic].label}». ` +
    'Чтобы продолжить, увеличьте лимит в тарифе клиники.'
  );
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
  mechanic: OrgMechanic | undefined,
  access: EntitlementAccess,
  markMutationClearance = true,
): Promise<EntitlementSuccess | { ok: false; reason: EntitlementDenialReason }> {
  // T13: paid-period read-only is a property of the whole cabinet, including mutations that do
  // not belong to a tariff mechanic (such as creating a patient card). Keep this in the existing
  // mutation chokepoint rather than adding a second route-local guard.
  if (access === 'mutation' && mechanic === undefined) {
    const cabinet = await resolveCabinetAccess(buildAppDeps().orgEntitlements, ctx.organizationId);
    if (cabinet.state === 'disabled') return { ok: false, reason: 'commercial_blocked' };
    if (cabinet.state === 'unconfigured') {
      return { ok: false, reason: 'access_lifecycle_unconfigured' };
    }
    if (cabinet.state === 'read_only') return { ok: false, reason: 'commercial_read_only' };
  }
  if (mechanic === undefined) return { ok: true };
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
      response: NextResponse.json(
        {
          ok: false,
          error: decision.reason,
          mechanic,
          message: entitlementMutationRefusalMessage('выполнить действие', decision.reason),
        },
        { status: 403 },
      ),
    };
  }
  return decision;
}

/** Mutation-only API adapter. Its signature makes lifecycle enforcement non-optional. */
export async function requireEntitlementForMutation(
  ctx: EntitlementContext,
  mechanic?: OrgMechanic,
): Promise<EntitlementSuccess | { ok: false; response: NextResponse }> {
  ensureMechanicWriteClearanceContext();
  const decision = await checkEntitlement(ctx, mechanic, 'mutation');
  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: decision.reason,
          ...(mechanic ? { mechanic } : {}),
          // Same explanation the read adapter and the Server Action refusals already carry: a
          // mutation blocked by a tariff mechanic is the one refusal a person actually clicks
          // into, so it must not reach the screen as the bare `entitlement_required` code.
          message: entitlementMutationRefusalMessage('выполнить действие', decision.reason),
        },
        { status: 403 },
      ),
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
  mechanic?: OrgMechanic,
): Promise<
  EntitlementSuccess | { ok: false; mechanic?: OrgMechanic; reason: EntitlementDenialReason }
> {
  ensureMechanicWriteClearanceContext();
  const decision = await checkEntitlement(ctx, mechanic, 'mutation');
  return decision.ok ? decision : { ok: false, ...(mechanic ? { mechanic } : {}), reason: decision.reason };
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

/**
 * RSC editor/create adapter: a read-only mechanic remains readable through its list/card
 * surfaces, while URLs whose sole purpose is mutation fail closed with the same visible
 * outcome as a disabled direct page.
 */
export async function requireEntitlementForMutationPage(
  ctx: EntitlementContext,
  mechanic: OrgMechanic,
): Promise<void> {
  if (!(await getMechanicMutationAvailability(ctx, mechanic)).available) notFound();
}
