import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import type {
  OrgMechanic,
  Tariff,
  TariffQuota,
  TrialPolicy,
} from '@/modules/org-entitlements/types';

const quotaAmountSchema = {
  kind: z.enum(['numeric', 'unlimited']),
  limit: z.number().int().nonnegative().nullable(),
};
const warningAtPercentSchema = z.number().int().min(0).max(100).nullable();

// §5a item 2.6a (owner 31.07) — the early-warning threshold exists only for patients and file
// volume; branches deliberately have no such field, so a percent sent for them is rejected at the
// boundary instead of being stored and ignored.
const storageQuotaSchema = z.object({
  ...quotaAmountSchema,
  unit: z.literal('bytes'),
  warningAtPercent: warningAtPercentSchema,
});
const patientStockQuotaSchema = z.object({
  ...quotaAmountSchema,
  unit: z.literal('items'),
  warningAtPercent: warningAtPercentSchema,
});
const branchStockQuotaSchema = z
  .object({ ...quotaAmountSchema, unit: z.literal('items') })
  .strict();
/** Overrides carry the mechanic separately; `assertQuota` in the service rejects a mismatch. */
const quotaSchema = z.union([storageQuotaSchema, patientStockQuotaSchema, branchStockQuotaSchema]);

// §5a item 2.6a — уведомления лестницы: список строк «срок · условие · шаблон», без ограничения
// на длину. Texts and their variables are data, so the template is only checked for being present.
const accessNotificationSchema = z.object({
  offsetDays: z.number().int(),
  condition: z.enum(['payment_succeeded', 'payment_failed']),
  template: z.string().trim().min(1),
});

const accessPolicySchema = z.object({
  graceDays: z.number().int().nonnegative(),
  readOnlyDays: z.number().int().nonnegative(),
  notifications: z.array(accessNotificationSchema),
  terminalState: z.enum(['read_only', 'disabled']),
});

// §5a stage 4b.3 — the union covers both mechanic classes; `assertDowngradePolicy` (service.ts)
// rejects a value that doesn't match the mechanic's own class, so this schema only bounds the set.
const downgradePolicySchema = z.enum(['block', 'freeze_growth', 'disable_immediately', 'read_only']);

const tariffInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().trim().min(1).nullable(),
  billingPeriod: z.enum(['day', 'month', 'year']),
  mechanics: z.record(z.string(), z.boolean()),
  quotas: z
    .object({
      files: storageQuotaSchema.optional(),
      patient_count: patientStockQuotaSchema.optional(),
      branches: branchStockQuotaSchema.optional(),
    })
    .strict(),
  systemAccessPolicy: accessPolicySchema.nullable(),
  mechanicAccessPolicies: z.record(z.string(), accessPolicySchema),
  downgradePolicies: z.record(z.string(), downgradePolicySchema),
  /** §5a item 2.6a — required: a tariff with no seat count is not a saveable tariff. */
  includedSeats: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

const trialPolicySchema = z.object({
  tariffId: z.string().uuid(),
  durationDays: z.number().int().positive(),
  graceDays: z.number().int().nonnegative(),
  startEvent: z.string().trim().min(1),
  postTrialBehavior: z.enum(['read_only', 'blocked', 'tariff']),
  postTrialTariffId: z.string().uuid().nullable(),
  isActive: z.boolean(),
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
  z.object({ action: z.literal('start_trial'), organizationId: uuidSchema, reason: reasonSchema }),
  z.object({
    action: z.literal('extend_trial'),
    organizationId: uuidSchema,
    days: z.number().int().positive().max(3650),
    reason: reasonSchema,
  }),
]);

type TariffInput = Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>;

export async function GET() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const service = buildAppDeps().platformEntitlements;
  const [tariffs, organizations, trialPolicy] = await Promise.all([
    service.listTariffs(),
    service.listOrganizations(),
    service.getTrialPolicy(),
  ]);
  return NextResponse.json({ ok: true, tariffs, organizations, trialPolicy });
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
      case 'start_trial':
        result = await service.startTrial(operation.organizationId, audit);
        break;
      case 'extend_trial':
        result = await service.extendTrial(operation.organizationId, operation.days, audit);
        break;
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'commercial_operation_failed',
      },
      { status: 400 },
    );
  }
}
