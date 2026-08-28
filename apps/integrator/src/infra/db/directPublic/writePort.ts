import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import {
  runWithBootstrapPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

/**
 * The sole principal-selection chokepoint for direct writes to `public.*`.
 *
 * SQL remains in the bounded repository named by the operation; this port owns the
 * decision to re-enter the principal that operation's target accepts before that SQL runs.
 */
export type DirectPublicWriteOperation =
  | 'identity-upsert'
  | 'phone-bind'
  | 'admin-audit-write'
  | 'reminder-rule-upsert'
  | 'reminder-occurrence-finalize'
  | 'reminder-delivery-append'
  | 'content-access-grant-upsert'
  | 'support-delivery-append'
  | 'user-channel-bot-blocked-set';

/**
 * `organization` — the write is an ordinary RLS-scoped relation write and needs `is_staff() AND
 * organization_id = current_org_id()`.
 *
 * `bootstrap` — the write is ONE exact named SECURITY DEFINER root whose declared capability is
 * `contextClass=integrator` + `targetRole=app_integrator_resolver`, and
 * `integratorPortContextPrincipal` (`../portContextRuntime.ts`) hands that capability to a
 * `bootstrap` principal and to nothing else: an `integrator` principal is refused with "Integrator
 * resolver capability requires a bootstrap principal" and an `organization` principal never matches
 * the capability at all. The root itself repeats the requirement in SQL
 * (`app.require_accepted_context('app_seam_phone_binding_owner', 'app_integrator_resolver',
 * 'integrator', …)`), so the accepted principal for these two operations is a property of the
 * declared seam, not a caller preference.
 */
type DirectPublicWritePrincipalStrategy = 'organization' | 'bootstrap';

/**
 * D25 correction (independent audit K5, 22.08.2026): `user.upsert` / `user.phone.link` are reachable
 * from a Telegram/MAX webhook whose clinic is ALREADY resolved — `telegram/webhook.ts` then installs
 * `runWithOrganizationPrincipal` around the whole pipeline, which is the common case for a returning
 * person. Calling the exact roots straight from that principal
 * left them unreachable exactly there: the login link was never delivered and the confirmed contact
 * was never bound, surfacing as a retryable-looking `db_transient_failure`. The removed writer paths
 * used to re-enter an accepted principal through THIS same chokepoint; restoring the two operations
 * here with the strategy their declared capability actually accepts keeps one entry point per
 * `public.*` write instead of a second write path, a widened capability or a new wrapper-gate.
 */
const principalStrategy: Readonly<
  Record<DirectPublicWriteOperation, DirectPublicWritePrincipalStrategy>
> = {
  'identity-upsert': 'bootstrap',
  'phone-bind': 'bootstrap',
  'admin-audit-write': 'organization',
  'reminder-rule-upsert': 'organization',
  'reminder-occurrence-finalize': 'organization',
  'reminder-delivery-append': 'organization',
  'content-access-grant-upsert': 'organization',
  'support-delivery-append': 'organization',
  // D17 шаг 2b: метку «бот заблокирован» ставит и снимает `outgoingDeliveryWorker`, а арендаторскую
  // строку очереди он обрабатывает внутри `runWithOrganizationPrincipal(scope.organizationId, …)` —
  // ровно тот принципал, которому декларация даёт запись в эти две колонки.
  'user-channel-bot-blocked-set': 'organization',
};

export function writeDirectPublic<T>(
  operation: DirectPublicWriteOperation,
  write: () => Promise<T>,
  options: { organizationId?: string | null } = {},
): Promise<T> {
  const strategy = principalStrategy[operation];
  if (strategy === 'bootstrap') {
    // Scoped to this one named-root call: the ambient organization principal (and the organization
    // id every caller downstream still reads) is restored the moment the root returns.
    return runWithBootstrapPrincipal({ source: `direct-public:${operation}` }, write);
  }
  const organizationId = options.organizationId ?? getCurrentDbPrincipalOrganizationId();
  return organizationId ? runWithOrganizationPrincipal(organizationId, write) : write();
}
