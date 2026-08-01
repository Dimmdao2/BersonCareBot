import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enterWithDbPlatformPrincipal } from '@bersoncare/db-principal';
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
 * К5 — not a real `platform_users` row: `saas_billing_*` tables are FORCE RLS to
 * `app_platform_settings` only (migration `0259_saas_billing_foundation.sql`), and the "platform"
 * DB principal never uses `platformUserId` for row-scoping (see `db-principal` — only `SET ROLE
 * app_platform_settings`, no per-user predicate) — it exists purely to satisfy the UUID-shaped type.
 * Same nil-UUID-as-sentinel convention already used by `pgBookingScheduling.ts`.
 */
const SAAS_BILLING_RENEWAL_TICK_SYSTEM_PLATFORM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * POST — К5: raises the renewal invoice for every `paid_subscription` whose paid period has ended.
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`, called only by cron — never by a user
 * request or a screen open. Filtering ("which organizations are due") happens inside
 * `runDueSaasBillingRenewals`'s one enumeration query, under this platform principal; nothing here
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
  enterWithDbPlatformPrincipal({
    platformUserId: SAAS_BILLING_RENEWAL_TICK_SYSTEM_PLATFORM_USER_ID,
    source: 'api/internal/saas-billing/renewal/tick:POST',
  });

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
  );

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const result = await buildAppDeps().saasBilling.runDueSaasBillingRenewals({ limit });
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
