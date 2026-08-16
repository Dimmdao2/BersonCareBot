#!/usr/bin/env node
/**
 * Binary live gate for the already-running canonical DEV server. It neither
 * starts services nor changes schema/grants. Mutation adapters are opt-in.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../clickthrough/lib/browser.mjs';
import { CONTROL_ADAPTER_MATRIX, DOCTOR_PATIENT_CARD_TABS, ROLE_SCENARIOS } from './scenarios.mjs';
import {
  canonicalAuditUrl,
  exactUrlMatches,
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
const configuredOrganizationId = process.env.DEV_AUDIT_ORGANIZATION_ID || null;
const patientName = process.env.DEV_AUDIT_PATIENT_NAME || 'Берсон Дмитрий';
const patientPhone = '+79189000782';
const base = new URL(baseUrl);
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.port !== '5200') {
  throw new Error('DEV_AUDIT_BASE_URL must be the canonical http://127.0.0.1:5200 DEV listener');
}

const nowMs = () => performance.now();
const compactError = (error) =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 300);
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

async function authenticate(context, label, scenario) {
  const cookieValue = scenario.sessionCookieEnv ? process.env[scenario.sessionCookieEnv] : null;
  if (cookieValue) {
    await context.addCookies([
      { name: 'bersoncare_webapp_session', value: cookieValue, url: baseUrl, httpOnly: true },
    ]);
    return { kind: 'actual_session_cookie' };
  }
  const email = process.env[scenario.emailEnv] || scenario.defaultEmail;
  if (email && password) {
    const response = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
      headers: { Origin: baseUrl },
      data: { email, password },
    });
    const body = await response.json().catch(() => null);
    if (response.status() !== 200 || body?.ok !== true || body?.factorRequired === true) {
      throw new Error(
        `actual_${label}_login_failed:${response.status()}:${body?.error ?? 'unknown'}`,
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

async function requestJson(context, evidence, pathname, options = {}) {
  const started = nowMs();
  const response = await context.request.fetch(`${baseUrl}${pathname}`, {
    headers: { Origin: baseUrl, ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  const item = {
    method: options.method || 'GET',
    status: response.status(),
    url: canonicalAuditUrl(pathname),
    resource: 'audit-action',
    duration_ms: Math.round(nowMs() - started),
  };
  evidence.api.push(item);
  if (response.status() >= 400) {
    evidence.failures.push({ kind: 'action_http', ...item });
    evidence.network.push({ kind: 'action_http', ...item });
  }
  return { ok: response.ok(), status: response.status(), body, duration_ms: item.duration_ms };
}

async function assertIdentity(context, evidence, label, scenario, expectedOrganizationId) {
  const me = await requestJson(context, evidence, '/api/me');
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
    if (me.body?.platformAccess?.tier !== 'global_admin') reasons.push('global_admin_tier_missing');
  } else if (label === 'doctor') {
    const workspace = await requestJson(context, evidence, '/api/doctor/booking-engine/overview');
    organizationId = workspace.body?.organizationId ?? null;
    if (!workspace.ok || workspace.body?.organization?.id !== organizationId) {
      reasons.push('doctor_workspace_missing');
    }
  } else {
    const organization = await requestJson(context, evidence, '/api/patient/organization-context');
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
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const domcontentloadedMs = Math.round(nowMs() - started);
    const settled = await settlePage(page);
    return { response, domcontentloadedMs, ...settled };
  } finally {
    navigationState.active = false;
  }
}

async function visibleMainMarker(page, exactMarker) {
  const main = await firstVisible(page.locator('main'));
  if (!main) return { pass: false, marker: null, reason: 'main_absent' };
  if (exactMarker) {
    const exact = await firstVisible(main.getByText(exactMarker, { exact: true }));
    return exact
      ? { pass: true, marker: exactMarker }
      : { pass: false, marker: exactMarker, reason: 'exact_marker_absent' };
  }
  const heading = await firstVisible(main.getByRole('heading'));
  const marker = (await heading?.innerText().catch(() => ''))?.replace(/\s+/g, ' ').trim();
  return marker
    ? { pass: true, marker }
    : { pass: false, marker: null, reason: 'unique_main_heading_absent' };
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

async function pageProof(page, navigationState, target, scenario) {
  const started = nowMs();
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
  const marker = await visibleMainMarker(page, scenario.routeMarkers?.[expectedUrl]);
  const allowedFinalPrefix = scenario.allowedFinalPrefixes?.[expectedUrl] ?? null;
  const exactUrl =
    exactUrlMatches(page.url(), target) ||
    (allowedFinalPrefix !== null && finalUrl.startsWith(allowedFinalPrefix));
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
  const pass =
    Boolean(navigation.response?.ok()) &&
    exactUrl &&
    marker.pass &&
    !visibleFatal &&
    body.length >= 20 &&
    !tabFailure &&
    tabs.every((tab) => tab.pass);
  return {
    url: expectedUrl,
    final_url: finalUrl,
    pass,
    substantive: pass,
    exact_url: exactUrl,
    ...(allowedFinalPrefix ? { intentional_redirect_prefix: allowedFinalPrefix } : {}),
    main_marker: marker,
    navigation_status: status,
    characters: body.length,
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
  return { ok: response.ok(), status: response.status() };
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
  const read = () => requestJson(context, evidence, '/api/admin/commercial');
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
  const read = () => requestJson(context, evidence, '/api/doctor/booking-engine/working-hours');
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
  const read = () => requestJson(context, evidence, '/api/admin/booking-engine/overview');
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

async function resolveActualPatient(context, evidence) {
  const response = await requestJson(
    context,
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
    results.push({
      url: canonicalAuditUrl(target),
      final_url: canonicalAuditUrl(page.url()),
      pass:
        Boolean(navigation.response?.ok()) &&
        exactUrlMatches(page.url(), target) &&
        (await card.isVisible().catch(() => false)) &&
        activeClass.includes('bg-primary/15') &&
        body.length > 20,
      substantive:
        Boolean(navigation.response?.ok()) &&
        exactUrlMatches(page.url(), target) &&
        (await card.isVisible().catch(() => false)) &&
        activeClass.includes('bg-primary/15') &&
        body.length > 20,
      exact_url: exactUrlMatches(page.url(), target),
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
    const tab = page.getByRole('tab', { name: 'Комментарии', exact: true });
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await page
      .locator('#doctor-communications-comments')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await page
      .getByText(patientName, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
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
    const main = await visibleMainMarker(page, null);
    return {
      id: 'patient.daily-warmup-home-cta',
      pass: main.pass && canonicalAuditUrl(page.url()).startsWith('/app/patient/content/'),
      final_url: canonicalAuditUrl(page.url()),
      main_marker: main,
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
    const section = page
      .locator('section')
      .filter({ has: page.getByText('Телефон', { exact: true }) })
      .first();
    await section.getByRole('button', { name: /^(Изменить|Привязать)$/ }).click();
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
    const authentication = await authenticate(context, label, scenario);
    const identityAssertion = await assertIdentity(
      context,
      evidence,
      label,
      scenario,
      expectedOrganizationId,
    );
    const queue = scenario.routes.map((route) => new URL(route, baseUrl).href);
    const queuedTemplates = new Set(queue.map((route) => routeTemplateKey(route)));
    const pages = [];
    while (queue.length > 0 && pages.length < 55) {
      const target = queue.shift();
      try {
        const cold = await pageProof(page, navigationState, target, scenario);
        const discovered = await discoverUniqueTemplates(page, label, queuedTemplates);
        queue.push(...discovered);
        const warm = await pageProof(page, navigationState, target, scenario);
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
    }

    const actionChecks = [];
    if (label === 'global_admin' && mutationsEnabled) {
      actionChecks.push(...(await commercialUiCycles(page, context, evidence, navigationState)));
    }
    if (label === 'doctor') {
      const patient = await resolveActualPatient(context, evidence);
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
    if (label === 'patient') {
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
    await context.close();
    await browser.close();
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];
  let expectedOrganizationId = configuredOrganizationId;
  for (const [label, scenario] of Object.entries(ROLE_SCENARIOS)) {
    try {
      const result = await auditRole(label, scenario, expectedOrganizationId);
      results.push(result);
      if (label === 'doctor' && !expectedOrganizationId && result.identity_assertion?.pass) {
        expectedOrganizationId = result.identity_assertion.organization_id;
      }
    } catch (error) {
      results.push({
        role: label,
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
  const gate = summarizeBinaryGate(results);
  const finishedAt = new Date().toISOString();
  const report = {
    started_at: startedAt,
    finished_at: finishedAt,
    base_url: baseUrl,
    mutations_enabled: mutationsEnabled,
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
