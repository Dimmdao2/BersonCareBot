#!/usr/bin/env node
/**
 * Binary live gate for the already-running canonical DEV server. It neither
 * starts services nor changes schema/grants. Mutation adapters are opt-in.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '../clickthrough/lib/browser.mjs';
import { CONTROL_ADAPTER_MATRIX, DOCTOR_PATIENT_CARD_TABS, ROLE_SCENARIOS } from './scenarios.mjs';
import {
  canonicalAuditUrl,
  listRowNamePattern,
  routeContractMatches,
  evaluatePageObservation,
  routePatternMatches,
  routeTemplateKey,
  shouldIgnoreRequestFailure,
  summarizeBinaryGate,
} from './gate-utils.mjs';
import { runReversibleCycle } from './reversible-cycle.mjs';

const baseUrl = process.env.DEV_AUDIT_BASE_URL || 'http://127.0.0.1:5200';
const outDir = 'runs/dev-interactive-audit/out';
const password = process.env.DEV_AUDIT_PASSWORD || '';
const allowSynthetic = process.env.DEV_AUDIT_ALLOW_SYNTHETIC === '1';
const mutationsEnabled = process.env.DEV_AUDIT_MUTATE === '1';
const skipRoutes = process.env.DEV_AUDIT_SKIP_ROUTES === '1';
const configuredOrganizationId = process.env.DEV_AUDIT_ORGANIZATION_ID || null;
const patientName = process.env.DEV_AUDIT_PATIENT_NAME || 'Берсон Дмитрий';
const patientPhone = '+79189000782';
const requiredRoles = Object.keys(ROLE_SCENARIOS);
const requestedRoles = (process.env.DEV_AUDIT_ROLES || requiredRoles.join(','))
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean);
const aggregateArtifacts = (process.env.DEV_AUDIT_AGGREGATE_ARTIFACTS || '')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);
let stopRequested = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    console.error(JSON.stringify({ event: 'dev_audit_stop_requested', signal }));
  });
}
for (const role of requestedRoles) {
  if (!ROLE_SCENARIOS[role]) throw new Error(`DEV_AUDIT_ROLES contains unknown role: ${role}`);
}
const base = new URL(baseUrl);
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.port !== '5200') {
  throw new Error('DEV_AUDIT_BASE_URL must be the canonical http://127.0.0.1:5200 DEV listener');
}

const nowMs = () => performance.now();
const compactError = (error) =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 300);
/** What the surface actually rendered at the moment an action check gave up. */
const observedSurfaceText = async (page, selector) => {
  try {
    return (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').slice(0, 600);
  } catch (error) {
    return `unreadable:${compactError(error)}`;
  }
};
const sameOrigin = (url) => {
  try {
    return new URL(url).origin === base.origin;
  } catch {
    return false;
  }
};
const quantile = (numbers, q) =>
  numbers.length ? numbers[Math.min(numbers.length - 1, Math.ceil(numbers.length * q) - 1)] : null;
const stats = (numbers) => {
  const ordered = [...numbers].sort((a, b) => a - b);
  return {
    count: ordered.length,
    median_ms: quantile(ordered, 0.5),
    p95_ms: quantile(ordered, 0.95),
    max_ms: ordered.at(-1) ?? null,
  };
};
const equalJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function firstVisible(locator) {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function settlePage(page) {
  const started = nowMs();
  const networkIdle = await page
    .waitForLoadState('networkidle', { timeout: 6_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(250);
  return { settle_ms: Math.round(nowMs() - started), network_idle: networkIdle };
}

function attachEvidence(page, evidence, navigationState) {
  page.on('console', (message) => {
    const item = { url: canonicalAuditUrl(page.url()), message: message.text().slice(0, 500) };
    if (message.type() === 'error') evidence.consoleErrors.push(item);
    if (message.type() === 'warning') evidence.consoleWarnings.push(item);
  });
  page.on('pageerror', (error) =>
    evidence.consoleErrors.push({
      url: canonicalAuditUrl(page.url()),
      message: `pageerror: ${error.message}`.slice(0, 500),
    }),
  );
  page.on('requestfailed', (request) => {
    const detail = request.failure()?.errorText ?? 'failed';
    if (
      shouldIgnoreRequestFailure({
        errorText: detail,
        harnessNavigationActive: navigationState.active,
        url: request.url(),
        resourceType: request.resourceType(),
      })
    ) {
      evidence.ignoredHarnessAborts += 1;
      return;
    }
    const item = {
      kind: 'requestfailed',
      url: canonicalAuditUrl(request.url()),
      detail,
      resource: request.resourceType(),
    };
    evidence.failures.push(item);
    evidence.network.push(item);
  });
  page.on('response', (response) => {
    const item = {
      method: response.request().method(),
      status: response.status(),
      url: canonicalAuditUrl(response.url()),
      resource: response.request().resourceType(),
      same_origin: sameOrigin(response.url()),
    };
    if (item.same_origin && new URL(response.url()).pathname.startsWith('/api/')) {
      evidence.api.push(item);
    }
    if (response.status() >= 400) {
      evidence.failures.push({ kind: 'http', ...item });
      evidence.network.push({ kind: 'http', ...item });
    }
  });
}

async function authenticate(context, page, label, scenario) {
  const cookieValue = scenario.sessionCookieEnv ? process.env[scenario.sessionCookieEnv] : null;
  if (cookieValue) {
    await context.addCookies([
      { name: 'bersoncare_webapp_session', value: cookieValue, url: baseUrl, httpOnly: true },
    ]);
    return { kind: 'actual_session_cookie' };
  }
  const email = process.env[scenario.emailEnv] || scenario.defaultEmail;
  if (email && password) {
    await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const response = await page.evaluate(
      async ({ loginUrl, loginEmail, loginPassword }) => {
        const result = await fetch(loginUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', 'X-Real-IP': '127.0.0.1' },
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        });
        return { status: result.status, body: await result.json().catch(() => null) };
      },
      {
        loginUrl: `${baseUrl}/api/auth/email-password/login`,
        loginEmail: email,
        loginPassword: password,
      },
    );
    const body = response.body;
    if (response.status !== 200 || body?.ok !== true || body?.factorRequired === true) {
      throw new Error(
        `actual_${label}_login_failed:${response.status}:${body?.error ?? 'unknown'}`,
      );
    }
    return { kind: 'actual_email_password' };
  }
  if (!allowSynthetic) throw new Error(`actual_${label}_auth_missing`);
  const response = await context.request.get(
    `${baseUrl}/api/auth/dev-bypass?token=dev%3A${scenario.syntheticToken}`,
    { maxRedirects: 0 },
  );
  if (response.status() !== 303)
    throw new Error(`synthetic_${label}_login_failed:${response.status()}`);
  return { kind: 'synthetic_dev_bypass' };
}

async function requestJson(page, evidence, pathname, options = {}) {
  const started = nowMs();
  const response = await page.evaluate(
    async ({ requestUrl, requestMethod, requestHeaders }) => {
      const result = await fetch(requestUrl, {
        method: requestMethod,
        credentials: 'include',
        headers: requestHeaders,
      });
      return {
        ok: result.ok,
        status: result.status,
        body: await result.json().catch(() => null),
      };
    },
    {
      requestUrl: `${baseUrl}${pathname}`,
      requestMethod: options.method || 'GET',
      requestHeaders: { 'X-Real-IP': '127.0.0.1', ...(options.headers || {}) },
    },
  );
  const body = response.body;
  const item = {
    method: options.method || 'GET',
    status: response.status,
    url: canonicalAuditUrl(pathname),
    resource: 'audit-action',
    duration_ms: Math.round(nowMs() - started),
  };
  evidence.api.push(item);
  if (response.status >= 400) {
    evidence.failures.push({ kind: 'action_http', ...item });
    evidence.network.push({ kind: 'action_http', ...item });
  }
  return { ok: response.ok, status: response.status, body, duration_ms: item.duration_ms };
}

async function assertIdentity(page, evidence, label, scenario, expectedOrganizationId) {
  const me = await requestJson(page, evidence, '/api/me');
  const user = me.body?.user;
  const expected = scenario.identity;
  const contact = Array.isArray(user?.contacts)
    ? user.contacts.find(
        (item) => item.kind === expected.contactKind && item.value === expected.contactValue,
      )
    : null;
  const reasons = [];
  if (!me.ok || me.body?.ok !== true) reasons.push(`me_status:${me.status}`);
  if (user?.role !== expected.role) reasons.push(`role:${user?.role ?? 'missing'}`);
  if (!contact) reasons.push(`contact:${expected.contactKind}_mismatch`);
  if (me.body?.platformAccess?.canonicalUserId !== user?.userId)
    reasons.push('canonical_id_mismatch');

  let organizationId = null;
  if (label === 'global_admin') {
    // `/api/me` exposes a patient-only tier. Admin identity is the session role
    // plus resolved canonical DB role; requiring a fictional global_admin tier
    // turned a valid global-admin contract into a gate false positive.
    if (me.body?.platformAccess?.dbRole !== 'admin') reasons.push('global_admin_db_role_mismatch');
    if (me.body?.platformAccess?.tier !== null) reasons.push('global_admin_tier_not_na');
  } else if (label === 'doctor') {
    const workspace = await requestJson(page, evidence, '/api/doctor/booking-engine/overview');
    organizationId = workspace.body?.organizationId ?? null;
    if (!workspace.ok || workspace.body?.organization?.id !== organizationId) {
      reasons.push('doctor_workspace_missing');
    }
  } else {
    const organization = await requestJson(page, evidence, '/api/patient/organization-context');
    organizationId = organization.body?.context?.ok
      ? organization.body.context.organizationId
      : null;
    if (!organization.ok || !organizationId) reasons.push('patient_organization_missing');
  }
  if (expectedOrganizationId && organizationId !== expectedOrganizationId) {
    reasons.push('organization_mismatch');
  }
  return {
    pass: reasons.length === 0,
    reasons,
    role: user?.role ?? null,
    user_id: user?.userId ?? null,
    organization_id: organizationId,
    exact_contact_matched: Boolean(contact),
  };
}

async function navigate(page, navigationState, target) {
  navigationState.active = true;
  const started = nowMs();
  try {
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const domcontentloadedMs = Math.round(nowMs() - started);
    const settled = await settlePage(page);
    return { response, domcontentloadedMs, ...settled };
  } finally {
    navigationState.active = false;
  }
}

async function semanticEvidence(page, selectors) {
  if (selectors.length > 0) {
    await Promise.any(
      selectors.map((selector) =>
        page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 }),
      ),
    ).catch(() => undefined);
  }
  const anchors = await Promise.all(
    selectors.map(async (selector) => {
      const locator = page.locator(selector);
      const count = await locator.count();
      return {
        name: selector,
        count,
        visible: count === 1 && (await locator.isVisible().catch(() => false)),
      };
    }),
  );
  return { mainCount: await page.locator('main').count(), anchors };
}

function selectorsForRoute(scenario, expectedUrl) {
  for (const [pattern, selectors] of Object.entries(scenario.routeEvidence ?? {})) {
    if (routePatternMatches(pattern, expectedUrl)) return selectors;
  }
  return [];
}

async function clickRequiredTabs(page, labels) {
  const proofs = [];
  for (const label of labels) {
    const tab = await firstVisible(page.getByRole('tab', { name: label, exact: true }));
    if (!tab) throw new Error(`required_tab_absent:${label}`);
    const started = nowMs();
    await tab.click();
    await tab.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction(
      (name) =>
        [...globalThis.document.querySelectorAll('[role="tab"]')].some(
          (element) =>
            element.textContent?.trim() === name &&
            element.getAttribute('aria-selected') === 'true',
        ),
      label,
      { timeout: 10_000 },
    );
    const panel = await firstVisible(page.getByRole('tabpanel'));
    const panelText = panel ? await panel.innerText().catch(() => '') : '';
    const characters = panelText.trim().length;
    proofs.push({
      label,
      pass: Boolean(panel) && characters > 0,
      selected: await tab.getAttribute('aria-selected'),
      panel_characters: characters,
      action_ms: Math.round(nowMs() - started),
    });
  }
  return proofs;
}

async function pageProof(page, navigationState, target, scenario, evidence) {
  const started = nowMs();
  const failuresBefore = evidence.failures.length;
  const consoleBefore = evidence.consoleErrors.length;
  const warningsBefore = evidence.consoleWarnings.length;
  const navigation = await navigate(page, navigationState, target);
  const body = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .trim();
  const expectedUrl = canonicalAuditUrl(target);
  const finalUrl = canonicalAuditUrl(page.url());
  const selectors = selectorsForRoute(scenario, expectedUrl);
  const semantics = await semanticEvidence(page, selectors);
  const horizontalOverflow = await page.evaluate(() => {
    const viewportWidth = globalThis.visualViewport?.width ?? document.documentElement.clientWidth;
    const tolerance = 1;
    const offenders = [];
    for (const node of document.body?.querySelectorAll('*') ?? []) {
      if (!(node instanceof HTMLElement)) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const overflowLeftPx = Math.max(0, -rect.left - tolerance);
      const overflowRightPx = Math.max(0, rect.right - viewportWidth - tolerance);
      if (overflowLeftPx <= 0 && overflowRightPx <= 0) continue;
      const className = typeof node.className === 'string' ? node.className : '';
      offenders.push({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        testId: node.getAttribute('data-testid'),
        classSnippet: className.length > 120 ? `${className.slice(0, 117)}…` : className,
        rect: { left: rect.left, right: rect.right, width: rect.width },
        overflowLeftPx,
        overflowRightPx,
      });
    }
    offenders.sort(
      (left, right) =>
        right.overflowLeftPx + right.overflowRightPx -
        (left.overflowLeftPx + left.overflowRightPx),
    );
    return {
      viewportWidth,
      documentScrollOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance,
      offenders: offenders.slice(0, 12),
    };
  });
  const allowedFinalTemplates = scenario.allowedFinalTemplates?.[expectedUrl] ?? [];
  const exactUrl = routeContractMatches(page.url(), target, allowedFinalTemplates);
  const visibleFatal = /(?:404|not found|internal server error|application error)/i.test(body);
  const requiredTabs = scenario.requiredTabs?.[expectedUrl] ?? [];
  let tabs = [];
  let tabFailure = null;
  try {
    tabs = await clickRequiredTabs(page, requiredTabs);
  } catch (error) {
    tabFailure = compactError(error);
  }
  const status = navigation.response?.status() ?? null;
  const observation = evaluatePageObservation({
    responseOk: Boolean(navigation.response?.ok()),
    urlOk: exactUrl,
    visibleFatal,
    ...semantics,
    failures: evidence.failures.slice(failuresBefore),
    consoleErrors: evidence.consoleErrors.slice(consoleBefore),
    consoleWarnings: evidence.consoleWarnings.slice(warningsBefore),
  });
  const pass = observation.pass && !tabFailure && tabs.every((tab) => tab.pass);
  return {
    url: expectedUrl,
    final_url: finalUrl,
    pass,
    substantive: pass,
    exact_url: exactUrl,
    ...(allowedFinalTemplates.length ? { intentional_redirect_templates: allowedFinalTemplates } : {}),
    semantic_evidence: semantics,
    horizontal_overflow: horizontalOverflow,
    failure_reasons: [...observation.reasons, ...(tabFailure ? ['required_tab_failure'] : [])],
    navigation_status: status,
    navigation_ms: Math.round(nowMs() - started),
    domcontentloaded_ms: navigation.domcontentloadedMs,
    settle_ms: navigation.settle_ms,
    network_idle: navigation.network_idle,
    tabs,
    ...(tabFailure ? { tab_failure: tabFailure } : {}),
  };
}

async function discoverUniqueTemplates(page, label, queuedTemplates) {
  const prefixes = {
    global_admin: ['/app/admin/organizations/'],
    doctor: [
      '/app/doctor/content/',
      '/app/doctor/courses/',
      '/app/doctor/treatment-program-templates/',
    ],
    patient: ['/app/patient/content/', '/app/patient/treatment/program/'],
  }[label];
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((anchors) =>
      anchors
        .map((anchor) => anchor.href)
        .filter((href) => href.startsWith(`${globalThis.location.origin}/app/`)),
    );
  const found = [];
  for (const href of hrefs) {
    const value = new URL(href);
    if (!prefixes.some((prefix) => value.pathname.startsWith(prefix))) continue;
    const key = routeTemplateKey(href);
    if (queuedTemplates.has(key)) continue;
    queuedTemplates.add(key);
    found.push(href);
  }
  return found;
}

function registrationPolicy(body) {
  return { tariffId: body?.registrationTariffPolicy?.tariffId ?? null };
}
function trialPolicy(body) {
  const value = body?.trialPolicy;
  return value
    ? {
        durationDays: value.durationDays,
        discountWindowDays: value.discountWindowDays,
        startEvent: value.startEvent,
        postTrialBehavior: value.postTrialBehavior,
        postTrialTariffId: value.postTrialTariffId,
        isActive: value.isActive,
      }
    : null;
}
function paidPolicy(body) {
  const value = body?.paidPeriodPolicy;
  return value
    ? {
        postPaidPeriodBehavior: value.postPaidPeriodBehavior,
        postPaidPeriodTariffId: value.postPaidPeriodTariffId,
        isActive: value.isActive,
      }
    : null;
}

async function waitForPost(page, pathname, action) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === pathname && response.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await action();
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  return { ok: response.ok(), status: response.status(), body };
}

async function waitForPatientReminderPatch(page, action) {
  const responsePromise = page.waitForResponse(
    (response) => {
      const pathname = new URL(response.url()).pathname;
      return (
        pathname.startsWith('/api/patient/reminders/') && response.request().method() === 'PATCH'
      );
    },
    { timeout: 20_000 },
  );
  await action();
  const response = await responsePromise;
  return { ok: response.ok(), status: response.status() };
}

async function openCommercialTrialTab(page, navigationState, reload = false) {
  if (reload) await navigate(page, navigationState, `${baseUrl}/app/admin/commercial`);
  const tab = page.getByRole('tab', { name: 'Триал', exact: true });
  await tab.click();
  await page.getByText('Стартовый тариф при регистрации', { exact: true }).waitFor({
    state: 'visible',
    timeout: 10_000,
  });
}

async function selectOptionInForm(page, form, label) {
  const trigger = await firstVisible(form.getByRole('combobox'));
  if (!trigger) throw new Error('select_trigger_absent');
  await trigger.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function commercialUiCycles(page, context, evidence, navigationState) {
  await navigate(page, navigationState, `${baseUrl}/app/admin/commercial`);
  await openCommercialTrialTab(page, navigationState);
  const read = () => requestJson(page, evidence, '/api/admin/commercial');
  const results = [];

  let registrationChanged;
  results.push(
    await runReversibleCycle({
      id: 'admin.registration-tariff-policy',
      read,
      change: async (initial) => {
        const original = registrationPolicy(initial.body);
        const active = (initial.body?.tariffs ?? []).filter((tariff) => tariff.isActive);
        registrationChanged = { tariffId: original.tariffId ? null : (active[0]?.id ?? null) };
        if (equalJson(original, registrationChanged))
          return { ok: false, error: 'no_alternate_tariff' };
        const form = page.locator('form').filter({ hasText: 'Стартовый тариф при регистрации' });
        const label = registrationChanged.tariffId
          ? active.find((tariff) => tariff.id === registrationChanged.tariffId)?.name
          : 'Не выдавать — человек выбирает тариф сам';
        if (!label) return { ok: false, error: 'alternate_tariff_label_absent' };
        await selectOptionInForm(page, form, label);
        const response = await waitForPost(page, '/api/admin/commercial', () =>
          form.getByRole('button', { name: 'Сохранить стартовый тариф', exact: true }).click(),
        );
        await openCommercialTrialTab(page, navigationState, true);
        return response;
      },
      restore: async (initial) => {
        const original = registrationPolicy(initial.body);
        const tariffs = initial.body?.tariffs ?? [];
        const form = page.locator('form').filter({ hasText: 'Стартовый тариф при регистрации' });
        const label = original.tariffId
          ? tariffs.find((tariff) => tariff.id === original.tariffId)?.name
          : 'Не выдавать — человек выбирает тариф сам';
        if (!label) return { ok: false, error: 'original_tariff_label_absent' };
        await selectOptionInForm(page, form, label);
        const response = await waitForPost(page, '/api/admin/commercial', () =>
          form.getByRole('button', { name: 'Сохранить стартовый тариф', exact: true }).click(),
        );
        await openCommercialTrialTab(page, navigationState, true);
        return response;
      },
      changedMatches: (_initial, changed) =>
        equalJson(registrationPolicy(changed.body), registrationChanged),
      restoredMatches: (initial, restored) =>
        equalJson(registrationPolicy(initial.body), registrationPolicy(restored.body)),
    }),
  );

  let trialChanged;
  results.push(
    await runReversibleCycle({
      id: 'admin.trial-policy',
      read,
      change: async (initial) => {
        const original = trialPolicy(initial.body);
        if (!original) return { ok: false, error: 'trial_policy_absent' };
        trialChanged = {
          ...original,
          durationDays: original.durationDays === 3650 ? 3649 : original.durationDays + 1,
        };
        const form = page.locator('form').filter({ hasText: 'Правило для новых организаций' });
        await form.locator('#trial-duration').fill(String(trialChanged.durationDays));
        const response = await waitForPost(page, '/api/admin/commercial', () =>
          form.getByRole('button', { name: 'Сохранить правило', exact: true }).click(),
        );
        await openCommercialTrialTab(page, navigationState, true);
        return response;
      },
      restore: async (initial) => {
        const original = trialPolicy(initial.body);
        const form = page.locator('form').filter({ hasText: 'Правило для новых организаций' });
        await form.locator('#trial-duration').fill(String(original.durationDays));
        const response = await waitForPost(page, '/api/admin/commercial', () =>
          form.getByRole('button', { name: 'Сохранить правило', exact: true }).click(),
        );
        await openCommercialTrialTab(page, navigationState, true);
        return response;
      },
      changedMatches: (_initial, changed) => equalJson(trialPolicy(changed.body), trialChanged),
      restoredMatches: (initial, restored) =>
        equalJson(trialPolicy(initial.body), trialPolicy(restored.body)),
    }),
  );

  let paidChanged;
  results.push(
    await runReversibleCycle({
      id: 'admin.paid-period-policy',
      read,
      change: async (initial) => {
        const original = paidPolicy(initial.body);
        if (!original) return { ok: false, error: 'paid_policy_absent' };
        paidChanged = { ...original, isActive: !original.isActive };
        const form = page
          .locator('form')
          .filter({ hasText: 'После завершения оплаченного периода' });
        await form.getByRole('checkbox', { name: 'Правило активно', exact: true }).click();
        const response = await waitForPost(page, '/api/admin/commercial', () =>
          form.getByRole('button', { name: 'Сохранить правило после оплаты', exact: true }).click(),
        );
        await openCommercialTrialTab(page, navigationState, true);
        return response;
      },
      restore: async () => {
        const form = page
          .locator('form')
          .filter({ hasText: 'После завершения оплаченного периода' });
        await form.getByRole('checkbox', { name: 'Правило активно', exact: true }).click();
        const response = await waitForPost(page, '/api/admin/commercial', () =>
          form.getByRole('button', { name: 'Сохранить правило после оплаты', exact: true }).click(),
        );
        await openCommercialTrialTab(page, navigationState, true);
        return response;
      },
      changedMatches: (_initial, changed) => equalJson(paidPolicy(changed.body), paidChanged),
      restoredMatches: (initial, restored) =>
        equalJson(paidPolicy(initial.body), paidPolicy(restored.body)),
    }),
  );
  return results;
}

function weeklySnapshot(body) {
  return (body?.rows ?? [])
    .filter((row) => row.isActive)
    .map((row) => ({
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      branchId: row.branchId ?? null,
      roomId: row.roomId ?? null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function minuteTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
async function selectDoctorTime(page, testId, value) {
  await page.getByTestId(testId).click();
  const listbox = page.getByRole('listbox', { name: 'Время', exact: true });
  await listbox.getByRole('option', { name: value, exact: true }).click();
}

async function doctorScheduleUiCycle(page, context, evidence, navigationState) {
  const read = () => requestJson(page, evidence, '/api/doctor/booking-engine/working-hours');
  let selected;
  let changedSnapshot;
  return runReversibleCycle({
    id: 'doctor.working-schedule',
    read,
    change: async (initial) => {
      const active = weeklySnapshot(initial.body);
      const candidates = active.filter(
        (row) =>
          active.filter((item) => item.weekday === row.weekday).length === 1 &&
          row.startMinute % 15 === 0 &&
          row.endMinute - row.startMinute > 15,
      );
      selected = candidates[0];
      if (!selected) return { ok: false, error: 'lossless_single_weekday_absent' };
      const changedStart = selected.startMinute + 15;
      changedSnapshot = active.map((row) =>
        row === selected ? { ...row, startMinute: changedStart } : row,
      );
      await navigate(page, navigationState, `${baseUrl}/app/doctor/schedule?tab=work`);
      await page.getByTestId(`weekday-header-${selected.weekday}`).click();
      await page.getByTestId('hours-panel').waitFor({ state: 'visible', timeout: 10_000 });
      await selectDoctorTime(page, 'panel-start', minuteTime(changedStart));
      return waitForPost(page, '/api/doctor/booking-engine/working-hours', () =>
        page.getByTestId('btn-save').click(),
      );
    },
    restore: async () => {
      await navigate(page, navigationState, `${baseUrl}/app/doctor/schedule?tab=work`);
      await page.getByTestId(`weekday-header-${selected.weekday}`).click();
      await page.getByTestId('hours-panel').waitFor({ state: 'visible', timeout: 10_000 });
      await selectDoctorTime(page, 'panel-start', minuteTime(selected.startMinute));
      return waitForPost(page, '/api/doctor/booking-engine/working-hours', () =>
        page.getByTestId('btn-save').click(),
      );
    },
    changedMatches: (_initial, changed) => equalJson(weeklySnapshot(changed.body), changedSnapshot),
    restoredMatches: (initial, restored) =>
      equalJson(weeklySnapshot(initial.body), weeklySnapshot(restored.body)),
  });
}

function availabilitySnapshot(body) {
  const branches = (body?.branches ?? []).filter((row) => row.isActive);
  const services = (body?.services ?? []).filter((row) => row.isActive);
  const specialist =
    (body?.specialists ?? []).find((row) => row.isActive) ?? body?.specialists?.[0] ?? null;
  return services.flatMap((service) =>
    branches.map((branch) => ({
      label: `${service.title} — ${branch.title}`,
      serviceId: service.id,
      branchId: branch.id,
      enabled: Boolean(
        (body?.locationAvailability ?? []).some(
          (row) => row.serviceId === service.id && row.branchId === branch.id && row.isActive,
        ) ||
        (body?.specialistAvailability ?? []).some(
          (row) =>
            row.specialistId === specialist?.id &&
            row.serviceId === service.id &&
            row.branchId === branch.id &&
            row.isActive,
        ),
      ),
    })),
  );
}

async function doctorAvailabilityUiCycle(page, context, evidence, navigationState) {
  const read = () => requestJson(page, evidence, '/api/admin/booking-engine/overview');
  let selected;
  let changedSnapshot;
  return runReversibleCycle({
    id: 'doctor.service-location-availability',
    read,
    change: async (initial) => {
      const snapshot = availabilitySnapshot(initial.body);
      selected = snapshot[0];
      if (!selected) return { ok: false, error: 'availability_matrix_empty' };
      changedSnapshot = snapshot.map((item) =>
        item.serviceId === selected.serviceId && item.branchId === selected.branchId
          ? { ...item, enabled: !item.enabled }
          : item,
      );
      await navigate(
        page,
        navigationState,
        `${baseUrl}/app/doctor/schedule?tab=setup&section=locations`,
      );
      const toggle = page.getByRole('switch', { name: selected.label, exact: true });
      return waitForPost(page, '/api/admin/booking-engine/availability', () => toggle.click());
    },
    restore: async () => {
      await navigate(
        page,
        navigationState,
        `${baseUrl}/app/doctor/schedule?tab=setup&section=locations`,
      );
      return waitForPost(page, '/api/admin/booking-engine/availability', () =>
        page.getByRole('switch', { name: selected.label, exact: true }).click(),
      );
    },
    changedMatches: (_initial, changed) =>
      equalJson(availabilitySnapshot(changed.body), changedSnapshot),
    restoredMatches: (initial, restored) =>
      equalJson(availabilitySnapshot(initial.body), availabilitySnapshot(restored.body)),
  });
}

async function resolveActualPatient(page, evidence) {
  const response = await requestJson(
    page,
    evidence,
    `/api/doctor/clients/search?q=${encodeURIComponent(patientPhone)}&limit=10`,
  );
  const exact = (response.body?.clients ?? []).filter(
    (client) => client.phone === patientPhone && client.displayName === patientName,
  );
  if (!response.ok || exact.length !== 1)
    throw new Error(`actual_patient_match_count:${exact.length}`);
  return exact[0];
}

async function doctorPatientCardTabs(page, navigationState, patient) {
  const results = [];
  for (const [tabId, label] of DOCTOR_PATIENT_CARD_TABS) {
    const target = `${baseUrl}/app/doctor/patients/${patient.id}?tab=${tabId}`;
    const navigation = await navigate(page, navigationState, target);
    const button = page.getByRole('button', { name: label, exact: true });
    const activeClass = (await button.getAttribute('class')) ?? '';
    const card = page.locator(`[id="doctor-patient-card-header"]`);
    const body = (
      await page
        .locator('main')
        .innerText()
        .catch(() => '')
    ).trim();
    const programRoute = `/app/doctor/patients/:uuid/programs/:uuid`;
    const urlOk = routeContractMatches(page.url(), target, tabId === 'program' ? [programRoute] : []);
    const programRedirected = tabId === 'program' && canonicalAuditUrl(page.url()) === programRoute;
    const substantiveSurface = programRedirected
      ? await page.locator('#doctor-program-instance-summary').isVisible().catch(() => false)
      : (await card.isVisible().catch(() => false)) && activeClass.includes('bg-primary/15');
    const pass =
      Boolean(navigation.response?.ok()) && urlOk && substantiveSurface && body.length > 20;
    results.push({
      url: canonicalAuditUrl(target),
      final_url: canonicalAuditUrl(page.url()),
      pass,
      substantive: pass,
      exact_url: urlOk,
      ...(tabId === 'program' ? { intentional_redirect_templates: [programRoute] } : {}),
      main_marker: { pass: true, marker: `Карточка пациента / ${label}` },
      navigation_status: navigation.response?.status() ?? null,
      characters: body.length,
      navigation_ms: navigation.domcontentloadedMs + navigation.settle_ms,
      domcontentloaded_ms: navigation.domcontentloadedMs,
      settle_ms: navigation.settle_ms,
      network_idle: navigation.network_idle,
      patient_card_tab: tabId,
    });
  }
  return results;
}

async function doctorCommentsAndPaymentControls(page, navigationState, patient, runPayment) {
  const results = [];
  let started = nowMs();
  try {
    await navigate(page, navigationState, `${baseUrl}/app/doctor/communications?tab=comments`);
    const tab = page.getByTestId('btn-comments');
    if ((await tab.count()) !== 1) throw new Error(`comments_tab_count:${await tab.count()}`);
    if ((await tab.getAttribute('aria-current')) !== 'page') await tab.click();
    const comments = page.locator('#doctor-communications-comments');
    if ((await comments.count()) !== 1) throw new Error(`comments_surface_count:${await comments.count()}`);
    await comments.waitFor({ state: 'visible', timeout: 15_000 });
    const patientRows = comments.getByText(listRowNamePattern(patientName));
    await patientRows.first().waitFor({ state: 'visible', timeout: 15_000 });
    if ((await patientRows.count()) !== 1)
      throw new Error(`comments_patient_match_count:${await patientRows.count()}`);
    results.push({
      id: 'doctor.comments-patient-list',
      pass: true,
      duration_ms: Math.round(nowMs() - started),
    });
  } catch (error) {
    results.push({
      id: 'doctor.comments-patient-list',
      pass: false,
      failure: compactError(error),
      // A Playwright timeout only says the locator never matched; it never says what the list
      // actually held. Without the rendered list the artifact cannot distinguish a missing
      // patient from a locator that no longer matches the rendered row.
      observed_patient_list: await observedSurfaceText(page, '#doctor-communications-comments'),
      duration_ms: Math.round(nowMs() - started),
    });
  }
  started = nowMs();
  try {
    await navigate(
      page,
      navigationState,
      `${baseUrl}/app/doctor/patients/${patient.id}?tab=finances`,
    );
    const amount = page.locator('#acq-amount');
    const submit = page.getByRole('button', { name: 'Создать ссылку на оплату', exact: true });
    await amount.fill('1');
    if (!runPayment) {
      results.push({
        id: 'doctor.payment-link-control',
        pass: await submit.isEnabled(),
        mutation: 'not_run',
        duration_ms: Math.round(nowMs() - started),
      });
    } else {
      const response = await waitForPost(
        page,
        `/api/doctor/patients/${patient.id}/acquiring-charge`,
        () => submit.click(),
      );
      const visible = await page
        .getByText('Ссылка на оплату создана', { exact: true })
        .isVisible()
        .catch(() => false);
      results.push({
        id: 'doctor.payment-link-control',
        pass: response.ok && visible,
        status: response.status,
        failure_reason: response.body?.reason ?? response.body?.error ?? null,
        retained_dev_payment_attempt: response.ok,
        duration_ms: Math.round(nowMs() - started),
      });
    }
  } catch (error) {
    results.push({
      id: 'doctor.payment-link-control',
      pass: false,
      failure: compactError(error),
      duration_ms: Math.round(nowMs() - started),
    });
  }
  return results;
}

function minuteValue(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
async function reminderTimeControl(dialog) {
  const controls = dialog.locator('input[type="time"]');
  const control = await firstVisible(controls);
  if (!control) throw new Error('time_control_absent');
  const values = await controls.evaluateAll((inputs) => inputs.map((input) => input.value));
  const original = await control.inputValue();
  const minute = minuteValue(original);
  if (minute === null) throw new Error('time_control_unreadable');
  const alternate = [minute + 1, minute - 1]
    .filter((value) => value >= 0 && value < 1440)
    .map(minuteTime)
    .find((value) => !values.includes(value));
  if (!alternate) throw new Error('safe_alternate_time_absent');
  return { control, original, alternate };
}

async function patientReminderSectionCycle(
  page,
  navigationState,
  sectionSelector,
  toggleName,
  idPrefix,
) {
  const started = nowMs();
  const target = `${baseUrl}/app/patient/reminders`;
  await navigate(page, navigationState, target);
  let section = page.locator(sectionSelector);
  let toggle = section.getByRole('switch', { name: toggleName, exact: true });
  const original = await toggle.getAttribute('aria-checked');
  const expected = original === 'true' ? 'false' : 'true';
  let changed = null;
  let restored = null;
  let failure = null;
  try {
    const changedResponse = await waitForPatientReminderPatch(page, () => toggle.click());
    if (!changedResponse.ok) failure = `change_rejected:${changedResponse.status}`;
    await navigate(page, navigationState, target);
    section = page.locator(sectionSelector);
    toggle = section.getByRole('switch', { name: toggleName, exact: true });
    changed = await toggle.getAttribute('aria-checked');
    if (changed !== expected) failure = 'changed_readback_mismatch';
  } catch (error) {
    failure = `exception:${compactError(error)}`;
  } finally {
    try {
      await navigate(page, navigationState, target);
      section = page.locator(sectionSelector);
      toggle = section.getByRole('switch', { name: toggleName, exact: true });
      if ((await toggle.getAttribute('aria-checked')) === expected) {
        const restoreResponse = await waitForPatientReminderPatch(page, () => toggle.click());
        if (!restoreResponse.ok) failure ??= `restore_rejected:${restoreResponse.status}`;
      }
      await navigate(page, navigationState, target);
      restored = await page
        .locator(sectionSelector)
        .getByRole('switch', { name: toggleName, exact: true })
        .getAttribute('aria-checked');
      if (restored !== original) failure ??= 'restore_readback_mismatch';
    } catch (error) {
      failure ??= `restore_exception:${compactError(error)}`;
    }
  }
  return {
    id: `${idPrefix}-enabled`,
    pass: failure === null && changed === expected && restored === original,
    ...(failure ? { failure } : {}),
    values: [original, changed, restored],
    duration_ms: Math.round(nowMs() - started),
  };
}

async function patientReminderTimeCycle(page, navigationState, sectionSelector, idPrefix) {
  const started = nowMs();
  const target = `${baseUrl}/app/patient/reminders`;
  let original;
  let changed;
  let changedReadback = null;
  let restoredReadback = null;
  let changedSaved = false;
  let failure = null;
  try {
    await navigate(page, navigationState, target);
    let section = page.locator(sectionSelector);
    await section.getByRole('button', { name: /^(Изменить|Изменить расписание)$/ }).click();
    let dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const time = await reminderTimeControl(dialog);
    original = time.original;
    changed = time.alternate;
    await time.control.fill(changed);
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
    changedSaved = true;
    await navigate(page, navigationState, target);
    section = page.locator(sectionSelector);
    await section.getByRole('button', { name: /^(Изменить|Изменить расписание)$/ }).click();
    dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    changedReadback = (await reminderTimeControl(dialog)).original;
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    if (changedReadback !== changed) failure = 'changed_readback_mismatch';
  } catch (error) {
    failure = `exception:${compactError(error)}`;
  } finally {
    if (changedSaved && original) {
      try {
        await navigate(page, navigationState, target);
        let section = page.locator(sectionSelector);
        await section.getByRole('button', { name: /^(Изменить|Изменить расписание)$/ }).click();
        let dialog = page.getByRole('dialog').first();
        await dialog.waitFor({ state: 'visible', timeout: 10_000 });
        const time = await reminderTimeControl(dialog);
        await time.control.fill(original);
        await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
        await navigate(page, navigationState, target);
        section = page.locator(sectionSelector);
        await section.getByRole('button', { name: /^(Изменить|Изменить расписание)$/ }).click();
        dialog = page.getByRole('dialog').first();
        restoredReadback = (await reminderTimeControl(dialog)).original;
        await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
        if (restoredReadback !== original) failure ??= 'restore_readback_mismatch';
      } catch (error) {
        failure ??= `restore_exception:${compactError(error)}`;
      }
    }
  }
  return {
    id: `${idPrefix}-time`,
    pass: failure === null && changedReadback === changed && restoredReadback === original,
    ...(failure ? { failure } : {}),
    values: [original, changedReadback, restoredReadback],
    duration_ms: Math.round(nowMs() - started),
  };
}

async function patientWarmupFromHome(page, navigationState) {
  const started = nowMs();
  try {
    await navigate(page, navigationState, `${baseUrl}/app/patient`);
    const cta = page.getByRole('link', { name: 'Начать разминку', exact: true });
    await cta.click();
    await page.waitForURL((url) => url.pathname.startsWith('/app/patient/content/'), {
      timeout: 20_000,
    });
    await settlePage(page);
    const semantics = await semanticEvidence(page, ['article[id^="patient-content-article-"]']);
    const observation = evaluatePageObservation({
      responseOk: true,
      urlOk: canonicalAuditUrl(page.url()).startsWith('/app/patient/content/'),
      visibleFatal: false,
      ...semantics,
    });
    return {
      id: 'patient.daily-warmup-home-cta',
      pass: observation.pass,
      final_url: canonicalAuditUrl(page.url()),
      semantic_evidence: semantics,
      failure_reasons: observation.reasons,
      duration_ms: Math.round(nowMs() - started),
    };
  } catch (error) {
    return {
      id: 'patient.daily-warmup-home-cta',
      pass: false,
      failure: compactError(error),
      duration_ms: Math.round(nowMs() - started),
    };
  }
}

async function patientPhoneSurface(page, navigationState) {
  const started = nowMs();
  try {
    await navigate(page, navigationState, `${baseUrl}/app/patient/profile`);
    const phoneLabel = page.getByText('Телефон', { exact: true });
    if ((await phoneLabel.count()) !== 1) throw new Error(`phone_label_count:${await phoneLabel.count()}`);
    const phoneRow = phoneLabel.locator('xpath=..');
    const phoneAction = phoneRow.getByRole('button', { name: /^(Изменить|Привязать)$/ });
    if ((await phoneAction.count()) !== 1)
      throw new Error(`phone_action_count:${await phoneAction.count()}`);
    await phoneAction.click();
    await page.waitForURL((url) => url.pathname === '/app/patient/bind-phone', { timeout: 15_000 });
    const surface = await firstVisible(
      page.locator(
        '#phone-messenger-auth-phone, #patient-bind-phone-messenger-unified, #patient-bind-phone-browser',
      ),
    );
    return {
      id: 'patient.phone-change-flow',
      pass: Boolean(surface),
      safe_boundary: 'bind_phone_surface_opened_no_contact_submitted',
      duration_ms: Math.round(nowMs() - started),
    };
  } catch (error) {
    return {
      id: 'patient.phone-change-flow',
      pass: false,
      failure: compactError(error),
      duration_ms: Math.round(nowMs() - started),
    };
  }
}

async function patientChatSend(page, navigationState) {
  const started = nowMs();
  const auditText = `[DEV AUDIT ${new Date().toISOString()}] technical control pass`;
  try {
    await navigate(page, navigationState, `${baseUrl}/app/patient/messages`);
    const composer = page.getByRole('textbox', { name: 'Текст сообщения', exact: true });
    await composer.fill(auditText);
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await page.getByText(auditText, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    return {
      id: 'patient.chat-send',
      pass: true,
      retained_dev_audit_message: true,
      duration_ms: Math.round(nowMs() - started),
    };
  } catch (error) {
    return {
      id: 'patient.chat-send',
      pass: false,
      failure: compactError(error),
      duration_ms: Math.round(nowMs() - started),
    };
  }
}

async function auditRole(label, scenario, expectedOrganizationId) {
  // A fresh Chromium process and context per role prevents cookies, storage,
  // service workers and request state from crossing role boundaries.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const evidence = {
    failures: [],
    consoleErrors: [],
    consoleWarnings: [],
    network: [],
    api: [],
    ignoredHarnessAborts: 0,
  };
  const navigationState = { active: false };
  attachEvidence(page, evidence, navigationState);
  try {
    const authentication = await authenticate(context, page, label, scenario);
    // The role gate starts after successful authentication. Discard aborted
    // prefetches and public-auth bootstrap traffic from the temporary `/app`
    // origin page used only to establish the real browser session.
    evidence.failures.length = 0;
    evidence.consoleErrors.length = 0;
    evidence.consoleWarnings.length = 0;
    evidence.network.length = 0;
    evidence.api.length = 0;
    evidence.ignoredHarnessAborts = 0;
    const identityAssertion = await assertIdentity(
      page,
      evidence,
      label,
      scenario,
      expectedOrganizationId,
    );
    console.error(
      JSON.stringify({ event: 'dev_audit_identity', role: label, pass: identityAssertion.pass }),
    );
    const queue = skipRoutes ? [] : scenario.routes.map((route) => new URL(route, baseUrl).href);
    const queuedTemplates = new Set(queue.map((route) => routeTemplateKey(route)));
    const pages = [];
    while (queue.length > 0 && pages.length < 55 && !stopRequested) {
      const target = queue.shift();
      try {
        const cold = await pageProof(page, navigationState, target, scenario, evidence);
        const discovered = await discoverUniqueTemplates(page, label, queuedTemplates);
        queue.push(...discovered);
        const warm = await pageProof(page, navigationState, target, scenario, evidence);
        pages.push({
          ...cold,
          pass: cold.pass && warm.pass,
          substantive: cold.pass && warm.pass,
          warm_navigation_ms: warm.navigation_ms,
          warm_pass: warm.pass,
        });
      } catch (error) {
        pages.push({
          url: canonicalAuditUrl(target),
          final_url: canonicalAuditUrl(page.url()),
          pass: false,
          substantive: false,
          error: compactError(error),
        });
      }
      console.error(
        JSON.stringify({
          event: 'dev_audit_page',
          role: label,
          index: pages.length,
          remaining: queue.length,
          url: pages.at(-1)?.url ?? canonicalAuditUrl(target),
          pass: pages.at(-1)?.pass ?? false,
        }),
      );
    }

    const actionChecks = [];
    if (!stopRequested && label === 'global_admin' && mutationsEnabled) {
      actionChecks.push(...(await commercialUiCycles(page, context, evidence, navigationState)));
    }
    if (!stopRequested && label === 'doctor') {
      const patient = await resolveActualPatient(page, evidence);
      pages.push(...(await doctorPatientCardTabs(page, navigationState, patient)));
      actionChecks.push(
        ...(await doctorCommentsAndPaymentControls(
          page,
          navigationState,
          patient,
          mutationsEnabled,
        )),
      );
      if (mutationsEnabled) {
        actionChecks.push(await doctorScheduleUiCycle(page, context, evidence, navigationState));
        actionChecks.push(
          await doctorAvailabilityUiCycle(page, context, evidence, navigationState),
        );
      }
    }
    if (!stopRequested && label === 'patient') {
      actionChecks.push(await patientWarmupFromHome(page, navigationState));
      actionChecks.push(await patientPhoneSurface(page, navigationState));
      if (mutationsEnabled) {
        actionChecks.push(
          await patientReminderSectionCycle(
            page,
            navigationState,
            '#patient-reminders-rehab',
            'Включить напоминание программы',
            'patient.program-reminder',
          ),
        );
        actionChecks.push(
          await patientReminderTimeCycle(
            page,
            navigationState,
            '#patient-reminders-rehab',
            'patient.program-reminder',
          ),
        );
        const warmupSection = page.locator('#patient-reminders-warmups');
        await navigate(page, navigationState, `${baseUrl}/app/patient/reminders`);
        const warmupToggle = await firstVisible(warmupSection.getByRole('switch'));
        const warmupLabel = await warmupToggle?.getAttribute('aria-label');
        if (!warmupLabel) {
          actionChecks.push({
            id: 'patient.warmup-reminder-enabled',
            pass: false,
            failure: 'warmup_toggle_absent',
          });
          actionChecks.push({
            id: 'patient.warmup-reminder-time',
            pass: false,
            failure: 'warmup_schedule_absent',
          });
        } else {
          actionChecks.push(
            await patientReminderSectionCycle(
              page,
              navigationState,
              '#patient-reminders-warmups',
              warmupLabel,
              'patient.warmup-reminder',
            ),
          );
          actionChecks.push(
            await patientReminderTimeCycle(
              page,
              navigationState,
              '#patient-reminders-warmups',
              'patient.warmup-reminder',
            ),
          );
        }
        actionChecks.push(await patientChatSend(page, navigationState));
      }
    }
    return {
      role: label,
      complete: !stopRequested && queue.length === 0,
      authentication,
      authenticated: identityAssertion.pass,
      identity_assertion: identityAssertion,
      pages,
      latency: {
        cold: stats(pages.map((item) => item.navigation_ms).filter(Number.isFinite)),
        warm: stats(pages.map((item) => item.warm_navigation_ms).filter(Number.isFinite)),
        actions: stats(actionChecks.map((item) => item.duration_ms).filter(Number.isFinite)),
      },
      action_checks: actionChecks,
      api_responses: evidence.api,
      failures: evidence.failures,
      console_errors: evidence.consoleErrors,
      console_warnings: evidence.consoleWarnings,
      network_failures: evidence.network,
      ignored_harness_aborts: evidence.ignoredHarnessAborts,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];
  let expectedOrganizationId = configuredOrganizationId;
  for (const label of requestedRoles) {
    const scenario = ROLE_SCENARIOS[label];
    try {
      const result = await auditRole(label, scenario, expectedOrganizationId);
      results.push(result);
      if (label === 'doctor' && !expectedOrganizationId && result.identity_assertion?.pass) {
        expectedOrganizationId = result.identity_assertion.organization_id;
      }
    } catch (error) {
      results.push({
        role: label,
        complete: false,
        authenticated: false,
        identity_assertion: { pass: false, reasons: ['fatal_role_error'] },
        fatal_error: compactError(error),
        pages: [],
        action_checks: [],
        failures: [],
        console_errors: [],
      });
    }
  }
  const aggregateResults = [...results];
  for (const artifactPath of aggregateArtifacts) {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    if (!Array.isArray(artifact.results)) throw new Error(`aggregate artifact has no results: ${artifactPath}`);
    aggregateResults.push(...artifact.results);
  }
  // Latest local result wins for a restarted role; missing role artifacts remain a hard failure.
  const byRole = new Map();
  for (const result of aggregateResults) byRole.set(result.role, result);
  const gate = summarizeBinaryGate([...byRole.values()], requiredRoles);
  const finishedAt = new Date().toISOString();
  const report = {
    started_at: startedAt,
    finished_at: finishedAt,
    base_url: baseUrl,
    mutations_enabled: mutationsEnabled,
    requested_roles: requestedRoles,
    aggregate_artifacts: aggregateArtifacts,
    expected_organization_id: expectedOrganizationId,
    binary_gate: gate,
    control_adapter_matrix: CONTROL_ADAPTER_MATRIX,
    results,
  };
  const suffix = startedAt.replace(/[:.]/g, '-');
  const artifact = `${outDir}/result-${suffix}.json`;
  writeFileSync(artifact, JSON.stringify(report, null, 2));
  const lines = [
    `# DEV binary interactive audit — ${startedAt}`,
    '',
    `Binary gate: **${gate.pass ? 'PASS' : 'FAIL'}**`,
    '',
    '| Role | Identity | Pages | Clean pages | HTTP/request failures | Console errors | Actions | cold p50/p95 | warm p50/p95 |',
    '|---|---|---:|---:|---:|---:|---:|---|---|',
    ...results.map((result) => {
      const pages = result.pages ?? [];
      const actions = result.action_checks ?? [];
      return `| ${result.role} | ${result.identity_assertion?.pass ? 'exact' : 'FAIL'} | ${pages.length} | ${pages.filter((page) => page.pass).length} | ${(result.failures ?? []).length} | ${(result.console_errors ?? []).length} | ${actions.filter((item) => item.pass).length}/${actions.length} | ${result.latency?.cold?.median_ms ?? '-'}/${result.latency?.cold?.p95_ms ?? '-'} | ${result.latency?.warm?.median_ms ?? '-'}/${result.latency?.warm?.p95_ms ?? '-'} |`;
    }),
    '',
    '## Violations',
    '',
    ...(gate.violations.length ? gate.violations.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Action checks',
    '',
    ...results.flatMap((result) =>
      (result.action_checks ?? []).map((action) => `- ${result.role}: ${JSON.stringify(action)}`),
    ),
  ];
  writeFileSync(`${outDir}/report-${suffix}.md`, `${lines.join('\n')}\n`);
  console.log(
    JSON.stringify(
      {
        artifact,
        binary_gate: gate,
        roles: results.map((result) => ({
          role: result.role,
          identity: result.identity_assertion?.pass ?? false,
          pages: result.pages?.length ?? 0,
          clean_pages: result.pages?.filter((page) => page.pass).length ?? 0,
          failures: result.failures?.length ?? 0,
          console_errors: result.console_errors?.length ?? 0,
          actions: (result.action_checks ?? []).map((action) => ({
            id: action.id,
            pass: action.pass,
          })),
        })),
      },
      null,
      2,
    ),
  );
  if (!gate.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
