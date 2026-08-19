import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_SAAS_BILLING_JOB_FAMILY,
  OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST — К5: raises the renewal invoice for every `paid_subscription` whose paid period has ended,
 * then (Р-15) re-issues every seat-overage invoice whose validity ran out unpaid.
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`, called only by cron — never by a user
 * request or a screen open. Filtering ("which organizations are due") happens inside
 * `runDueSaasBillingRenewals`'s one declared enumeration root; nothing here
 * or downstream re-queries "all subscriptions" on its own. A repeat tick for an already-invoiced
 * period is a no-op by construction (`saas_billing_invoices_period_uidx`), not a pre-check.
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
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
    // Р-15: просроченный счёт за место отменяется и выставляется заново с пересчитанной суммой.
    // Второй шаг ТОГО ЖЕ тика, а не второй крон: расписание одно, и лишний вход был бы лишней
    // дверью. Перечисление кандидатов живёт в репозитории, как и у продления выше.
    const seatReissues = await saasBilling.runDueSeatOverageInvoiceReissues({ limit });
    const result = { ...renewals, seatReissues };
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_SAAS_BILLING_JOB_FAMILY,
      jobKey: OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: result,
    });
    return NextResponse.json({ ok: true, ...result });
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
