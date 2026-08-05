import { describe, expect, it } from 'vitest';
import { decideCsrfOrigin, INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS } from './csrfOrigin';

describe('decideCsrfOrigin — integrator signed scheduler wakes', () => {
  it('exempts patient reminder materialization wake from browser CSRF', () => {
    expect(INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS).toContain(
      '/api/integrator/patient-reminders/materialize-wake',
    );
    const decision = decideCsrfOrigin({
      method: 'POST',
      pathname: '/api/integrator/patient-reminders/materialize-wake',
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
