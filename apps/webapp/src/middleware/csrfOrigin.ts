export const INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS = [
  '/api/integrator/channel-link/complete',
  '/api/integrator/events',
  '/api/integrator/messenger-phone/bind',
  '/api/integrator/operator-health/digest-wake',
  '/api/integrator/patient-reminders/materialize-wake',
  '/api/integrator/patient-notifications/web-push',
  '/api/integrator/phone-messenger-bind/complete',
  '/api/integrator/program-note/reply-begin',
  '/api/integrator/reminders/dispatch',
  '/api/integrator/system-health/guard-wake',
  '/api/integrator/support/admin-reply',
  '/api/integrator/support/delivery-attempt',
  '/api/integrator/support/question',
  '/api/integrator/support/status',
  '/api/integrator/support/sync-user-message',
  '/api/integrator/web-push/subscriptions/delete',
] as const;

export const INTERNAL_BEARER_CSRF_EXEMPT_PATHS = [
  '/api/internal/media-hls-proxy-errors/retention',
  '/api/internal/media-multipart/cleanup',
  '/api/internal/media-pending-delete/purge',
  '/api/internal/media-playback-stats/retention',
  '/api/internal/media-preview/process',
  '/api/internal/media-transcode/enqueue',
  '/api/internal/media-transcode/reconcile',
  '/api/internal/media-worker/control',
  // Приёмник dead man's switch (design D-d). Имена — закрытый набор из
  // `modules/operator-health/heartbeat.ts`, поэтому перечислены явно, а не паттерном:
  // список должен оставаться читаемым при аудите.
  '/api/internal/heartbeat/pipeline_delivery',
  '/api/internal/heartbeat/digest',
  '/api/internal/operator-health-critical/tick',
  '/api/internal/operator-health-digest/tick',
  '/api/internal/product-analytics/retention',
  '/api/internal/saas-billing/renewal/tick',
  '/api/internal/specialist-task-reminders/tick',
  '/api/internal/system-health-guard/tick',
] as const;

export const PAYMENT_WEBHOOK_CSRF_EXEMPT_PATTERNS = [
  /^\/api\/payments\/webhook\/[^/]+$/,
  /^\/api\/payments\/patient-acquiring-webhook\/[^/]+$/,
  /^\/api\/payments\/saas-webhook\/[^/]+$/,
] as const;

export const APPLE_FORM_POST_CSRF_EXEMPT_PATH = '/api/auth/oauth/callback/apple';

const integratorHmacPaths: ReadonlySet<string> = new Set(INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS);
const internalBearerPaths: ReadonlySet<string> = new Set(INTERNAL_BEARER_CSRF_EXEMPT_PATHS);
const unsafeMethods: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type CsrfMutationClass =
  | 'browser'
  | 'integrator_hmac'
  | 'internal_bearer'
  | 'payment_webhook'
  | 'apple_form_post';

export type CsrfOriginAllowProof =
  | 'safe_method'
  | 'out_of_scope'
  | 'integrator_hmac'
  | 'internal_bearer'
  | 'payment_webhook'
  | 'apple_form_post'
  | 'same_origin_origin'
  | 'same_origin_referer';

export type CsrfOriginRejectProof =
  | 'fetch_site_forbidden'
  | 'request_origin_invalid'
  | 'origin_invalid'
  | 'origin_mismatch'
  | 'referer_invalid'
  | 'referer_mismatch'
  | 'source_headers_missing';

export type CsrfOriginDecision =
  | { action: 'allow'; proof: CsrfOriginAllowProof; mutationClass: CsrfMutationClass | null }
  | { action: 'reject'; proof: CsrfOriginRejectProof; mutationClass: 'browser' };

export type CsrfOriginInput = Readonly<{
  method: string;
  pathname: string;
  host: string | null;
  requestUrlProtocol: string;
  forwardedProto: string | null;
  secFetchSite: string | null;
  origin: string | null;
  referer: string | null;
}>;

export function classifyCsrfMutation(method: string, pathname: string): CsrfMutationClass | null {
  if (!unsafeMethods.has(method.toUpperCase())) return null;
  if (method.toUpperCase() === 'POST') {
    if (integratorHmacPaths.has(pathname)) return 'integrator_hmac';
    if (internalBearerPaths.has(pathname)) return 'internal_bearer';
    if (PAYMENT_WEBHOOK_CSRF_EXEMPT_PATTERNS.some((pattern) => pattern.test(pathname))) {
      return 'payment_webhook';
    }
    if (pathname === APPLE_FORM_POST_CSRF_EXEMPT_PATH) return 'apple_form_post';
  }
  if (pathname === '/app' || pathname.startsWith('/app/') || pathname.startsWith('/api/')) {
    return 'browser';
  }
  return null;
}

function resolveProtocol(
  forwardedProto: string | null,
  requestUrlProtocol: string,
): 'http' | 'https' | null {
  const candidate =
    forwardedProto === null
      ? requestUrlProtocol.replace(/:$/, '').trim().toLowerCase()
      : (forwardedProto.split(',', 1)[0] ?? '').trim().toLowerCase();
  return candidate === 'http' || candidate === 'https' ? candidate : null;
}

function canonicalRequestOrigin(input: CsrfOriginInput): string | null {
  const protocol = resolveProtocol(input.forwardedProto, input.requestUrlProtocol);
  const host = input.host?.trim() ?? '';
  if (!protocol || !host || /[,\s/@\\?#]/.test(host)) return null;
  try {
    const parsed = new URL(`${protocol}://${host}/`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseCanonicalOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value || value === 'null' || value.includes(',')) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.origin !== value
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseRefererOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value || /,\s*https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function decideCsrfOrigin(input: CsrfOriginInput): CsrfOriginDecision {
  const mutationClass = classifyCsrfMutation(input.method, input.pathname);
  if (mutationClass === null) {
    return {
      action: 'allow',
      proof: unsafeMethods.has(input.method.toUpperCase()) ? 'out_of_scope' : 'safe_method',
      mutationClass: null,
    };
  }
  if (mutationClass !== 'browser') {
    return { action: 'allow', proof: mutationClass, mutationClass };
  }

  if (input.secFetchSite !== null && input.secFetchSite.trim().toLowerCase() !== 'same-origin') {
    return { action: 'reject', proof: 'fetch_site_forbidden', mutationClass };
  }

  const expectedOrigin = canonicalRequestOrigin(input);
  if (!expectedOrigin) {
    return { action: 'reject', proof: 'request_origin_invalid', mutationClass };
  }

  if (input.origin !== null) {
    const observedOrigin = parseCanonicalOrigin(input.origin);
    if (!observedOrigin) return { action: 'reject', proof: 'origin_invalid', mutationClass };
    return observedOrigin === expectedOrigin
      ? { action: 'allow', proof: 'same_origin_origin', mutationClass }
      : { action: 'reject', proof: 'origin_mismatch', mutationClass };
  }

  if (input.referer !== null) {
    const observedOrigin = parseRefererOrigin(input.referer);
    if (!observedOrigin) return { action: 'reject', proof: 'referer_invalid', mutationClass };
    return observedOrigin === expectedOrigin
      ? { action: 'allow', proof: 'same_origin_referer', mutationClass }
      : { action: 'reject', proof: 'referer_mismatch', mutationClass };
  }

  return { action: 'reject', proof: 'source_headers_missing', mutationClass };
}
