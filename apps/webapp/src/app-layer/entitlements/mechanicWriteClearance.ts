import { AsyncLocalStorage } from 'node:async_hooks';
import type { OrgMechanic } from '@/modules/org-entitlements/types';

/**
 * 3.2 construction (owner ruling 01.08 — a construction, not a second `check-db-chokepoint.mjs`
 * style source scanner with a hand-maintained exemption list). Mirrors the ONE other ALS-scoped
 * capability marker already in this codebase (`@bersoncare/db-principal`'s `enterWithDbPrincipal`):
 * a mutation-guard decision leaves a mark on the CURRENT async continuation, and the actual write
 * function refuses to run unless that mark is present for the exact mechanic it writes. Unlike a
 * text scanner, this cannot be fooled by formatting, indirection, or a renamed call — the write
 * throws at runtime for any caller that reaches it without a passing resolver decision.
 *
 * `checkEntitlement()` in `requireEntitlement.ts` calls `enterWithMechanicWriteClearance` the
 * moment a mutation decision resolves to `ok:true`, for every existing and future caller of
 * `requireEntitlementForMutation`/`requireEntitlementForMutationAction` — no handler file needs to
 * change for that half. The write side (`assertMechanicWriteClearance`) is wired into a write
 * function's own dependencies from `buildAppDeps.ts` (the composition root already trusted to
 * inject resolver-derived booleans into domain services, e.g. `isBrandingMechanicEnabled`,
 * `isCourseMechanicEnabled`) — never imported directly by a `modules/**` file, so the module layer
 * stays free of `app-layer` imports (`ARCHITECTURE.md` "Modules depend only on contracts, pure
 * utilities, and injected ports").
 *
 * `ensureMechanicWriteClearanceContext()` exists for the same reason `db-principal`'s
 * `ensureDbPrincipalContext()` does (see that file's own JSDoc on a matching bug it hit and fixed):
 * live-verified on this repo's dev server (2026-08-01) that calling `enterWith()` for the FIRST
 * time mid-request — i.e. only once a mutation decision resolves `ok:true`, deep inside an already
 * awaited call — does not reliably survive back out to the caller under this Next.js/Turbopack
 * runtime; a cell created that late was gone by the time the write function ran three frames later.
 * Establishing an (empty) cell as the very first statement of `requireEntitlementForMutation`/
 * `requireEntitlementForMutationAction` — before any `await` in that call — and then only ever
 * MUTATING that existing cell from `enterWithMechanicWriteClearance` (never replacing it) is what
 * survives. Do not remove the `ensureMechanicWriteClearanceContext()` calls in `requireEntitlement.ts`.
 */

const clearanceStorage = new AsyncLocalStorage<Set<OrgMechanic>>();

export class MechanicWriteClearanceRequiredError extends Error {
  readonly mechanic: OrgMechanic;
  constructor(mechanic: OrgMechanic) {
    super(`mechanic write clearance required: ${mechanic}`);
    this.name = 'MechanicWriteClearanceRequiredError';
    this.mechanic = mechanic;
  }
}

/** Idempotent early setup: guarantees a cell exists without clobbering one already there. */
export function ensureMechanicWriteClearanceContext(): void {
  if (clearanceStorage.getStore()) return;
  clearanceStorage.enterWith(new Set());
}

/**
 * Marks the mechanic as cleared for the REST of the current async continuation. Mutates an
 * existing cell when one is already present (the normal case, once
 * `ensureMechanicWriteClearanceContext()` has run) instead of replacing it — see the module doc.
 */
export function enterWithMechanicWriteClearance(mechanic: OrgMechanic): void {
  const store = clearanceStorage.getStore();
  if (store) {
    store.add(mechanic);
    return;
  }
  clearanceStorage.enterWith(new Set([mechanic]));
}

/**
 * Runs the physical write inside an explicit, bounded capability scope. Use this when the
 * entitlement decision itself is separated from the write by helper-level awaits: relying on an
 * `enterWith()` mark to escape that helper is not stable under the Next.js request runtime.
 */
export function runWithMechanicWriteClearance<T>(mechanic: OrgMechanic, fn: () => T): T {
  const next = new Set(clearanceStorage.getStore() ?? []);
  next.add(mechanic);
  return clearanceStorage.run(next, fn);
}

export function hasMechanicWriteClearance(mechanic: OrgMechanic): boolean {
  return clearanceStorage.getStore()?.has(mechanic) ?? false;
}

/** The physical door: throws unless this exact mechanic was cleared earlier in this continuation. */
export function assertMechanicWriteClearance(mechanic: OrgMechanic): void {
  if (!hasMechanicWriteClearance(mechanic)) {
    throw new MechanicWriteClearanceRequiredError(mechanic);
  }
}

/** Test-only: runs `fn` in a fresh continuation with no clearance, regardless of the caller's. */
export function runWithoutMechanicWriteClearance<T>(fn: () => T): T {
  return clearanceStorage.run(new Set(), fn);
}
