import { NextResponse } from 'next/server';
import { jsonError, mapApiError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';
import { z } from 'zod';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { SaasBillingTariffDowngradeBlockedError } from '@/modules/saas-billing/service';
import { PaymentProviderRequestRefusedError } from '@/modules/payments/providerPort';
import { SAAS_BILLING_TARIFF_NOT_PAYABLE } from '@/modules/saas-billing/payableTariff';
import { handleSeatOveragePurchase } from './seatOveragePurchase';
import {
  handleStoragePackagePurchase,
  handleStoragePackageRelease,
  storagePackageOffersBody,
} from './storagePackagePurchase';

type BillingOperation = 'overview' | 'tariff-change' | 'renewal';

function logBillingFailure(operation: BillingOperation, error: unknown, category: string) {
  console.error('[clinic-billing] operation failed', {
    operation,
    category,
    errorClass: error instanceof Error ? error.name : 'unknown',
  });
}

export async function GET() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  try {
    const billing = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-read',
      },
      () => buildAppDeps().saasBilling.getOrganizationBillingOverview(gate.ctx.organizationId),
    );
    const tariffChange = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-tariff-change-read',
      },
      () => buildAppDeps().saasBilling.getOwnTariffChangeState(gate.ctx.organizationId),
    );
    // Витрина докупки объёма приезжает тем же ответом, что и тариф: экран «Тариф и биллинг»
    // показывает заполненность и кнопку «Увеличить место» в одном блоке (владелец 10.09).
    const storage = storagePackageOffersBody(
      gate.ctx.organizationId,
      await runWithDbClinicBillingPrincipal(
        {
          organizationId: gate.ctx.organizationId,
          platformUserId: gate.ctx.session.user.userId,
          source: 'clinic-billing-read',
        },
        () => buildAppDeps().saasBilling.listStoragePackageOffers(gate.ctx.organizationId),
      ),
    );
    return NextResponse.json({ ok: true, billing, tariffChange, storage });
  } catch (error) {
    logBillingFailure('overview', error, 'repository_unavailable');
    return NextResponse.json({ ok: false, error: 'saas_billing_unavailable' }, { status: 503 });
  }
}

const billingPatchSchema = z.union([
  z.object({ tariffId: z.string().uuid(), billingPeriodCode: z.string().trim().min(1) }),
  z.object({
    action: z.literal('billing_contact'),
    billingEmail: z.string().trim().email().max(320),
  }),
  // F-6 (independent audit-live, 2026-09-05) — the clinic's own "cancel the subscription" door:
  // stops future renewal/autopay, never touches the already-paid `currentPeriodEndsAt`. Distinct
  // from `DELETE` above, which cancels a scheduled PENDING tariff/period change, not the
  // subscription itself.
  z.object({ action: z.literal('cancel_subscription') }),
  // Отказ от докупленного пакета объёма. Живёт рядом с отказом от подписки и устроен так же:
  // ничего уже оплаченного не отбирает, гасит продление (владелец 10.09 — «отключение происходит…
  // в конце оплаченного периода»). Денег в запросе нет — отказ их не двигает.
  z.object({ action: z.literal('release_storage_package') }),
]);

async function requireBillingManager() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 }),
    };
  }
  return gate;
}

/**
 * Closed allowlists of the billing refusals this screen may name. `BILLING_UNMAPPED` is compared by
 * identity — `mapApiError` returns that exact object when nothing matched — so an unmapped failure
 * falls through to the existing safe branches instead of describing itself in the body.
 */
const TARIFF_CHANGE_CONFLICT_RULES: ApiErrorLiteralRules = {
  [SAAS_BILLING_TARIFF_NOT_PAYABLE]: { code: SAAS_BILLING_TARIFF_NOT_PAYABLE, status: 409 },
  saas_billing_tariff_upgrade_proration_unavailable: {
    code: 'saas_billing_tariff_upgrade_proration_unavailable',
    status: 409,
  },
  saas_billing_tariff_upgrade_not_more_expensive: {
    code: 'saas_billing_tariff_upgrade_not_more_expensive',
    status: 409,
  },
  saas_billing_upgrade_no_remaining_period: {
    code: 'saas_billing_upgrade_no_remaining_period',
    status: 409,
  },
  saas_billing_tariff_downgrade_blocked: {
    code: 'saas_billing_tariff_downgrade_blocked',
    status: 409,
  },
  saas_billing_no_active_paid_subscription: {
    code: 'saas_billing_no_active_paid_subscription',
    status: 409,
  },
  saas_billing_no_tariff_assigned: {
    code: 'saas_billing_no_tariff_assigned',
    status: 409,
  },
};

const RENEWAL_RECEIPT_RULES: ApiErrorLiteralRules = {
  saas_billing_receipt_email_missing: {
    code: 'saas_billing_receipt_email_missing',
    status: 409,
  },
  saas_billing_receipt_vat_code_missing: {
    code: 'saas_billing_receipt_vat_code_missing',
    status: 409,
  },
};

const BILLING_UNMAPPED = { code: 'saas_billing_unavailable', status: 503 } as const;

function tariffChangeError(error: unknown) {
  if (error instanceof SaasBillingTariffDowngradeBlockedError) {
    return NextResponse.json(
      { ok: false, error: error.message, blocks: error.blocks },
      { status: 409 },
    );
  }
  // The refusal codes below are named to the clinic screen through the shared mapper, so the branch
  // can no longer echo whatever text the error happened to carry.
  const conflict = mapApiError(error, TARIFF_CHANGE_CONFLICT_RULES, BILLING_UNMAPPED);
  if (conflict !== BILLING_UNMAPPED) {
    return jsonError(conflict.code, {}, { status: conflict.status });
  }
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'saas_billing_tariff_change_unavailable' ||
    message.startsWith('saas_billing_period_unknown:')
  ) {
    logBillingFailure('tariff-change', error, 'configuration_unavailable');
    return NextResponse.json(
      { ok: false, error: 'saas_billing_tariff_change_unavailable' },
      { status: 503 },
    );
  }
  if (error instanceof PaymentProviderRequestRefusedError) {
    logBillingFailure('tariff-change', error, 'provider_refused');
    return NextResponse.json(
      { ok: false, error: 'saas_billing_provider_refused' },
      { status: 502 },
    );
  }
  logBillingFailure('tariff-change', error, 'unexpected');
  return NextResponse.json(
    { ok: false, error: 'saas_billing_tariff_change_unavailable' },
    { status: 503 },
  );
}

export async function PATCH(request: Request) {
  const gate = await requireBillingManager();
  if (!gate.ok) return gate.response;
  const parsed = billingPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  try {
    if ('action' in parsed.data && parsed.data.action === 'cancel_subscription') {
      const result = await runWithDbClinicBillingPrincipal(
        {
          organizationId: gate.ctx.organizationId,
          platformUserId: gate.ctx.session.user.userId,
          source: 'clinic-billing-subscription-cancel',
        },
        () =>
          buildAppDeps().saasBilling.cancelOwnTariffBillingSubscription({
            organizationId: gate.ctx.organizationId,
          }),
      );
      if (result.outcome === 'no_subscription') {
        return NextResponse.json(
          { ok: false, error: 'saas_billing_no_active_paid_subscription' },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true });
    }
    if ('action' in parsed.data && parsed.data.action === 'release_storage_package') {
      return await handleStoragePackageRelease(() =>
        runWithDbClinicBillingPrincipal(
          {
            organizationId: gate.ctx.organizationId,
            platformUserId: gate.ctx.session.user.userId,
            source: 'clinic-billing-storage-package-release',
          },
          () =>
            buildAppDeps().saasBilling.releaseStoragePackage({
              organizationId: gate.ctx.organizationId,
            }),
        ),
      );
    }
    if ('billingEmail' in parsed.data) {
      const billingEmailInput = parsed.data.billingEmail;
      const billingEmail = await runWithDbClinicBillingPrincipal(
        {
          organizationId: gate.ctx.organizationId,
          platformUserId: gate.ctx.session.user.userId,
          source: 'clinic-billing-contact-update',
        },
        () =>
          buildAppDeps().saasBilling.updateOwnBillingEmail({
            organizationId: gate.ctx.organizationId,
            billingEmail: billingEmailInput,
          }),
      );
      return NextResponse.json({ ok: true, billingEmail });
    }
    const tariffId = parsed.data.tariffId;
    const billingPeriodCode = parsed.data.billingPeriodCode;
    const result = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-tariff-change-schedule',
      },
      () =>
        buildAppDeps().saasBilling.scheduleOwnTariffChange({
          organizationId: gate.ctx.organizationId,
          tariffId,
          billingPeriodCode,
          actorId: gate.ctx.session.user.userId,
        }),
    );
    if (result.outcome === 'checkout') {
      if (!result.invoice.providerCheckoutUrl) {
        return NextResponse.json(
          { ok: false, error: 'saas_billing_checkout_unavailable' },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        checkoutUrl: result.invoice.providerCheckoutUrl,
        invoiceId: result.invoice.id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tariffChangeError(error);
  }
}

export async function DELETE() {
  const gate = await requireBillingManager();
  if (!gate.ok) return gate.response;
  try {
    await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-tariff-change-cancel',
      },
      () =>
        buildAppDeps().saasBilling.cancelOwnTariffChange({
          organizationId: gate.ctx.organizationId,
          actorId: gate.ctx.session.user.userId,
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tariffChangeError(error);
  }
}

/**
 * K0 — issues a checkout link for the clinic's OWN tariff. `allowCabinetRecovery: true` matters here
 * even more than on GET: this is the path by which a blocked/read-only clinic pays to lift the block,
 * so it must never itself be gated by the state it exists to fix (§5a/2.1c, enforced structurally by
 * `modules/saas-billing/service.test.ts`).
 */
const purchaseSchema = z.discriminatedUnion('purchase', [
  z.object({
    purchase: z.literal('seat_overage'),
    // Единственное, что приходит от браузера, — котировка, выписанная этим же сервером. Ни суммы,
    // ни валюты, ни ключа запроса: цену и личность покупки сервер берёт из собственной подписи.
    quote: z.string().min(1).max(2000),
  }),
  z.object({
    purchase: z.literal('storage_package'),
    // Идентификатор пакета приходит открыто, но он же ВПИСАН В ПОДПИСЬ котировки: подставить
    // подпись цены дешёвого пакета к дорогому нечем.
    storagePackageId: z.string().uuid(),
    quote: z.string().min(1).max(2000),
  }),
]);

export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const purchase = purchaseSchema.safeParse(body);
  if (body !== null && !purchase.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  const principal = {
    organizationId: gate.ctx.organizationId,
    platformUserId: gate.ctx.session.user.userId,
    source: 'clinic-billing-invoice' as const,
  };
  try {
    if (purchase.success && purchase.data.purchase === 'seat_overage') {
      return await handleSeatOveragePurchase(gate.ctx, purchase.data, (input) =>
        runWithDbClinicBillingPrincipal(principal, () =>
          buildAppDeps().saasBilling.purchaseSeatOverage(input),
        ),
      );
    }
    if (purchase.success && purchase.data.purchase === 'storage_package') {
      return await handleStoragePackagePurchase(gate.ctx, purchase.data, (input) =>
        runWithDbClinicBillingPrincipal(principal, () =>
          buildAppDeps().saasBilling.purchaseStoragePackage(input),
        ),
      );
    }
    // Tariff renewal path
    const invoice = await runWithDbClinicBillingPrincipal(principal, () =>
      buildAppDeps().saasBilling.createOwnTariffRenewalInvoice(gate.ctx.organizationId),
    );
    if (!invoice.providerCheckoutUrl) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_checkout_unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      checkoutUrl: invoice.providerCheckoutUrl,
      invoiceId: invoice.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'saas_billing_no_tariff_assigned') {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_no_tariff_assigned' },
        { status: 409 },
      );
    }
    // Owner ruling 18.08.2026 — a free tariff is not payable. Nothing broke and nothing is
    // temporarily unavailable, so this is a plain refusal with its own reason, never a 503.
    if (message === SAAS_BILLING_TARIFF_NOT_PAYABLE) {
      return NextResponse.json(
        { ok: false, error: SAAS_BILLING_TARIFF_NOT_PAYABLE },
        { status: 409 },
      );
    }
    // Honest refusal when the platform store has no usable keys yet — same shape as the patient path,
    // never a blank screen (plan §К0 item 4).
    if (
      message === 'yookassa_credentials_missing' ||
      message.startsWith('saas_billing_payment_provider_unavailable')
    ) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_payment_provider_unavailable' },
        { status: 503 },
      );
    }
    const receiptRefusal = mapApiError(error, RENEWAL_RECEIPT_RULES, BILLING_UNMAPPED);
    if (receiptRefusal !== BILLING_UNMAPPED) {
      return jsonError(receiptRefusal.code, {}, { status: receiptRefusal.status });
    }
    if (
      message.startsWith('saas_billing_provider_invoices_unsupported:') ||
      message.startsWith('payment_provider_receipt_unsupported:')
    ) {
      logBillingFailure('renewal', error, 'provider_capability_unsupported');
      return NextResponse.json(
        { ok: false, error: 'saas_billing_provider_capability_unsupported' },
        { status: 501 },
      );
    }
    if (error instanceof PaymentProviderRequestRefusedError) {
      logBillingFailure('renewal', error, 'provider_refused');
      return NextResponse.json(
        { ok: false, error: 'saas_billing_provider_refused' },
        { status: 502 },
      );
    }
    if (message === 'saas_billing_checkout_unavailable') {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_checkout_unavailable' },
        { status: 502 },
      );
    }
    logBillingFailure(
      'renewal',
      error,
      message.startsWith('saas_billing_period_unknown:') ? 'billing_period_unavailable' : 'unexpected',
    );
    return NextResponse.json(
      { ok: false, error: 'saas_billing_invoice_unavailable' },
      { status: 503 },
    );
  }
}
