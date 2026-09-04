import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createStaffMembershipSale } from '@/app-layer/booking/staffMembershipSale';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  membershipErrorResponse,
  resolveAssignedByPlatformUserId,
} from '@/app/api/booking-engine/patientPackagesRouteShared';
import { requireDoctorBookingEngine } from '../_requireDoctorBookingEngine';

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1),
  sortOrder: z.number().int().optional(),
});

/**
 * The sale states only what a doctor actually decides: who, what, at what price, and how it is
 * paid. The paid amount, the resulting status and whether a payment intent is created are derived
 * on the server from the price snapshot and the real payment result — the client cannot state them.
 *
 * `.strict()` is the enforcement: an independent audit of `c86e6a4c1` sent `paidAmountMinor: 1`
 * against a 5 000 ₽ price together with `activateImmediately: true`, and the old schema passed both
 * straight through to the repository. A body still carrying those fields is now a 400, not a
 * silently stripped field — a caller that believes it controls the money must be told it does not.
 */
const saleMethodSchema = z.enum(['cash', 'link', 'free']);
const saleIdempotencyKeySchema = z.string().trim().min(8).max(200);

const manualSchema = z
  .object({
    kind: z.literal('manual'),
    platformUserId: z.string().uuid(),
    title: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    priceMinor: z.number().int().min(0),
    currency: z.string().length(3).optional(),
    validityDays: z.number().int().min(1).nullable().optional(),
    deductionMode: z.enum(['auto_on_visit_confirmed', 'manual']).optional(),
    items: z.array(itemSchema).min(1),
    saleMethod: saleMethodSchema,
    saleIdempotencyKey: saleIdempotencyKeySchema,
    soldAt: z.string().datetime().optional(),
  })
  .strict();

const offerSchema = z
  .object({
    kind: z.literal('catalog'),
    platformUserId: z.string().uuid(),
    subscriptionPackageId: z.string().uuid(),
    notes: z.string().trim().max(2000).optional(),
    saleMethod: saleMethodSchema,
    saleIdempotencyKey: saleIdempotencyKeySchema,
    soldAt: z.string().datetime().optional(),
  })
  .strict();

const postSchema = z.discriminatedUnion('kind', [manualSchema, offerSchema]);

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const platformUserId = new URL(request.url).searchParams.get('platformUserId')?.trim();
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: 'platform_user_id_required' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  try {
    const packages = await deps.memberships.listPatientPackagesForUser(
      platformUserId,
      gate.ctx.organizationId,
    );
    // The sale form may offer «ссылка на оплату» only when a new online payment can really be
    // created (`memberships.md`: `payments` mechanic + configured provider), and «отправить в
    // чат» only when the patient is actually linked to the portal that carries the conversation.
    const paymentsEntitlement = await getMechanicMutationAvailability(gate.ctx, 'payments');
    const [onlineAvailability, portal] = await Promise.all([
      paymentsEntitlement.available && deps.payments
        ? deps.payments.getPrepaymentAvailability(gate.ctx.organizationId)
        : Promise.resolve({ available: false as const }),
      withDoctorWorkspacePrincipal(
        gate.ctx,
        'doctor.booking-engine.patient-packages.portal-status',
        () => deps.patientInvites.getPortalStatus(gate.ctx.organizationId, platformUserId),
      ).catch(() => null),
    ]);
    return NextResponse.json({
      ok: true,
      packages,
      onlinePaymentAvailable: onlineAvailability.available,
      patientChatAvailable: portal?.status === 'linked',
      // A cash sale reaches the canonical ledger only for a clinic whose tariff carries the cash
      // journal at all; the card states this rather than letting the KPI quietly disagree.
      cashLedgerAvailable: paymentsEntitlement.available,
    });
  } catch (err) {
    return membershipErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const body = parsed.data;
  // Only creating a NEW online payment needs the `payments` mechanic; a free issue and a
  // staff-recorded offline sale stay available without it (`memberships.md`).
  if (body.saleMethod === 'link') {
    const paymentsEntitlement = await requireEntitlementForMutation(gate.ctx, 'payments');
    if (!paymentsEntitlement.ok) return paymentsEntitlement.response;
  }
  const cashLedgerAvailable =
    body.saleMethod === 'cash'
      ? (await getMechanicMutationAvailability(gate.ctx, 'payments')).available
      : false;
  const assignedByPlatformUserId = resolveAssignedByPlatformUserId(gate.ctx.session.user.userId);
  const sale = createStaffMembershipSale(deps);
  const runners = {
    runMembershipWrite: <T>(fn: () => Promise<T>) =>
      withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking-engine.patient-packages.sale', fn),
    runCashWrite: <T>(fn: () => Promise<T>) =>
      withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking-engine.patient-packages.cash', fn),
  };
  const common = {
    organizationId: gate.ctx.organizationId,
    platformUserId: body.platformUserId,
    assignedByPlatformUserId,
    createdBy: gate.ctx.session.user.userId,
    method: body.saleMethod,
    saleIdempotencyKey: body.saleIdempotencyKey,
    // A sold date only dates a sale that has already happened; an invoice is dated by its payment.
    soldAt: body.saleMethod === 'link' ? null : (body.soldAt ?? null),
    notes: body.notes ?? null,
    cashLedgerAvailable,
  };
  try {
    const result =
      body.kind === 'manual'
        ? await sale.sell(
            {
              ...common,
              kind: 'manual',
              title: body.title?.trim(),
              priceMinor: body.priceMinor,
              currency: body.currency,
              validityDays: body.validityDays ?? null,
              deductionMode: body.deductionMode,
              items: body.items,
            },
            runners,
          )
        : await sale.sell(
            { ...common, kind: 'catalog', subscriptionPackageId: body.subscriptionPackageId },
            runners,
          );
    return NextResponse.json({
      ok: true,
      package: result.package,
      cashLedgerRecorded: result.cashLedgerRecorded,
      // A pay-link sale that produced no link is reported as exactly that: the package exists and
      // is still an offer, and the reason the link is missing is named instead of implied.
      paymentLinkError:
        body.saleMethod === 'link' && !result.package.checkoutUrl
          ? 'payment_provider_unavailable'
          : null,
    });
  } catch (err) {
    return membershipErrorResponse(err);
  }
}
