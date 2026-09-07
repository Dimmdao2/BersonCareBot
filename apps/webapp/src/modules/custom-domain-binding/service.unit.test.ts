import { describe, expect, it } from 'vitest';
import type {
  CustomDomainBindingPort,
  CustomDomainBindingState,
} from './ports';
import { createCustomDomainBindingService } from './service';

function unused(): Promise<never> {
  return Promise.reject(new Error('unexpected_port_call'));
}

function echoingPort(): CustomDomainBindingPort {
  return {
    resolveActiveOrganizationByHostname: unused,
    readAnonymousPatientSurfaceProjection: unused,
    getBindingState: unused,
    async setCustomDomainIntent(input) {
      const subdomainLabel = input.placement === 'subdomain' ? input.subdomainLabel ?? null : null;
      const state: CustomDomainBindingState = {
        organizationId: input.organizationId,
        baseDomain: input.baseDomain,
        placement: input.placement,
        subdomainLabel,
        hostname:
          input.placement === 'subdomain'
            ? `${subdomainLabel}.${input.baseDomain}`
            : input.baseDomain,
        status: 'pending',
        statusReason: null,
        activatedAt: null,
      };
      return { ok: true, state };
    },
    clearCustomDomainIntent: unused,
    transitionBindingStatus: unused,
    isHostnameAskAuthorized: unused,
  };
}

describe('custom-domain intent', () => {
  it('stores the fixed app hostname instead of a browser-supplied subdomain label', async () => {
    const service = createCustomDomainBindingService(echoingPort());

    const result = await service.setCustomDomainIntent({
      organizationId: '11111111-1111-4111-8111-111111111111',
      baseDomain: 'Clinic.Example.Test',
      placement: 'subdomain',
      subdomainLabel: 'browser-controlled',
    });

    expect(result).toMatchObject({
      ok: true,
      state: {
        baseDomain: 'clinic.example.test',
        placement: 'subdomain',
        subdomainLabel: 'app',
        hostname: 'app.clinic.example.test',
      },
    });
  });
});
