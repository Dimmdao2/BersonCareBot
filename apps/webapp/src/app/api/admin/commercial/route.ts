import { NextResponse } from 'next/server';
import { jsonError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import {
  ACCESS_NOTIFICATION_CONDITIONS,
  type OrgMechanic,
  type Tariff,
  type TariffQuota,
  type DowngradePolicyMap,
  type TrialPolicy,
  type PaidPeriodPolicy,
} from '@/modules/org-entitlements/types';

/**
 * Closed allowlist of the commercial constructor's own validation codes — the exact literals
 * `modules/org-entitlements` throws. The admin screen shows this code, so S4 must keep every one of
 * them distinct; only what is *not* on this list (a PostgreSQL failure, a runtime bug) collapses to
 * the fallback and travels to the operator log under the correlation id instead of to the browser.
 * A code added in the module without a line here degrades safely — it stops being named, it never
 * starts leaking.
 */
const COMMERCIAL_ERROR_RULES: ApiErrorLiteralRules = {
  access_notification_condition_invalid: { code: 'access_notification_condition_invalid', status: 400 },
  access_notification_offset_invalid: { code: 'access_notification_offset_invalid', status: 400 },
  access_notification_template_id_invalid: { code: 'access_notification_template_id_invalid', status: 400 },
  access_notification_template_not_found: { code: 'access_notification_template_not_found', status: 400 },
  access_policy_notifications_invalid: { code: 'access_policy_notifications_invalid', status: 400 },
  access_policy_terminal_state_invalid: { code: 'access_policy_terminal_state_invalid', status: 400 },
  access_policy_value_invalid: { code: 'access_policy_value_invalid', status: 400 },
  entitlement_mechanic_invalid: { code: 'entitlement_mechanic_invalid', status: 400 },
  entitlement_override_expiry_invalid: { code: 'entitlement_override_expiry_invalid', status: 400 },
  mailing_template_id_duplicate: { code: 'mailing_template_id_duplicate', status: 400 },
  mailing_template_id_required: { code: 'mailing_template_id_required', status: 400 },
  mailing_template_name_required: { code: 'mailing_template_name_required', status: 400 },
  paid_period_post_tariff_forbidden: { code: 'paid_period_post_tariff_forbidden', status: 400 },
  paid_period_post_tariff_required: { code: 'paid_period_post_tariff_required', status: 400 },
  tariff_additional_seat_price_invalid: { code: 'tariff_additional_seat_price_invalid', status: 400 },
  tariff_currency_required: { code: 'tariff_currency_required', status: 400 },
  tariff_discounted_price_invalid: { code: 'tariff_discounted_price_invalid', status: 400 },
  tariff_downgrade_policy_invalid: { code: 'tariff_downgrade_policy_invalid', status: 400 },
  tariff_included_seats_required: { code: 'tariff_included_seats_required', status: 400 },
  tariff_name_required: { code: 'tariff_name_required', status: 400 },
  tariff_not_found: { code: 'tariff_not_found', status: 400 },
  tariff_price_invalid: { code: 'tariff_price_invalid', status: 400 },
  // #1069 owner decision 2026-09-05 (period grid) — `assertCompleteTariffPeriodPriceMatrix`
  // (modules/saas-billing/billingPeriodCatalog.ts) and `setBillingPeriodSelectable`
  // (modules/org-entitlements/service.ts).
  saas_tariff_period_price_duplicate: { code: 'saas_tariff_period_price_duplicate', status: 400 },
  saas_tariff_period_price_unknown_period: { code: 'saas_tariff_period_price_unknown_period', status: 400 },
  saas_tariff_period_price_invalid: { code: 'saas_tariff_period_price_invalid', status: 400 },
  saas_tariff_period_price_discount_invalid: { code: 'saas_tariff_period_price_discount_invalid', status: 400 },
  saas_tariff_period_price_missing: { code: 'saas_tariff_period_price_missing', status: 400 },
  billing_period_not_found: { code: 'billing_period_not_found', status: 400 },
  saas_billing_period_activation_incomplete: {
    code: 'saas_billing_period_activation_incomplete',
    status: 400,
  },
  tariff_quota_limit_invalid: { code: 'tariff_quota_limit_invalid', status: 400 },
  tariff_quota_mechanic_invalid: { code: 'tariff_quota_mechanic_invalid', status: 400 },
  tariff_quota_unit_invalid: { code: 'tariff_quota_unit_invalid', status: 400 },
  tariff_quota_unlimited_limit_invalid: { code: 'tariff_quota_unlimited_limit_invalid', status: 400 },
  tariff_quota_warning_invalid: { code: 'tariff_quota_warning_invalid', status: 400 },
  tariff_quota_warning_unsupported: { code: 'tariff_quota_warning_unsupported', status: 400 },
  tariff_seat_limit_invalid: { code: 'tariff_seat_limit_invalid', status: 400 },
  trial_discount_window_invalid: { code: 'trial_discount_window_invalid', status: 400 },
  trial_duration_invalid: { code: 'trial_duration_invalid', status: 400 },
  trial_post_tariff_forbidden: { code: 'trial_post_tariff_forbidden', status: 400 },
  trial_post_tariff_required: { code: 'trial_post_tariff_required', status: 400 },
  trial_start_event_required: { code: 'trial_start_event_required', status: 400 },
};

const quotaAmountSchema = {
  kind: z.enum(['numeric', 'unlimited']),
  limit: z.number().int().nonnegative().nullable(),
};
const warningAtPercentSchema = z.number().int().min(0).max(100).nullable();

// §5a item 2.6a (owner 31.07) — the early-warning threshold exists only for file volume since Т12
// (19.08) took the client count away; branches deliberately have no such field, so a percent sent
// for them is rejected at the boundary instead of being stored and ignored.
const storageQuotaSchema = z.object({
  ...quotaAmountSchema,
  unit: z.literal('bytes'),
  warningAtPercent: warningAtPercentSchema,
});
const branchStockQuotaSchema = z
  .object({ ...quotaAmountSchema, unit: z.literal('items') })
  .strict();
/** Overrides carry the mechanic separately; `assertQuota` in the service rejects a mismatch. */
const quotaSchema = z.union([storageQuotaSchema, branchStockQuotaSchema]);

// §T3 — a tariff's own list of marketing letters; a notification row below references one by id
// instead of embedding its text. Shape-only: subject/body are owner data, never inspected here.
const mailingTemplateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  subject: z.string(),
  body: z.string(),
});

// §5a item 2.6a — уведомления лестницы: список строк «срок · условие · шаблон», без ограничения
// на длину. §T3: the row POINTS AT a template (`templateId`) instead of embedding text; `template`
// stays present so a pre-T3 row's already-shipped text round-trips unchanged when no template is
// chosen for it — the service resolves/overwrites it whenever `templateId` is set (see service.ts).
const accessNotificationSchema = z.object({
  offsetDays: z.number().int(),
  condition: z.enum(ACCESS_NOTIFICATION_CONDITIONS),
  templateId: z.string().trim().min(1).nullable().optional(),
  template: z.string(),
});

const accessPolicySchema = z.object({
  graceDays: z.number().int().nonnegative(),
  readOnlyDays: z.number().int().nonnegative(),
  notifications: z.array(accessNotificationSchema),
  terminalState: z.enum(['read_only', 'disabled']),
});

// Backward-compatible API input for the already persisted downgrade lifecycle. The commercial
// constructor no longer renders or submits this field; omission preserves the stored policy.
const downgradePolicySchema = z.enum(['block', 'freeze_growth', 'disable_immediately', 'read_only']);

// #1069 owner decision 2026-09-05 (period grid) — a tariff's money is the COMPLETE per-period
// matrix, never a single price/period pair. `priceMinor`/`billingPeriod` are gone from the input:
// the port type (`Omit<Tariff, ... | 'priceMinor' | 'billingPeriod'>`) already refuses them.
const tariffPeriodPriceSchema = z.object({
  billingPeriodCode: z.string().trim().min(1),
  priceMinor: z.number().int().nonnegative(),
  discountedPriceMinor: z.number().int().nonnegative().nullable(),
});

const tariffInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  currency: z.string().trim().min(1).nullable(),
  periodPrices: z.array(tariffPeriodPriceSchema),
  mechanics: z.record(z.string(), z.boolean()),
  quotas: z
    .object({
      files: storageQuotaSchema.optional(),
      branches: branchStockQuotaSchema.optional(),
    })
    .strict(),
  systemAccessPolicy: accessPolicySchema.nullable(),
  /** Accepted for API compat; service always persists `{}` (#1069 T1, owner 05.08). */
  mechanicAccessPolicies: z.record(z.string(), accessPolicySchema),
  downgradePolicies: z.record(z.string(), downgradePolicySchema).optional(),
  mailingTemplates: z.array(mailingTemplateSchema),
  /** §5a item 2.6a — required: a tariff with no seat count is not a saveable tariff. */
  includedSeats: z.number().int().nonnegative(),
  /** §5a item 5.1 — null means overage past includedSeats stays hard-blocked (§5.2, unchanged). */
  additionalSeatPriceMinor: z.number().int().nonnegative().nullable(),
  /** Т8 — exact discounted price for this tariff's discount-payment window; null gives no discount. */
  discountedPriceMinor: z.number().int().nonnegative().nullable(),
  isActive: z.boolean(),
});

const trialPolicySchema = z.object({
  durationDays: z.number().int().positive(),
  discountWindowDays: z.number().int().nonnegative(),
  startEvent: z.string().trim().min(1),
  postTrialBehavior: z.enum(['read_only', 'blocked', 'tariff']),
  postTrialTariffId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

// §5a item 2.6a (owner 31.07) — the tariff granted at registration, independent of the trial
// policy above. `null` is legal: no code default, the person picks a tariff themselves.
const registrationTariffPolicySchema = z.object({
  tariffId: z.string().uuid().nullable(),
});

const paidPeriodPolicySchema = z.object({
  postPaidPeriodBehavior: z.enum(['read_only', 'blocked', 'tariff']),
  postPaidPeriodTariffId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

const billingPeriodUpsertSchema = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  months: z.number().int().positive(),
});

// Owner 2026-07-26 (#1003): a reason is recorded on every audit-log row (actor, action, before/after)
// regardless of content — it is no longer REQUIRED to save an edit. Still capped so a pasted essay
// can't bloat the audit row.
const reasonSchema = z.string().trim().max(500);
const uuidSchema = z.string().uuid();

const operationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_tariff'), tariff: tariffInputSchema, reason: reasonSchema }),
  z.object({
    action: z.literal('update_tariff'),
    tariffId: uuidSchema,
    tariff: tariffInputSchema,
    reason: reasonSchema,
  }),
  z.object({ action: z.literal('archive_tariff'), tariffId: uuidSchema, reason: reasonSchema }),
  z.object({
    action: z.literal('assign_tariff'),
    organizationId: uuidSchema,
    tariffId: uuidSchema.nullable(),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('upsert_override'),
    organizationId: uuidSchema,
    mechanic: z.string().trim().min(1),
    enabled: z.boolean(),
    quota: quotaSchema.nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('delete_override'),
    organizationId: uuidSchema,
    mechanic: z.string().trim().min(1),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('set_trial_policy'),
    policy: trialPolicySchema,
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('set_registration_tariff_policy'),
    policy: registrationTariffPolicySchema,
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('set_paid_period_policy'),
    policy: paidPeriodPolicySchema,
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('upsert_billing_period'),
    period: billingPeriodUpsertSchema,
    reason: reasonSchema,
  }),
  // #1069 owner decision 2026-09-05 (period grid) — the ONE door that turns a period selectable
  // or retires it (see `setBillingPeriodSelectable` in org-entitlements/service.ts).
  z.object({
    action: z.literal('set_billing_period_selectable'),
    code: z.string().trim().min(1),
    isSelectable: z.boolean(),
    reason: reasonSchema,
  }),
  z.object({ action: z.literal('start_trial'), organizationId: uuidSchema, reason: reasonSchema }),
]);

type TariffInput = Omit<
  Tariff,
  'id' | 'createdAt' | 'updatedAt' | 'downgradePolicies' | 'priceMinor' | 'billingPeriod'
> & {
  downgradePolicies?: DowngradePolicyMap;
};

export async function GET() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const service = buildAppDeps().platformEntitlements;
  const [tariffs, organizations, trialPolicy, registrationTariffPolicy, billingPeriods, paidPeriodPolicy] =
    await Promise.all([
    service.listTariffs(),
    service.listOrganizations(),
    service.getTrialPolicy(),
    service.getRegistrationTariffPolicy(),
    service.listBillingPeriods(),
    service.getPaidPeriodPolicy(),
  ]);
  return NextResponse.json({
    ok: true,
    tariffs,
    organizations,
    trialPolicy,
    registrationTariffPolicy,
    billingPeriods,
    paidPeriodPolicy,
  });
}

export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsed = operationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_commercial_operation' }, { status: 400 });
  }

  const service = buildAppDeps().platformEntitlements;
  const operation = parsed.data;
  const audit = { actorId: gate.session.user.userId, reason: operation.reason };
  try {
    let result: unknown = null;
    switch (operation.action) {
      case 'create_tariff':
        result = await service.createTariff(operation.tariff as TariffInput, audit);
        break;
      case 'update_tariff':
        result = await service.updateTariff(
          operation.tariffId,
          operation.tariff as TariffInput,
          audit,
        );
        break;
      case 'archive_tariff':
        await service.archiveTariff(operation.tariffId, audit);
        break;
      case 'assign_tariff':
        await service.assignTariff(operation.organizationId, operation.tariffId, audit);
        break;
      case 'upsert_override':
        await service.upsertOverride(
          {
            organizationId: operation.organizationId,
            mechanic: operation.mechanic as OrgMechanic,
            enabled: operation.enabled,
            quota: operation.quota as TariffQuota | null,
            expiresAt: operation.expiresAt,
          },
          audit,
        );
        break;
      case 'delete_override':
        await service.deleteOverride(
          operation.organizationId,
          operation.mechanic as OrgMechanic,
          audit,
        );
        break;
      case 'set_trial_policy':
        await service.setTrialPolicy(operation.policy as TrialPolicy, audit);
        break;
      case 'set_registration_tariff_policy':
        await service.setRegistrationTariffPolicy(operation.policy, audit);
        break;
      case 'set_paid_period_policy':
        await service.setPaidPeriodPolicy(operation.policy as PaidPeriodPolicy, audit);
        break;
      case 'upsert_billing_period':
        result = await service.upsertBillingPeriod(operation.period, audit);
        break;
      case 'set_billing_period_selectable':
        result = await service.setBillingPeriodSelectable(
          operation.code,
          operation.isSelectable,
          audit,
        );
        break;
      case 'start_trial':
        result = await service.startTrial(operation.organizationId, audit);
        break;
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return jsonError({
      error,
      literalRules: COMMERCIAL_ERROR_RULES,
      fallback: { code: 'commercial_operation_failed', status: 400 },
      logEvent: 'admin_commercial_operation_failed',
    });
  }
}
