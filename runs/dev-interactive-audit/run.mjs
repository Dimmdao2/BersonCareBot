#!/usr/bin/env node
/**
 * Live audit of the already-running canonical DEV server. Artifacts omit query
 * strings, cookies, credentials and response bodies.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../clickthrough/lib/browser.mjs';
import { CONTROL_ADAPTER_MATRIX, ROLE_SCENARIOS } from './scenarios.mjs';
import { runReversibleCycle } from './reversible-cycle.mjs';

const baseUrl = process.env.DEV_AUDIT_BASE_URL || 'http://127.0.0.1:5200';
const outDir = 'runs/dev-interactive-audit/out';
const password = process.env.DEV_AUDIT_PASSWORD || '';
const allowSynthetic = process.env.DEV_AUDIT_ALLOW_SYNTHETIC === '1';
const mutationsEnabled = process.env.DEV_AUDIT_MUTATE === '1';
const base = new URL(baseUrl);
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.port !== '5200') {
  throw new Error('DEV_AUDIT_BASE_URL must be the canonical http://127.0.0.1:5200 DEV listener');
}

const nowMs = () => performance.now();
const sameOrigin = (url) => {
  try {
    return new URL(url).origin === base.origin;
  } catch {
    return false;
  }
};
const redactUrl = (url) => {
  try {
    const value = new URL(url, baseUrl);
    return value.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
      .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, '/:id');
  } catch {
    return '<invalid-url>';
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
const compactError = (error) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 240);

async function discover(page) {
  return page.locator('a[href]').evaluateAll((anchors) => [
    ...new Set(
      anchors
        .map((anchor) => anchor.href)
        .filter((href) => href.startsWith(`${location.origin}/app/`))
        .map((href) => `${new URL(href).pathname}${new URL(href).search}`),
    ),
  ]);
}

async function settlePage(page) {
  const started = nowMs();
  const networkIdle = await page
    .waitForLoadState('networkidle', { timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(200);
  return { settle_ms: Math.round(nowMs() - started), network_idle: networkIdle };
}

async function pageProof(page, url) {
  const started = nowMs();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const domcontentloadedMs = Math.round(nowMs() - started);
  const settled = await settlePage(page);
  const content = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .trim();
  const finalPath = redactUrl(page.url());
  const authBounce = finalPath === '/app' && redactUrl(url) !== '/app';
  const visibleFatal = /(?:404|not found|internal server error|application error)/i.test(content);
  return {
    url: redactUrl(url),
    final_url: finalPath,
    navigation_status: response?.status() ?? null,
    substantive: Boolean(response?.ok()) && !authBounce && content.length >= 20 && !visibleFatal,
    characters: content.length,
    navigation_ms: Math.round(nowMs() - started),
    domcontentloaded_ms: domcontentloadedMs,
    ...settled,
  };
}

async function authenticate(context, label, scenario) {
  const cookieValue = scenario.sessionCookieEnv ? process.env[scenario.sessionCookieEnv] : null;
  if (cookieValue) {
    await context.addCookies([
      {
        name: 'bersoncare_webapp_session',
        value: cookieValue,
        url: baseUrl,
        httpOnly: true,
      },
    ]);
    return { kind: 'actual_session_cookie' };
  }
  const email = process.env[scenario.emailEnv] || scenario.defaultEmail;
  if (email && password) {
    const login = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
      headers: { Origin: baseUrl },
      data: { email, password },
    });
    const body = await login.json().catch(() => null);
    if (login.status() !== 200 || body?.ok !== true || body?.factorRequired === true) {
      throw new Error(`actual_${label}_login_failed:${login.status()}:${body?.error ?? 'unknown'}`);
    }
    return { kind: 'actual_email_password' };
  }
  if (!allowSynthetic) {
    throw new Error(`actual_${label}_auth_missing:set_password_or_session_cookie`);
  }
  const response = await context.request.get(
    `${baseUrl}/api/auth/dev-bypass?token=dev%3A${scenario.syntheticToken}`,
    { maxRedirects: 0 },
  );
  if (response.status() !== 303)
    throw new Error(`synthetic_${label}_login_failed:${response.status()}`);
  return { kind: 'synthetic_dev_bypass' };
}

async function apiJson(context, evidence, pathname, options = {}) {
  const started = nowMs();
  const response = await context.request.fetch(`${baseUrl}${pathname}`, {
    headers: { Origin: baseUrl, ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  const item = {
    method: options.method || 'GET',
    status: response.status(),
    url: redactUrl(pathname),
    resource: 'audit-action',
    duration_ms: Math.round(nowMs() - started),
  };
  evidence.api.push(item);
  if (response.status() >= 400) {
    evidence.failures.push({ kind: 'action_http', ...item });
    evidence.network.push({ kind: 'action_http', ...item });
  }
  return { status: response.status(), ok: response.ok(), body, duration_ms: item.duration_ms };
}

const registrationPolicy = (body) => ({
  tariffId: body?.registrationTariffPolicy?.tariffId ?? null,
});
const trialPolicy = (body) => {
  const policy = body?.trialPolicy;
  return policy
    ? {
        durationDays: policy.durationDays,
        discountWindowDays: policy.discountWindowDays,
        startEvent: policy.startEvent,
        postTrialBehavior: policy.postTrialBehavior,
        postTrialTariffId: policy.postTrialTariffId,
        isActive: policy.isActive,
      }
    : null;
};
const paidPolicy = (body) => {
  const policy = body?.paidPeriodPolicy;
  return policy
    ? {
        postPaidPeriodBehavior: policy.postPaidPeriodBehavior,
        postPaidPeriodTariffId: policy.postPaidPeriodTariffId,
        isActive: policy.isActive,
      }
    : null;
};
const equalJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function commercialMutationCycles(context, evidence) {
  const read = () => apiJson(context, evidence, '/api/admin/commercial');
  const write = (data) =>
    apiJson(context, evidence, '/api/admin/commercial', { method: 'POST', data });
  const reason = '[DEV AUDIT] reversible control verification';
  let registrationChanged;
  const registration = await runReversibleCycle({
    id: 'admin.registration-tariff-policy',
    read,
    change: async (initial) => {
      const activeTariffs = (initial.body?.tariffs || []).filter((item) => item.isActive);
      const original = registrationPolicy(initial.body);
      registrationChanged = {
        tariffId: original.tariffId === null ? (activeTariffs[0]?.id ?? null) : null,
      };
      if (equalJson(original, registrationChanged))
        return { ok: false, status: null, error: 'no_alternate_tariff' };
      return write({
        action: 'set_registration_tariff_policy',
        policy: registrationChanged,
        reason,
      });
    },
    restore: (initial) =>
      write({
        action: 'set_registration_tariff_policy',
        policy: registrationPolicy(initial.body),
        reason,
      }),
    changedMatches: (_initial, changed) =>
      equalJson(registrationPolicy(changed.body), registrationChanged),
    restoredMatches: (initial, restored) =>
      equalJson(registrationPolicy(restored.body), registrationPolicy(initial.body)),
  });

  let trialChanged;
  const trial = await runReversibleCycle({
    id: 'admin.trial-policy',
    read,
    change: (initial) => {
      const original = trialPolicy(initial.body);
      if (!original)
        return Promise.resolve({ ok: false, status: null, error: 'trial_policy_absent' });
      trialChanged = {
        ...original,
        durationDays: original.durationDays === 3650 ? 3649 : original.durationDays + 1,
      };
      return write({ action: 'set_trial_policy', policy: trialChanged, reason });
    },
    restore: (initial) =>
      write({ action: 'set_trial_policy', policy: trialPolicy(initial.body), reason }),
    changedMatches: (_initial, changed) => equalJson(trialPolicy(changed.body), trialChanged),
    restoredMatches: (initial, restored) =>
      equalJson(trialPolicy(restored.body), trialPolicy(initial.body)),
  });

  let paidChanged;
  const paid = await runReversibleCycle({
    id: 'admin.paid-period-policy',
    read,
    change: (initial) => {
      const original = paidPolicy(initial.body);
      if (!original)
        return Promise.resolve({ ok: false, status: null, error: 'paid_policy_absent' });
      paidChanged = { ...original, isActive: !original.isActive };
      return write({ action: 'set_paid_period_policy', policy: paidChanged, reason });
    },
    restore: (initial) =>
      write({ action: 'set_paid_period_policy', policy: paidPolicy(initial.body), reason }),
    changedMatches: (_initial, changed) => equalJson(paidPolicy(changed.body), paidChanged),
    restoredMatches: (initial, restored) =>
      equalJson(paidPolicy(restored.body), paidPolicy(initial.body)),
  });
  return [registration, trial, paid];
}

function availabilityEnabled(overview, serviceId, branchId, specialistId) {
  return Boolean(
    (overview?.locationAvailability || []).find(
      (row) => row.serviceId === serviceId && row.branchId === branchId && row.isActive,
    ) ||
    (overview?.specialistAvailability || []).find(
      (row) =>
        row.specialistId === specialistId &&
        row.serviceId === serviceId &&
        row.branchId === branchId &&
        row.isActive,
    ),
  );
}

async function availabilityMutationCycle(context, evidence) {
  const read = () => apiJson(context, evidence, '/api/admin/booking-engine/overview');
  let tuple;
  return runReversibleCycle({
    id: 'doctor.service-location-availability',
    read,
    change: (initial) => {
      const branch = initial.body?.branches?.find((row) => row.isActive);
      const service = initial.body?.services?.find((row) => row.isActive);
      const specialist = initial.body?.specialists?.find((row) => row.isActive);
      if (!branch || !service || !specialist) {
        return Promise.resolve({
          ok: false,
          status: null,
          error: 'active_service_location_tuple_absent',
        });
      }
      tuple = {
        branchId: branch.id,
        serviceId: service.id,
        specialistId: specialist.id,
        original: availabilityEnabled(initial.body, service.id, branch.id, specialist.id),
      };
      return apiJson(context, evidence, '/api/admin/booking-engine/availability', {
        method: 'POST',
        data: {
          kind: 'solo_service_location',
          branchId: tuple.branchId,
          serviceId: tuple.serviceId,
          specialistId: tuple.specialistId,
          isActive: !tuple.original,
        },
      });
    },
    restore: () =>
      apiJson(context, evidence, '/api/admin/booking-engine/availability', {
        method: 'POST',
        data: {
          kind: 'solo_service_location',
          branchId: tuple.branchId,
          serviceId: tuple.serviceId,
          specialistId: tuple.specialistId,
          isActive: tuple.original,
        },
      }),
    changedMatches: (_initial, changed) =>
      availabilityEnabled(changed.body, tuple.serviceId, tuple.branchId, tuple.specialistId) ===
      !tuple.original,
    restoredMatches: (_initial, restored) =>
      availabilityEnabled(restored.body, tuple.serviceId, tuple.branchId, tuple.specialistId) ===
      tuple.original,
  });
}

async function workingScheduleMutationCycle(context, evidence) {
  const read = () => apiJson(context, evidence, '/api/doctor/booking-engine/working-hours');
  let selected;
  return runReversibleCycle({
    id: 'doctor.working-schedule',
    read,
    change: (initial) => {
      const row = initial.body?.rows?.find(
        (item) => item.isActive && item.endMinute - item.startMinute > 1,
      );
      if (!row)
        return Promise.resolve({ ok: false, status: null, error: 'active_working_hours_absent' });
      selected = {
        id: row.id,
        startMinute: row.startMinute,
        changedStartMinute: row.startMinute + 1,
      };
      return apiJson(context, evidence, '/api/doctor/booking-engine/working-hours', {
        method: 'PATCH',
        data: { id: selected.id, startMinute: selected.changedStartMinute },
      });
    },
    restore: () =>
      apiJson(context, evidence, '/api/doctor/booking-engine/working-hours', {
        method: 'PATCH',
        data: { id: selected.id, startMinute: selected.startMinute },
      }),
    changedMatches: (_initial, changed) =>
      changed.body?.rows?.some(
        (row) => row.id === selected.id && row.startMinute === selected.changedStartMinute,
      ),
    restoredMatches: (_initial, restored) =>
      restored.body?.rows?.some(
        (row) => row.id === selected.id && row.startMinute === selected.startMinute,
      ),
  });
}

async function firstVisible(locator) {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function reloadReminderSwitch(page, label) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settlePage(page);
  const exact = page.getByRole('switch', { name: label, exact: true });
  return firstVisible(exact);
}

async function patientReminderToggleCycle(page) {
  const started = nowMs();
  await page.goto(`${baseUrl}/app/patient/reminders`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await settlePage(page);
  const toggle = await firstVisible(page.locator('[role=switch][aria-label^="Включить"]'));
  if (!toggle) return { id: 'patient.reminder-enabled', pass: false, failure: 'control_absent' };
  const label = await toggle.getAttribute('aria-label');
  const original = await toggle.getAttribute('aria-checked');
  if (!label || (original !== 'true' && original !== 'false')) {
    return { id: 'patient.reminder-enabled', pass: false, failure: 'control_state_unreadable' };
  }
  const expected = original === 'true' ? 'false' : 'true';
  let changed = null;
  let restored = null;
  let failure = null;
  try {
    await toggle.click();
    const changedToggle = await reloadReminderSwitch(page, label);
    changed = (await changedToggle?.getAttribute('aria-checked')) ?? null;
    if (changed !== expected) failure = 'changed_readback_mismatch';
  } catch (error) {
    failure = `exception:${compactError(error)}`;
  } finally {
    try {
      const currentToggle = await reloadReminderSwitch(page, label);
      const current = (await currentToggle?.getAttribute('aria-checked')) ?? null;
      if (current === expected && currentToggle) {
        await currentToggle.click();
      }
      const restoredToggle = await reloadReminderSwitch(page, label);
      restored = (await restoredToggle?.getAttribute('aria-checked')) ?? null;
      if (restored !== original) failure = failure ?? 'restore_readback_mismatch';
    } catch (error) {
      failure = failure ?? `restore_exception:${compactError(error)}`;
    }
  }
  return {
    id: 'patient.reminder-enabled',
    pass: failure === null && changed === expected && restored === original,
    ...(failure ? { failure } : {}),
    values: [original, changed, restored],
    duration_ms: Math.round(nowMs() - started),
  };
}

async function openFirstReminderSchedule(page) {
  const buttons = page.getByRole('button', { name: 'Изменить расписание', exact: true });
  const button = await firstVisible(buttons);
  if (!button) throw new Error('schedule_control_absent');
  await button.click();
  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  return dialog;
}

function minuteValue(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function timeValue(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

async function reminderTimeControl(dialog) {
  const start = dialog.getByLabel('Начало периода', { exact: true });
  if (await start.isVisible().catch(() => false)) {
    const end = dialog.getByLabel('Конец периода', { exact: true });
    const original = await start.inputValue();
    const startMinute = minuteValue(original);
    const endMinute = minuteValue(await end.inputValue());
    if (startMinute === null || endMinute === null) throw new Error('interval_time_unreadable');
    const changedMinute = startMinute + 1 < endMinute ? startMinute + 1 : startMinute - 1;
    if (changedMinute < 0) throw new Error('interval_time_has_no_safe_alternate');
    return { kind: 'interval_start', locator: start, original, changed: timeValue(changedMinute) };
  }
  const slots = dialog.locator('input[type="time"]');
  const slot = await firstVisible(slots);
  if (!slot) throw new Error('time_control_absent');
  const values = await slots.evaluateAll((inputs) => inputs.map((input) => input.value));
  const original = await slot.inputValue();
  const originalMinute = minuteValue(original);
  if (originalMinute === null) throw new Error('slot_time_unreadable');
  const candidates = [originalMinute + 1, originalMinute - 1].filter(
    (value) => value >= 0 && value < 1440,
  );
  const alternate = candidates.map(timeValue).find((value) => !values.includes(value));
  if (!alternate) throw new Error('slot_time_has_no_safe_alternate');
  return { kind: 'slot', locator: slot, original, changed: alternate };
}

async function saveReminderDialog(dialog) {
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
}

async function patientReminderTimeCycle(page) {
  const started = nowMs();
  await page.goto(`${baseUrl}/app/patient/reminders`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await settlePage(page);
  let original;
  let changed;
  let kind;
  let changedSaved = false;
  let changedReadback = null;
  let restoredReadback = null;
  let failure = null;
  try {
    const dialog = await openFirstReminderSchedule(page);
    const control = await reminderTimeControl(dialog);
    ({ original, changed, kind } = control);
    await control.locator.fill(changed);
    await saveReminderDialog(dialog);
    changedSaved = true;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await settlePage(page);
    const readbackDialog = await openFirstReminderSchedule(page);
    changedReadback = (await reminderTimeControl(readbackDialog)).original;
    await readbackDialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    if (changedReadback !== changed) failure = 'changed_readback_mismatch';
  } catch (error) {
    failure = `exception:${compactError(error)}`;
  } finally {
    if (changedSaved && original) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
        await settlePage(page);
        const restoreDialog = await openFirstReminderSchedule(page);
        const restoreControl = await reminderTimeControl(restoreDialog);
        await restoreControl.locator.fill(original);
        await saveReminderDialog(restoreDialog);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
        await settlePage(page);
        const finalDialog = await openFirstReminderSchedule(page);
        restoredReadback = (await reminderTimeControl(finalDialog)).original;
        await finalDialog.getByRole('button', { name: 'Отмена', exact: true }).click();
        if (restoredReadback !== original) failure = failure ?? 'restore_readback_mismatch';
      } catch (error) {
        failure = failure ?? `restore_exception:${compactError(error)}`;
      }
    }
  }
  return {
    id: 'patient.reminder-time',
    pass: failure === null && changedReadback === changed && restoredReadback === original,
    ...(failure ? { failure } : {}),
    kind,
    values: [original, changedReadback, restoredReadback],
    duration_ms: Math.round(nowMs() - started),
  };
}

async function patientChatSendCheck(page) {
  const started = nowMs();
  const auditText = `[DEV AUDIT ${new Date().toISOString()}] technical control pass`;
  try {
    await page.goto(`${baseUrl}/app/patient/messages`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await settlePage(page);
    const composer = page.getByRole('textbox', { name: 'Текст сообщения', exact: true });
    if (!(await composer.isVisible().catch(() => false))) {
      const readOnly = await page
        .getByTestId('patient-messages-readonly-notice')
        .isVisible()
        .catch(() => false);
      return {
        id: 'patient.chat-send',
        pass: false,
        failure: readOnly ? 'conversation_read_only' : 'composer_absent',
      };
    }
    await composer.fill(auditText);
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await page.getByText(auditText, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
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

async function patientPhoneFlowCheck(page) {
  const started = nowMs();
  try {
    await page.goto(`${baseUrl}/app/patient/profile`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await settlePage(page);
    const phoneSection = page
      .locator('section')
      .filter({ has: page.getByText('Телефон', { exact: true }) })
      .first();
    const open = phoneSection.getByRole('button', { name: /^(Изменить|Привязать)$/ }).first();
    await open.click();
    await page.waitForURL((url) => url.pathname === '/app/patient/bind-phone', { timeout: 15_000 });
    await settlePage(page);
    const surface = page.locator(
      '#phone-messenger-auth-phone, #patient-bind-phone-messenger-unified, #patient-bind-phone-browser',
    );
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    const pass =
      Boolean(await firstVisible(surface)) &&
      !/(?:404|internal server error|application error)/i.test(body);
    return {
      id: 'patient.phone-change-flow',
      pass,
      ...(pass
        ? { safe_boundary: 'bind_phone_surface_opened_no_contact_submitted' }
        : { failure: 'bind_phone_surface_absent' }),
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

async function patientWarmupDeepLinkCheck(page) {
  const started = nowMs();
  try {
    const proof = await pageProof(page, `${baseUrl}/app/patient/go/daily-warmup`);
    const contentRoute = proof.final_url.startsWith('/app/patient/content/');
    return {
      id: 'patient.daily-warmup-deep-link',
      pass: proof.substantive && contentRoute,
      ...(proof.substantive && contentRoute
        ? {}
        : { failure: `unexpected_target:${proof.final_url}` }),
      final_url: proof.final_url,
      navigation_status: proof.navigation_status,
      duration_ms: Math.round(nowMs() - started),
    };
  } catch (error) {
    return {
      id: 'patient.daily-warmup-deep-link',
      pass: false,
      failure: compactError(error),
      duration_ms: Math.round(nowMs() - started),
    };
  }
}

function attachEvidence(page, evidence) {
  page.on('console', (message) => {
    const item = { url: redactUrl(page.url()), message: message.text().slice(0, 300) };
    if (message.type() === 'error') evidence.consoleErrors.push(item);
    if (message.type() === 'warning') evidence.consoleWarnings.push(item);
  });
  page.on('pageerror', (error) =>
    evidence.consoleErrors.push({
      url: redactUrl(page.url()),
      message: `pageerror: ${error.message}`.slice(0, 300),
    }),
  );
  page.on('requestfailed', (request) => {
    const detail = request.failure()?.errorText ?? 'failed';
    if (detail === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
    const item = {
      kind: 'requestfailed',
      url: redactUrl(request.url()),
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
      url: redactUrl(response.url()),
      resource: response.request().resourceType(),
      same_origin: sameOrigin(response.url()),
    };
    if (item.same_origin && response.url().includes('/api/')) evidence.api.push(item);
    if (response.status() >= 400) {
      evidence.failures.push({ kind: 'http', ...item });
      evidence.network.push({ kind: 'http', ...item });
    }
  });
}

async function auditRole(browser, label, scenario) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const evidence = { failures: [], consoleErrors: [], consoleWarnings: [], network: [], api: [] };
  attachEvidence(page, evidence);
  const auth = await authenticate(context, label, scenario);
  await page.goto(`${baseUrl}${scenario.routes[0]}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await settlePage(page);
  const home = page.url();
  const queue = [...new Set(scenario.routes.map((route) => new URL(route, baseUrl).href))];
  const seen = new Set();
  const pages = [];
  while (queue.length && seen.size < 80) {
    const target = queue.shift();
    if (seen.has(target)) continue;
    seen.add(target);
    try {
      const proof = await pageProof(page, target);
      const tabs = await page
        .getByRole('tab')
        .allTextContents()
        .catch(() => []);
      const requiredTabs = scenario.requiredTabs?.[redactUrl(target)] ?? [];
      const missingTabs = requiredTabs.filter(
        (required) => !tabs.map((item) => item.trim()).includes(required),
      );
      if (missingTabs.length)
        evidence.failures.push({
          kind: 'missing_tabs',
          url: redactUrl(target),
          detail: missingTabs.join(', '),
        });
      const tabProofs = [];
      for (const tab of tabs.map((value) => value.trim()).filter(Boolean)) {
        const locator = page.getByRole('tab', { name: tab, exact: true });
        const actionStarted = nowMs();
        await locator.click().catch(() => {});
        await page.waitForTimeout(200);
        tabProofs.push({
          label: tab,
          selected: await locator.getAttribute('aria-selected'),
          characters: (
            await page
              .locator('body')
              .innerText()
              .catch(() => '')
          ).trim().length,
          action_ms: Math.round(nowMs() - actionStarted),
        });
      }
      const warmProof = await pageProof(page, target);
      pages.push({
        ...proof,
        warm_navigation_ms: warmProof.navigation_ms,
        tabs: tabProofs,
        missing_tabs: missingTabs,
      });
      for (const href of await discover(page)) {
        const absolute = new URL(href, baseUrl).href;
        if (!seen.has(absolute)) queue.push(absolute);
      }
    } catch (error) {
      pages.push({ url: redactUrl(target), substantive: false, error: compactError(error) });
    }
  }

  const actionChecks = [];
  if (label === 'patient') {
    actionChecks.push(await patientWarmupDeepLinkCheck(page));
    actionChecks.push(await patientPhoneFlowCheck(page));
  }
  if (mutationsEnabled) {
    if (label === 'global_admin')
      actionChecks.push(...(await commercialMutationCycles(context, evidence)));
    if (label === 'doctor') {
      actionChecks.push(await workingScheduleMutationCycle(context, evidence));
      actionChecks.push(await availabilityMutationCycle(context, evidence));
    }
    if (label === 'patient') {
      actionChecks.push(await patientReminderToggleCycle(page));
      actionChecks.push(await patientReminderTimeCycle(page));
      actionChecks.push(await patientChatSendCheck(page));
    }
  }
  const controls = pages.flatMap((item) =>
    (item.tabs || []).map((tab) => ({
      route: item.final_url || item.url,
      kind: 'tab',
      ...tab,
    })),
  );
  await context.close();
  return {
    role: label,
    authentication: auth,
    authenticated: new URL(home).pathname.startsWith('/app/'),
    pages,
    latency: stats(pages.map((item) => item.warm_navigation_ms).filter(Number.isFinite)),
    controls_observed: controls,
    safe_action_policy: mutationsEnabled
      ? 'Named reversible adapters ran; patient chat leaves one labelled DEV audit message. Phone flow stops before contact submission.'
      : 'Mutation adapters disabled; safe warmup and phone-flow checks still ran.',
    action_checks: actionChecks,
    api_responses: evidence.api,
    failures: evidence.failures,
    console_errors: evidence.consoleErrors,
    console_warnings: evidence.consoleWarnings,
    network_failures: evidence.network,
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [label, scenario] of Object.entries(ROLE_SCENARIOS)) {
      try {
        results.push(await auditRole(browser, label, scenario));
      } catch (error) {
        results.push({ role: label, authenticated: false, fatal_error: compactError(error) });
      }
    }
  } finally {
    await browser.close();
  }
  const finishedAt = new Date().toISOString();
  const report = {
    started_at: startedAt,
    finished_at: finishedAt,
    base_url: baseUrl,
    mutations_enabled: mutationsEnabled,
    control_adapter_matrix: CONTROL_ADAPTER_MATRIX,
    results,
  };
  const suffix = startedAt.replace(/[:.]/g, '-');
  const artifact = `${outDir}/result-${suffix}.json`;
  writeFileSync(artifact, JSON.stringify(report, null, 2));
  const allPages = results.flatMap((result) =>
    (result.pages || []).map((page) => ({ role: result.role, ...page })),
  );
  const markdown = [
    `# DEV interactive audit — ${startedAt}`,
    '',
    `Base URL: \`${baseUrl}\``,
    '',
    '## Scope and safety',
    '',
    '- Canonical existing DEV listener only; the harness never restarts servers or touches schema/grants.',
    `- Named mutation adapters: ${mutationsEnabled ? 'enabled' : 'disabled'}. Every reversible write has exact readback and restore; patient chat leaves one labelled DEV-only audit message.`,
    '- Phone-change stops after the bind-phone surface opens and does not submit a contact.',
    '',
    '## Role summary',
    '',
    '| Role | Auth | Pages | Substantive | cold p50/p95 | warm p50/p95 | HTTP failures | Console errors | Actions passed |',
    '|---|---|---:|---:|---|---|---:|---:|---:|',
    ...results.map((result) => {
      const rolePages = result.pages || [];
      const cold = stats(rolePages.map((page) => page.navigation_ms).filter(Number.isFinite));
      const warm = stats(rolePages.map((page) => page.warm_navigation_ms).filter(Number.isFinite));
      const actions = result.action_checks || [];
      return `| ${result.role} | ${result.authentication?.kind ?? 'failed'} | ${rolePages.length} | ${rolePages.filter((page) => page.substantive).length} | ${cold.median_ms ?? '-'}/${cold.p95_ms ?? '-'} | ${warm.median_ms ?? '-'}/${warm.p95_ms ?? '-'} | ${(result.network_failures || []).length} | ${(result.console_errors || []).length} | ${actions.filter((action) => action.pass).length}/${actions.length} |`;
    }),
    '',
    '## Page matrix',
    '',
    '| Role | Final URL | Content | status | cold ms | warm ms | tabs |',
    '|---|---|---|---:|---:|---:|---|',
    ...allPages.map(
      (page) =>
        `| ${page.role} | \`${page.final_url || page.url}\` | ${page.substantive ? 'substantive' : 'FAIL/empty'} (${page.characters ?? 0} chars) | ${page.navigation_status ?? '-'} | ${page.navigation_ms ?? '-'} | ${page.warm_navigation_ms ?? '-'} | ${(page.tabs || []).map((tab) => tab.label).join(', ') || '-'} |`,
    ),
    '',
    '## Failures and action checks',
    '',
    ...results.flatMap((result) => [
      ...(result.failures || []).map(
        (failure) =>
          `- **${result.role} failure:** ${failure.kind} ${failure.status ?? ''} \`${failure.url ?? ''}\` ${failure.detail ?? ''}`,
      ),
      ...(result.console_errors || []).map(
        (error) => `- **${result.role} console:** \`${error.url}\` ${error.message}`,
      ),
      ...(result.action_checks || []).map(
        (action) => `- **${result.role} action:** ${JSON.stringify(action)}`,
      ),
    ]),
    '',
    '## Server evidence',
    '',
    '- Same-origin browser/API 4xx/5xx are recorded above. The orchestrator captures the server log interval around this command.',
  ];
  writeFileSync(`${outDir}/report-${suffix}.md`, `${markdown.join('\n')}\n`);
  console.log(
    JSON.stringify(
      {
        artifact,
        roles: results.map((result) => ({
          role: result.role,
          authenticated: result.authenticated,
          pages: result.pages?.length ?? 0,
          failures: result.failures?.length ?? 0,
          console_errors: result.console_errors?.length ?? 0,
          actions: (result.action_checks || []).map((action) => ({
            id: action.id,
            pass: action.pass,
          })),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
