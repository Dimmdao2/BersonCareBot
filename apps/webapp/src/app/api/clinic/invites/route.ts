import { z } from 'zod';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForRead,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { sendEmailSetupLinkViaIntegrator } from '@/infra/integrations/email/integratorEmailAdapter';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'doctor']),
  /**
   * §5a item 5.1 — echoes the price a prior `seat_overage_confirmation_required` response showed
   * the clinic. Never trusted as the charged amount by itself: createReplacingPending re-resolves
   * the tariff's current price server-side and only proceeds when this matches it exactly.
   */
  confirmedSeatOveragePriceMinor: z.number().int().nonnegative().optional(),
});

function buildInviteUrl(baseUrl: string, token: string): string {
  const url = new URL('/app/clinic/invites/accept', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * §5a item 5.1 — pinned to a UTC day boundary, not `Date.now()` verbatim: `createManualSaasBillingInvoice`
 * derives its idempotency key from (organizationId, amountMinor, currency, description, expiresAt), so a
 * genuine repeat submit of the SAME confirmation (a double-click, a retried request) must hash to the
 * SAME key to collapse onto one invoice — see the "no second invoice" requirement in the plan. A later,
 * separate overage seat lands on the next call with either a different email (different description) or a
 * different day (different deadline), so it still gets its own invoice.
 */
const SEAT_OVERAGE_INVOICE_GRACE_DAYS = 3;
function seatOverageInvoiceExpiresAt(): string {
  const deadline = new Date();
  deadline.setUTCDate(deadline.getUTCDate() + SEAT_OVERAGE_INVOICE_GRACE_DAYS);
  deadline.setUTCHours(23, 59, 59, 999);
  return deadline.toISOString();
}

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'clinic_team');
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [invites, seats] = await Promise.all([
    deps.organizationInvites.listPending(gate.ctx.organizationId),
    deps.clinicSeats.getSeatStatus(gate.ctx.organizationId),
  ]);
  return jsonOk({ invites, seats });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'clinic_team');
  if (!entitlement.ok) return entitlement.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', {}, { status: 400 });
  }

  const deps = buildAppDeps();
  // Seat capacity is enforced only inside the org-locked transaction of createInvite
  // (createReplacingPending) — a route-level pre-check here cannot know that a same-email
  // request replaces (rather than adds to) that email's own pending reservation, and would
  // wrongly reject a same-email replacement at the exact limit. See pgOrganizationInvites.ts.
  const result = await deps.organizationInvites.createInvite({
    organizationId: gate.ctx.organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
    createdByPlatformUserId: gate.ctx.session.user.userId,
    confirmedSeatOveragePriceMinor: parsed.data.confirmedSeatOveragePriceMinor,
  });
  if (!result.ok) {
    // §5a item 5.1 — this org is at its tariff's base and the tariff allows paid overage: the
    // clinic hasn't created anything yet and hasn't been charged. 402 (not 409) so the UI can tell
    // "show me the price and let me confirm" apart from a real conflict/hard block.
    if (result.code === 'seat_overage_confirmation_required') {
      return jsonError(
        result.code,
        { priceMinor: result.priceMinor, currency: result.currency },
        { status: 402 },
      );
    }
    return jsonError(result.code, {}, { status: 409 });
  }

  const token = result.token;
  if (!token) {
    return jsonError('server_error', {}, { status: 500 });
  }

  // §5a item 5.1 — the invite (and the seat it reserves) is already committed by this point; the
  // invoice is raised existing #1057 mechanism, best-effort. A provider that can't raise it right
  // now (e.g. invoices disabled on the test PSP shop) must not take the already-granted seat back
  // — createManualSaasBillingInvoice writes its journal row before the provider call, so the
  // charge is still visible in the platform payments journal even when this catch fires.
  const seatOverage = result.seatOverage;
  let seatOverageInvoiceRaised = false;
  if (seatOverage) {
    try {
      await runWithDbClinicBillingPrincipal(
        {
          organizationId: gate.ctx.organizationId,
          platformUserId: gate.ctx.session.user.userId,
          source: 'clinic-seat-overage-invoice',
        },
        () =>
          deps.saasBilling.createManualSaasBillingInvoice({
            organizationId: gate.ctx.organizationId,
            amountMinor: seatOverage.priceMinor,
            currency: seatOverage.currency,
            description: `Дополнительное место специалиста сверх тарифа — ${result.invite.invitedEmail}`,
            expiresAt: seatOverageInvoiceExpiresAt(),
          }),
      );
      seatOverageInvoiceRaised = true;
    } catch {
      seatOverageInvoiceRaised = false;
    }
  }

  // Preview links are a non-production delivery aid. Never let a dev-auth flag reclassify a
  // production process: production must require successful delivery and must not return the token.
  const mayExposeInviteUrl = env.NODE_ENV !== 'production';

  const baseUrl = env.APP_BASE_URL;
  const inviteUrl = buildInviteUrl(baseUrl, token);
  const emailResult = await sendEmailSetupLinkViaIntegrator(
    result.invite.invitedEmail,
    'Приглашение в BersonCare',
    [
      `Вас пригласили в клинику ${result.invite.organizationTitle ?? ''}.`.trim(),
      'Откройте ссылку и подтвердите email кодом:',
      inviteUrl,
      'Ссылка действует 7 дней.',
    ].join('\n\n'),
  );
  // The invite row is already committed. On real production a failed email means the invitee
  // can't receive the link → surface it so the admin can retry. In a non-prod env (dev/test,
  // where email is redirected/stubbed) don't hard-fail — return the invite + link so the flow
  // stays usable/verifiable without an inbox.
  if (!emailResult.ok && !mayExposeInviteUrl) {
    return jsonError('email_send_failed', {}, { status: 503 });
  }

  return jsonOk({
    inviteId: result.invite.id,
    expiresAt: result.invite.expiresAt,
    emailDelivered: emailResult.ok,
    ...(seatOverage
      ? {
          seatOverage: {
            priceMinor: seatOverage.priceMinor,
            currency: seatOverage.currency,
            invoiceRaised: seatOverageInvoiceRaised,
          },
        }
      : {}),
    ...(mayExposeInviteUrl ? { inviteUrl } : {}),
  });
}
