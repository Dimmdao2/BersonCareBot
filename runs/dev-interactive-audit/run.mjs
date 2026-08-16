#!/usr/bin/env node
/**
 * Bounded live DEV audit.  Uses the supported dev-bypass rather than fixtures or DB access.
 * Artifacts are deliberately redacted: URLs are reduced to pathname and no response body,
 * cookie, identifier, or form value is written.
 *
 * Usage: node runs/dev-interactive-audit/run.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../clickthrough/lib/browser.mjs';
import { ROLE_SCENARIOS, REVERSIBLE_ADAPTER_MATRIX } from './scenarios.mjs';

const baseUrl = process.env.DEV_AUDIT_BASE_URL || 'http://127.0.0.1:5200';
const outDir = 'runs/dev-interactive-audit/out';
const password = process.env.DEV_AUDIT_PASSWORD || '';
const allowSynthetic = process.env.DEV_AUDIT_ALLOW_SYNTHETIC === '1';
const mutationsEnabled = process.env.DEV_AUDIT_MUTATE === '1';
const sameOrigin = (url) => { try { return new URL(url).origin === new URL(baseUrl).origin; } catch { return false; } };
const redactUrl = (url) => { try { return new URL(url).pathname; } catch { return '<invalid-url>'; } };
const quantile = (numbers, q) => numbers.length ? numbers[Math.min(numbers.length - 1, Math.ceil(numbers.length * q) - 1)] : null;
const stats = (numbers) => {
  const n = [...numbers].sort((a, b) => a - b);
  return { count: n.length, median_ms: quantile(n, .5), p95_ms: quantile(n, .95), max_ms: n.at(-1) ?? null };
};

async function discover(page) {
  return page.locator('a[href]').evaluateAll((anchors) => [...new Set(anchors
    .map((a) => a.href)
    .filter((href) => href.startsWith(location.origin + '/app/'))
    .map((href) => new URL(href).pathname + new URL(href).search))]);
}

async function pageProof(page, url) {
  const warmStart = performance.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(250);
  const elapsed = Math.round(performance.now() - warmStart);
  const body = await page.locator('body').innerText().catch(() => '');
  const content = body.replace(/\s+/g, ' ').trim();
  return { url: redactUrl(url), final_url: redactUrl(page.url()), substantive: content.length >= 20 && !/404|not found|loading\.\.\./i.test(content), characters: content.length, navigation_ms: elapsed };
}

async function authenticate(context, label, scenario) {
  const cookieValue = scenario.sessionCookieEnv ? process.env[scenario.sessionCookieEnv] : null;
  if (cookieValue) {
    await context.addCookies([{
      name: 'bersoncare_webapp_session', value: cookieValue, url: baseUrl, httpOnly: true,
    }]);
    return { kind: 'actual_session_cookie' };
  }
  const email = process.env[scenario.emailEnv] || scenario.defaultEmail;
  if (email && password) {
    const login = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
      headers: { Origin: baseUrl }, data: { email, password },
    });
    const body = await login.json().catch(() => null);
    if (login.status() !== 200 || body?.ok !== true || body?.factorRequired === true) {
      throw new Error(`actual_${label}_login_failed:${login.status()}:${body?.error ?? 'unknown'}`);
    }
    if (scenario.elevateAdminMode) {
      const elevated = await context.request.post(`${baseUrl}/api/admin/mode`, { headers: { Origin: baseUrl } });
      const elevatedBody = await elevated.json().catch(() => null);
      if (elevated.status() !== 200 || elevatedBody?.adminMode !== true) {
        throw new Error(`actual_${label}_admin_mode_failed:${elevated.status()}`);
      }
    }
    return { kind: 'actual_email_password', email };
  }
  if (!allowSynthetic) {
    throw new Error(`actual_${label}_auth_missing:set_password_or_session_cookie`);
  }
  const response = await context.request.get(
    `${baseUrl}/api/auth/dev-bypass?token=dev%3A${scenario.syntheticToken}`,
    { maxRedirects: 0 },
  );
  if (response.status() !== 303) throw new Error(`synthetic_${label}_login_failed:${response.status()}`);
  return { kind: 'synthetic_dev_bypass', token: scenario.syntheticToken };
}

async function apiJson(context, pathname, options = {}) {
  const response = await context.request.fetch(`${baseUrl}${pathname}`, {
    headers: { Origin: baseUrl, ...(options.headers || {}) }, ...options,
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), ok: response.ok(), body };
}

async function commercialMutationCycles(context) {
  const cycles = [];
  const read = () => apiJson(context, '/api/admin/commercial');
  const write = (data) => apiJson(context, '/api/admin/commercial', { method: 'POST', data });
  const initial = await read();
  if (!initial.ok) return [{ id: 'admin.commercial', pass: false, stage: 'initial_read', status: initial.status }];
  const reason = '[DEV AUDIT] reversible control verification';
  const tariffs = (initial.body.tariffs || []).filter((item) => item.isActive);

  const registrationOriginal = initial.body.registrationTariffPolicy ?? { tariffId: null };
  const alternateTariff = registrationOriginal.tariffId === null ? (tariffs[0]?.id ?? null) : null;
  if (alternateTariff !== registrationOriginal.tariffId) {
    const started = performance.now();
    const mutated = { tariffId: alternateTariff };
    const save = await write({ action: 'set_registration_tariff_policy', policy: mutated, reason });
    const readback = await read();
    const restore = await write({ action: 'set_registration_tariff_policy', policy: registrationOriginal, reason });
    const restored = await read();
    cycles.push({ id: 'admin.registration-tariff-policy', pass: save.ok && readback.body?.registrationTariffPolicy?.tariffId === mutated.tariffId && restore.ok && restored.body?.registrationTariffPolicy?.tariffId === registrationOriginal.tariffId, duration_ms: Math.round(performance.now() - started), statuses: [save.status, readback.status, restore.status, restored.status] });
  } else cycles.push({ id: 'admin.registration-tariff-policy', skipped: 'no_alternate_tariff' });

  const trialOriginal = initial.body.trialPolicy;
  if (trialOriginal) {
    const started = performance.now();
    const trialInput = { durationDays: trialOriginal.durationDays, discountWindowDays: trialOriginal.discountWindowDays, startEvent: trialOriginal.startEvent, postTrialBehavior: trialOriginal.postTrialBehavior, postTrialTariffId: trialOriginal.postTrialTariffId, isActive: trialOriginal.isActive };
    const trialMutated = { ...trialInput, durationDays: trialOriginal.durationDays === 3650 ? 3649 : trialOriginal.durationDays + 1 };
    const save = await write({ action: 'set_trial_policy', policy: trialMutated, reason });
    const readback = await read();
    const restore = await write({ action: 'set_trial_policy', policy: trialInput, reason });
    const restored = await read();
    cycles.push({ id: 'admin.trial-policy', pass: save.ok && readback.body?.trialPolicy?.durationDays === trialMutated.durationDays && restore.ok && restored.body?.trialPolicy?.durationDays === trialInput.durationDays, duration_ms: Math.round(performance.now() - started), statuses: [save.status, readback.status, restore.status, restored.status] });
  } else cycles.push({ id: 'admin.trial-policy', skipped: 'policy_absent' });

  const paidOriginal = initial.body.paidPeriodPolicy;
  if (paidOriginal) {
    const started = performance.now();
    const paidInput = { postPaidPeriodBehavior: paidOriginal.postPaidPeriodBehavior, postPaidPeriodTariffId: paidOriginal.postPaidPeriodTariffId, isActive: paidOriginal.isActive };
    const paidMutated = { ...paidInput, isActive: !paidOriginal.isActive };
    const save = await write({ action: 'set_paid_period_policy', policy: paidMutated, reason });
    const readback = await read();
    const restore = await write({ action: 'set_paid_period_policy', policy: paidInput, reason });
    const restored = await read();
    cycles.push({ id: 'admin.paid-period-policy', pass: save.ok && readback.body?.paidPeriodPolicy?.isActive === paidMutated.isActive && restore.ok && restored.body?.paidPeriodPolicy?.isActive === paidInput.isActive, duration_ms: Math.round(performance.now() - started), statuses: [save.status, readback.status, restore.status, restored.status] });
  } else cycles.push({ id: 'admin.paid-period-policy', skipped: 'policy_absent' });
  return cycles;
}

function availabilityEnabled(overview, serviceId, branchId, specialistId) {
  return Boolean((overview.locationAvailability || []).find((row) => row.serviceId === serviceId && row.branchId === branchId && row.isActive) || (overview.specialistAvailability || []).find((row) => row.specialistId === specialistId && row.serviceId === serviceId && row.branchId === branchId && row.isActive));
}

async function availabilityMutationCycle(context) {
  const started = performance.now();
  const initial = await apiJson(context, '/api/admin/booking-engine/overview');
  if (!initial.ok) return [{ id: 'doctor.service-location-availability', pass: false, stage: 'initial_read', status: initial.status }];
  const branch = initial.body.branches?.find((row) => row.isActive);
  const service = initial.body.services?.find((row) => row.isActive);
  const specialist = initial.body.specialists?.find((row) => row.isActive);
  if (!branch || !service || !specialist) return [{ id: 'doctor.service-location-availability', skipped: 'no_active_fixture_tuple' }];
  const original = availabilityEnabled(initial.body, service.id, branch.id, specialist.id);
  const post = (isActive) => apiJson(context, '/api/admin/booking-engine/availability', { method: 'POST', data: { kind: 'solo_service_location', specialistId: specialist.id, serviceId: service.id, branchId: branch.id, isActive } });
  const save = await post(!original);
  const readback = await apiJson(context, '/api/admin/booking-engine/overview');
  const restore = await post(original);
  const restored = await apiJson(context, '/api/admin/booking-engine/overview');
  return [{ id: 'doctor.service-location-availability', pass: save.ok && availabilityEnabled(readback.body, service.id, branch.id, specialist.id) === !original && restore.ok && availabilityEnabled(restored.body, service.id, branch.id, specialist.id) === original, duration_ms: Math.round(performance.now() - started), statuses: [save.status, readback.status, restore.status, restored.status] }];
}

async function patientReminderToggleCycle(page) {
  const started = performance.now();
  await page.goto(`${baseUrl}/app/patient/reminders`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const toggle = page.locator('[role=switch][aria-label^="Включить"]').first();
  if (!(await toggle.count())) return [{ id: 'patient.reminder-enabled', skipped: 'no_existing_rule' }];
  const original = await toggle.getAttribute('aria-checked');
  await toggle.click(); await page.waitForTimeout(500); await page.reload({ waitUntil: 'domcontentloaded' });
  const mutated = await page.locator('[role=switch][aria-label^="Включить"]').first().getAttribute('aria-checked');
  await page.locator('[role=switch][aria-label^="Включить"]').first().click(); await page.waitForTimeout(500); await page.reload({ waitUntil: 'domcontentloaded' });
  const restored = await page.locator('[role=switch][aria-label^="Включить"]').first().getAttribute('aria-checked');
  return [{ id: 'patient.reminder-enabled', pass: mutated !== original && restored === original, duration_ms: Math.round(performance.now() - started), values: [original, mutated, restored] }];
}

async function auditRole(browser, label, scenario) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const failures = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const network = [];
  const api = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240)); if (m.type() === 'warning') consoleWarnings.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 240)));
  page.on('requestfailed', (r) => { const detail = r.failure()?.errorText ?? 'failed'; if (detail === 'net::ERR_ABORTED') return; const item = { kind: 'requestfailed', url: redactUrl(r.url()), detail }; failures.push(item); network.push(item); });
  page.on('response', (r) => { if (sameOrigin(r.url())) { const item = { method: r.request().method(), status: r.status(), url: redactUrl(r.url()), resource: r.request().resourceType() }; if (r.url().includes('/api/')) api.push(item); if (r.status() >= 400) { failures.push({ kind: 'http', ...item }); network.push({ kind: 'http', ...item }); } } });

  const auth = await authenticate(context, label, scenario);
  await page.goto(`${baseUrl}${scenario.routes[0]}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(300);
  const home = page.url();
  const queue = [...new Set(scenario.routes.map((route) => new URL(route, baseUrl).href))];
  const seen = new Set(); const pages = [];
  while (queue.length && seen.size < 80) {
    const target = queue.shift(); if (seen.has(target)) continue; seen.add(target);
    try {
      const proof = await pageProof(page, target);
      const tabs = await page.getByRole('tab').allTextContents().catch(() => []);
      const requiredTabs = scenario.requiredTabs?.[redactUrl(target)] ?? [];
      const missingTabs = requiredTabs.filter((label) => !tabs.map((item) => item.trim()).includes(label));
      if (missingTabs.length) failures.push({ kind: 'missing_tabs', url: redactUrl(target), detail: missingTabs.join(', ') });
      const tabProofs = [];
      for (const tab of tabs.map((value) => value.trim()).filter(Boolean)) {
        const locator = page.getByRole('tab', { name: tab, exact: true });
        await locator.click().catch(() => {}); await page.waitForTimeout(150);
        tabProofs.push({ label: tab, selected: await locator.getAttribute('aria-selected'), characters: (await page.locator('body').innerText().catch(() => '')).trim().length });
      }
      const warmProof = await pageProof(page, target);
      pages.push({ ...proof, warm_navigation_ms: warmProof.navigation_ms, tabs: tabProofs, missing_tabs: missingTabs });
      for (const href of await discover(page)) { const absolute = new URL(href, baseUrl).href; if (!seen.has(absolute)) queue.push(absolute); }
    } catch (error) { pages.push({ url: redactUrl(target), substantive: false, error: String(error.message).slice(0, 180) }); }
  }
  const latency = pages.map((item) => item.warm_navigation_ms).filter(Number.isFinite);
  let mutationCycles = [];
  if (mutationsEnabled) {
    if (label === 'global_admin') mutationCycles = await commercialMutationCycles(context);
    if (label === 'doctor') mutationCycles = await availabilityMutationCycle(context);
    if (label === 'patient') mutationCycles = await patientReminderToggleCycle(page);
  }
  const controls = pages.flatMap((item) => (item.tabs || []).map((tab) => ({ route: item.final_url || item.url, kind: 'tab', ...tab })));
  await context.close();
  const safeActionPolicy = mutationsEnabled ? 'Only named reversible adapters ran. Identity/contact, password, deletion, delivery and payment controls remain not_mutated_safety.' : 'Mutation adapters disabled; set DEV_AUDIT_MUTATE=1 only on DEV after reviewing scenarios.mjs.';
  return { role: label, authentication: auth, authenticated: new URL(home).pathname.startsWith('/app/'), pages, latency: stats(latency), controls_observed: controls, safe_action_policy: safeActionPolicy, mutation_cycles: mutationCycles, api_responses: api, failures, console_errors: consoleErrors, console_warnings: consoleWarnings, network_failures: network };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const started_at = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [label, scenario] of Object.entries(ROLE_SCENARIOS)) {
      try { results.push(await auditRole(browser, label, scenario)); }
      catch (error) { results.push({ role: label, authenticated: false, fatal_error: String(error.message).slice(0, 240) }); }
    }
  }
  finally { await browser.close(); }
  const finished_at = new Date().toISOString();
  const report = { started_at, finished_at, base_url: baseUrl, mutations_enabled: mutationsEnabled, reversible_adapter_matrix: REVERSIBLE_ADAPTER_MATRIX, results };
  const path = `${outDir}/result-${started_at.replace(/[:.]/g, '-')}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  const allPages = results.flatMap((r) => (r.pages || []).map((p) => ({ role: r.role, ...p })));
  const allLatency = allPages.map((p) => p.navigation_ms).filter(Number.isFinite);
  const md = [`# DEV interactive audit — ${started_at}`, '', `Base URL: \`${baseUrl}\``, '', '## Scope and safety', '', '- Existing DEV server only; no server restart, product code, schema, grants or irreversible data changes.', `- Named reversible mutation adapters: ${mutationsEnabled ? 'enabled' : 'disabled'}. Identity/contact, password, deletion, delivery and payment remain not_mutated_safety.`, '', '## Role summary', '', '| Role | Auth method | Pages | Substantive | cold p50 ms | cold p95 ms | warm p50 ms | warm p95 ms | API responses | failures | Console errors |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|', ...results.map((r) => { const ps = r.pages || []; const cold = stats(ps.map((p) => p.navigation_ms).filter(Number.isFinite)); const warm = stats(ps.map((p) => p.warm_navigation_ms).filter(Number.isFinite)); return `| ${r.role} | ${r.authentication?.kind ?? 'failed'} | ${ps.length} | ${ps.filter((p) => p.substantive).length} | ${cold.median_ms ?? '-'} | ${cold.p95_ms ?? '-'} | ${warm.median_ms ?? '-'} | ${warm.p95_ms ?? '-'} | ${(r.api_responses || []).length} | ${(r.network_failures || []).length} | ${(r.console_errors || []).length} |`; }), '', `Overall cold page latency p50/p95/max: ${JSON.stringify(stats(allLatency))}`, '', '## Page matrix', '', '| Role | Final URL | Content | cold ms | warm ms | tabs |', '|---|---|---|---:|---:|---|', ...allPages.map((p) => `| ${p.role} | \`${p.final_url || p.url}\` | ${p.substantive ? 'substantive' : 'FAIL/empty'} (${p.characters ?? 0} chars) | ${p.navigation_ms ?? '-'} | ${p.warm_navigation_ms ?? '-'} | ${(p.tabs || []).map((tab) => tab.label).join(', ') || '-'} |`), '', '## Reproducible failures and mutation cycles', '', ...results.flatMap((r) => [...(r.failures || []).map((f) => `- **${r.role} failure:** ${f.kind} ${f.status ?? ''} \`${f.url}\` ${f.detail ?? ''}`), ...(r.console_errors || []).map((e) => `- **${r.role} console error:** ${e}`), ...(r.mutation_cycles || []).map((m) => `- **${r.role} mutation:** ${JSON.stringify(m)}`)]), '', '## Server evidence', '', '- Listener/process evidence and server log tail must be captured around this foreground command; the harness itself does not read or modify server logs.'];
  writeFileSync(`${outDir}/report-${started_at.replace(/[:.]/g, '-')}.md`, `${md.join('\n')}\n`);
  console.log(JSON.stringify({ artifact: path, roles: results.map((r) => ({ role: r.role, authenticated: r.authenticated, pages: r.pages?.length ?? 0, latency: r.latency ?? null, failures: r.failures?.length ?? 0, console_errors: r.console_errors?.length ?? 0 })) }, null, 2));
}
main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
