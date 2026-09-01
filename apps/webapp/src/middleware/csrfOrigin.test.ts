import { describe, expect, it } from 'vitest';
import { decideCsrfOrigin, classifyCsrfMutation } from './csrfOrigin';
import {
  BACKGROUND_JOB_MANIFEST,
  INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS,
} from '@/modules/operator-health/backgroundJobManifest';

describe('decideCsrfOrigin — integrator signed server-to-server mutations', () => {
  it.each([
    '/api/integrator/appointment-reminders/materialize',
    '/api/integrator/patient-reminders/materialize-wake',
    '/api/integrator/phone-messenger-bind/claim',
  ])('lets the HMAC-authenticated caller reach %s without browser origin headers', (pathname) => {
    const decision = decideCsrfOrigin({
      method: 'POST',
      pathname,
      host: 'test.bersoncare.ru',
      requestUrlProtocol: 'https:',
      forwardedProto: 'https',
      secFetchSite: null,
      origin: null,
      referer: null,
    });
    expect(decision.action).toBe('allow');
    expect(decision.proof).toBe('integrator_hmac');
  });
});

describe('decideCsrfOrigin — saas platform webhook receiver', () => {
  // A real provider notification is server-to-server: no Origin, no Referer, no Sec-Fetch-Site.
  // If this gate rejects it, the request never reaches the route handler and the payment is
  // never captured — expensive and silent, since the provider still shows the money as paid.
  it('lets a real provider call (no origin headers) reach the saas-webhook handler', () => {
    const decision = decideCsrfOrigin({
      method: 'POST',
      pathname: '/api/payments/saas-webhook/yookassa',
      host: 'app.example.test',
      requestUrlProtocol: 'https:',
      forwardedProto: null,
      secFetchSite: null,
      origin: null,
      referer: null,
    });

    expect(decision.action).toBe('allow');
  });
});

describe('decideCsrfOrigin — media-worker control', () => {
  it('lets the bearer-authenticated worker reach its exact server-to-server endpoint', () => {
    const decision = decideCsrfOrigin({
      method: 'POST',
      pathname: '/api/internal/media-worker/control',
      host: 'test.bersoncare.ru',
      requestUrlProtocol: 'https:',
      forwardedProto: 'https',
      secFetchSite: null,
      origin: null,
      referer: null,
    });

    expect(decision).toEqual({
      action: 'allow',
      proof: 'internal_bearer',
      mutationClass: 'internal_bearer',
    });
  });

  it('does not exempt a path below the control endpoint', () => {
    const decision = decideCsrfOrigin({
      method: 'POST',
      pathname: '/api/internal/media-worker/control/extra',
      host: 'test.bersoncare.ru',
      requestUrlProtocol: 'https:',
      forwardedProto: 'https',
      secFetchSite: null,
      origin: null,
      referer: null,
    });

    expect(decision.action).toBe('reject');
  });
});

describe('decideCsrfOrigin — internal_bearer class derives from the background-job manifest (W2)', () => {
  const manifestBearerRoutes = BACKGROUND_JOB_MANIFEST.filter(
    (entry) => entry.principal === 'internal_job_bearer' && entry.route,
  );

  it('has at least one manifest job route to guard against an empty, trivially-passing sweep', () => {
    expect(manifestBearerRoutes.length).toBeGreaterThan(0);
  });

  it.each(manifestBearerRoutes.map((entry) => [entry.id, entry.route!.path] as const))(
    'classifies every manifest internal_job_bearer route (%s → %s) as internal_bearer',
    (_id, path) => {
      expect(classifyCsrfMutation('POST', path)).toBe('internal_bearer');
    },
  );

  it.each(INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS)(
    'classifies the non-scheduled internal_job_bearer route %s as internal_bearer',
    (path) => {
      expect(classifyCsrfMutation('POST', path)).toBe('internal_bearer');
    },
  );

  // Regression for the exact defect W2 fixed: these two manifest job routes were missing from the
  // old hand-copied CSRF path list and fell through to the 'browser' class instead.
  it.each(['/api/internal/domain-health/tick', '/api/internal/db-journal-retention/tick'])(
    'keeps %s classified as internal_bearer, not browser',
    (path) => {
      expect(classifyCsrfMutation('POST', path)).toBe('internal_bearer');
    },
  );
});
