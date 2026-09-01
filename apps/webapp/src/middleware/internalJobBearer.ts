import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export type InternalJobBearerResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * The one Authorization: Bearer <INTERNAL_JOB_SECRET> check for every internal background-job route
 * (W2, systemic residual audit 27.08.2026). Before this, timing-safe comparison and the
 * not_configured/unauthorized responses were copy-pasted into each of the 15
 * `app/api/internal/**` routes that use this principal.
 *
 * `notConfiguredStatus` exists for exactly one deliberate outlier: `media-transcode/reconcile`
 * returns 500 (not the usual 503) when the secret is missing, because its manifest entry declares
 * 503 an *accepted* cron status for `pipeline_disabled`/`reconcile_disabled` — a genuine
 * `not_configured` misconfiguration must stay loud instead of being swallowed by that allowance.
 */
export function verifyInternalJobBearer(
  request: Request,
  opts?: { readonly notConfiguredStatus?: number },
): InternalJobBearerResult {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'not_configured' },
        { status: opts?.notConfiguredStatus ?? 503 },
      ),
    };
  }

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !bearerMatchesSecret(token, secret)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }

  return { ok: true };
}
