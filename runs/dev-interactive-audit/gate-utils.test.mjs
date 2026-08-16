import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalAuditUrl,
  exactUrlMatches,
  routeTemplateKey,
  shouldIgnoreRequestFailure,
  summarizeBinaryGate,
} from './gate-utils.mjs';

test('preserves tab and section query while redacting only entity identifiers', () => {
  const url =
    '/app/doctor/patients/59fbb0c9-371d-4fcc-8602-78e174c81062?tab=finances&organizationId=f5c1da34-5a25-4ac5-a7c4-74b45cb979ba';
  assert.equal(
    canonicalAuditUrl(url),
    '/app/doctor/patients/:uuid?organizationId=%3Auuid&tab=finances',
  );
});

test('collapses different entity rows to one route template without collapsing semantic tabs', () => {
  const first = routeTemplateKey(
    '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview',
  );
  const second = routeTemplateKey(
    '/app/doctor/patients/22222222-2222-4222-8222-222222222222?tab=overview',
  );
  const finances = routeTemplateKey(
    '/app/doctor/patients/22222222-2222-4222-8222-222222222222?tab=finances',
  );
  assert.equal(first, second);
  assert.notEqual(first, finances);
});

test('exact URL comparison catches a dropped query parameter', () => {
  assert.equal(
    exactUrlMatches(
      '/app/doctor/schedule?tab=setup&section=locations',
      '/app/doctor/schedule?tab=setup&section=locations',
    ),
    true,
  );
  assert.equal(
    exactUrlMatches(
      '/app/doctor/schedule?tab=setup',
      '/app/doctor/schedule?tab=setup&section=locations',
    ),
    false,
  );
});

test('ignores harness-created aborts only while a harness navigation is active', () => {
  assert.equal(
    shouldIgnoreRequestFailure({ errorText: 'net::ERR_ABORTED', harnessNavigationActive: true }),
    true,
  );
  assert.equal(
    shouldIgnoreRequestFailure({ errorText: 'net::ERR_ABORTED', harnessNavigationActive: false }),
    false,
  );
  assert.equal(
    shouldIgnoreRequestFailure({ errorText: 'net::ERR_FAILED', harnessNavigationActive: true }),
    false,
  );
});

test('binary gate fails for identity, page, action, network, or console evidence', () => {
  const clean = {
    role: 'doctor',
    authenticated: true,
    identity_assertion: { pass: true },
    pages: [{ url: '/app/doctor', pass: true }],
    action_checks: [{ id: 'doctor.schedule', pass: true }],
    failures: [],
    console_errors: [],
  };
  assert.deepEqual(summarizeBinaryGate([clean]), { pass: true, violations: [] });
  const broken = structuredClone(clean);
  broken.pages[0].pass = false;
  assert.equal(summarizeBinaryGate([broken]).pass, false);
});
