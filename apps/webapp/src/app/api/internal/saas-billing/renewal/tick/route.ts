import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_SAAS_BILLING_JOB_FAMILY,
  OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * POST — К5: raises the renewal invoice for every `paid_subscription` whose paid period has ended.
 * A seat-overage invoice unpaid by period end is not reissued (Р-19 removed reissue entirely) — its
 * debt carries into that same renewal invoice as `carriedDebtMinor` (Р-18), inside
 * `runDueSaasBillingRenewals` itself.
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`, called only by cron — never by a user
 * request or a screen open. Filtering ("which organizations are due") happens inside
 * `runDueSaasBillingRenewals`'s one declared enumeration root; nothing here
 * or downstream re-queries "all subscriptions" on its own. A repeat tick for an already-invoiced
 * period is a no-op by construction (`saas_billing_invoices_period_uidx`), not a pre-check.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  // Машинный тик — машинный принципал (класс `service`, роль `app_worker`), как у КАЖДОГО
  // остального внутреннего тика вебаппа. Прежде маршрут входил ПЛАТФОРМЕННЫМ принципалом и
  // подставлял актором нулевой UUID; класс `platform` по построению требует живого администратора
  // платформы (`app_ext.assert_port_context_claim`), поэтому запрос падал на установке контекста —
  // строки `billing.saas_renewal.tick` в `operator_job_status` не появилось ни разу. Проверка
  // администратора не ослаблена: тик перестал её заявлять, а межарендное перечисление получило
  // свою дверь — `app.list_saas_billing_subscriptions_due_for_renewal(...)` (миграция 0040).
  enterWithDbInfraPrincipal({ source: 'api/internal/saas-billing/renewal/tick:POST' });

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
  );

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const saasBilling = buildAppDeps().saasBilling;
    const renewals = await saasBilling.runDueSaasBillingRenewals({ limit });
    const result = { ...renewals };
    const success = renewals.failed === 0 && renewals.errors.length === 0;
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_SAAS_BILLING_JOB_FAMILY,
      jobKey: OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success,
      ...(success ? {} : { error: `${renewals.failed} renewal(s) failed` }),
      metaJson: result,
    });
    return NextResponse.json(
      { ok: success, ...result },
      success ? undefined : { status: 500 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_SAAS_BILLING_JOB_FAMILY,
      jobKey: OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/saas-billing/renewal/tick] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
