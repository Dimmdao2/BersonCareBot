#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from '../clickthrough/lib/browser.mjs';

const baseUrl = 'http://127.0.0.1:5200';
const password = process.env.DEV_AUDIT_PASSWORD ?? '';
const email = process.env.DEV_AUDIT_PATIENT_EMAIL ?? 'kinesiospace@gmail.com';
const outDir = 'runs/dev-interactive-audit/out';

if (!password) throw new Error('DEV_AUDIT_PASSWORD is required');

const result = {
  started_at: new Date().toISOString(),
  complete: false,
  identity: null,
  catalog_probe: [],
  selection: {},
  create: null,
  reminder: null,
  reschedule: null,
  cancel: null,
  readback: null,
  recovery_cancel: null,
  console_errors: [],
  failed_responses: [],
};

function compact(value) {
  return String(value).replace(/\s+/g, ' ').slice(0, 500);
}

async function jsonBody(response) {
  return response.json().catch(() => null);
}

async function browserFetch(page, path, init) {
  return page.evaluate(
    async ({ target, requestInit }) => {
      const response = await fetch(target, {
        ...requestInit,
        credentials: 'include',
        headers: { 'content-type': 'application/json', ...(requestInit?.headers ?? {}) },
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { target: `${baseUrl}${path}`, requestInit: init },
  );
}

async function waitForPage(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
}

async function fillRequiredFields(page) {
  const required = page.locator('form input[required], form textarea[required]');
  for (let index = 0; index < (await required.count()); index += 1) {
    const field = required.nth(index);
    if (!(await field.isVisible()) || (await field.inputValue()).trim()) continue;
    await field.fill('DEV audit');
  }
}

async function selectSlot(page, avoidStart = null) {
  await page.getByRole('grid', { name: 'Календарь доступных дат записи' }).waitFor();
  const availableDates = page.locator('button[aria-label*="есть слоты"]:not([disabled])');
  const dateCount = await availableDates.count();
  if (avoidStart && dateCount > 1) await availableDates.nth(1).click();

  const slots = page.getByRole('button').filter({ hasText: /^\d{2}:\d{2} - \d{2}:\d{2}$/ });
  await slots.first().waitFor();
  const count = await slots.count();
  const choice = avoidStart && dateCount <= 1 && count > 1 ? slots.nth(1) : slots.first();
  const label = (await choice.textContent())?.trim() ?? '';
  await choice.click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForURL(/\/app\/patient\/booking\/confirm\?/);
  const selectedStart = new URL(page.url()).searchParams.get('slot');
  if (!selectedStart || selectedStart === avoidStart) {
    throw new Error('No slot different from the original booking was selected');
  }
  return { label, start: selectedStart };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let bookingId = null;
let cancelled = false;

page.on('console', (message) => {
  if (message.type() === 'error') {
    result.console_errors.push({ url: page.url(), message: compact(message.text()) });
  }
});
page.on('pageerror', (error) => {
  result.console_errors.push({ url: page.url(), message: compact(error.message) });
});
page.on('response', (response) => {
  if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
    result.failed_responses.push({
      method: response.request().method(),
      status: response.status(),
      url: new URL(response.url()).pathname,
    });
  }
});

try {
  await page.goto(`${baseUrl}/app`);
  const login = await browserFetch(page, '/api/auth/email-password/login', {
    method: 'POST',
    headers: { 'X-Real-IP': '127.0.0.1' },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200 || login.body?.ok !== true || login.body?.factorRequired === true) {
    throw new Error(`Patient login failed: ${login.status}:${login.body?.error ?? 'unknown'}`);
  }
  const me = await browserFetch(page, '/api/me');
  if (me.status !== 200 || me.body?.user?.role !== 'client') {
    throw new Error(`Unexpected patient identity: ${me.status}:${me.body?.user?.role ?? 'none'}`);
  }
  result.identity = {
    role: me.body.user.role,
    user_id: me.body.user.userId,
    phone: me.body.user.phone,
  };

  const citiesRead = await browserFetch(page, '/api/booking/catalog/cities');
  if (citiesRead.status !== 200 || citiesRead.body?.ok !== true) {
    throw new Error(`Booking cities preflight failed: ${citiesRead.status}`);
  }
  let candidate = null;
  for (const city of citiesRead.body.cities ?? []) {
    const servicesRead = await browserFetch(
      page,
      `/api/booking/catalog/services?cityCode=${encodeURIComponent(city.code)}`,
    );
    if (servicesRead.status !== 200 || servicesRead.body?.ok !== true) continue;
    for (const service of servicesRead.body.services ?? []) {
      const slotsRead = await browserFetch(
        page,
        `/api/booking/slots?type=in_person&branchId=${encodeURIComponent(city.id)}&serviceId=${encodeURIComponent(service.id)}`,
      );
      const slotCount = (slotsRead.body?.slots ?? []).reduce(
        (total, row) => total + (row.slots?.length ?? 0),
        0,
      );
      result.catalog_probe.push({
        city: city.title,
        service: service.title,
        status: slotsRead.status,
        slot_count: slotCount,
      });
      if (!candidate && slotsRead.status === 200 && slotsRead.body?.ok === true && slotCount >= 2) {
        candidate = { city, service };
      }
    }
  }
  if (!candidate) {
    throw new Error('No patient booking catalog entry has two available DEV slots');
  }

  await page.goto(`${baseUrl}/app/patient/booking`);
  await waitForPage(page);
  const formatLink = page.locator(
    `a[href*="/app/patient/booking/service?"][href*="cityCode=${encodeURIComponent(candidate.city.code)}"]`,
  );
  if (!(await formatLink.isVisible().catch(() => false))) {
    throw new Error(`No booking format is available: ${compact(await page.locator('main').innerText())}`);
  }
  result.selection.format = compact(await formatLink.first().innerText());
  await formatLink.first().click();
  await page.waitForURL(/\/app\/patient\/booking\/service\?/);
  await waitForPage(page);

  const serviceButton = page
    .locator('button:has(span.font-medium)')
    .filter({ hasText: candidate.service.title })
    .first();
  if (!(await serviceButton.isVisible().catch(() => false))) {
    throw new Error(`No booking service is available: ${compact(await page.locator('main').innerText())}`);
  }
  result.selection.service = compact(await serviceButton.innerText());
  await serviceButton.click();
  await page.waitForURL(/\/app\/patient\/booking\/slot\?/);
  await waitForPage(page);
  result.selection.initial_slot = await selectSlot(page);
  await waitForPage(page);

  await fillRequiredFields(page);
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/booking/create',
  );
  await page.locator('form button[type="submit"]').click();
  const createResponse = await createResponsePromise;
  const createBody = await jsonBody(createResponse);
  result.create = { status: createResponse.status(), body: createBody };
  bookingId = createBody?.booking?.id ?? null;
  if (createResponse.status() !== 200 || createBody?.ok !== true || !bookingId) {
    throw new Error(`Booking create failed: ${createResponse.status()}:${createBody?.error ?? 'unknown'}`);
  }
  if (createBody.booking.status !== 'confirmed') {
    throw new Error(`Created booking is not immediately manageable: ${createBody.booking.status}`);
  }

  await page.goto(`${baseUrl}/app/patient/booking`);
  await waitForPage(page);
  let bookingCard = page.locator(`[data-booking-id="${bookingId}"]`);
  await bookingCard.waitFor();
  if ((await bookingCard.getAttribute('data-booking-status')) !== 'confirmed') {
    throw new Error('Created booking did not read back as confirmed');
  }
  const createdReadback = await browserFetch(page, '/api/booking/my');
  const createdUpcoming = (createdReadback.body?.upcoming ?? []).find((row) => row.id === bookingId);
  if (createdReadback.status !== 200 || createdUpcoming?.status !== 'confirmed') {
    throw new Error('Created booking is missing from upcoming bookings');
  }

  const reminderPath = `/api/booking/appointments/${encodeURIComponent(
    createBody.booking.canonicalAppointmentId,
  )}/reminders`;
  const reminderBefore = await browserFetch(page, reminderPath);
  const allowedPresetIds = reminderBefore.body?.preference?.allowedPresetIds ?? [];
  if (reminderBefore.status !== 200) {
    throw new Error('Appointment reminder preference is unavailable');
  }
  if (allowedPresetIds.length === 0) {
    result.reminder = { available: false, reason: 'no_allowed_presets' };
  } else {
    const reminderTarget =
      reminderBefore.body.preference.presetId === null ? allowedPresetIds[0] : null;
    const reminderPatch = await browserFetch(page, reminderPath, {
      method: 'PATCH',
      body: JSON.stringify({ presetId: reminderTarget, mutationId: randomUUID() }),
    });
    const reminderAfter = await browserFetch(page, reminderPath);
    result.reminder = {
      available: true,
      before: reminderBefore.body?.preference?.presetId ?? null,
      target: reminderTarget,
      patch_status: reminderPatch.status,
      after: reminderAfter.body?.preference?.presetId ?? null,
    };
    if (
      reminderPatch.status !== 200 ||
      reminderPatch.body?.ok !== true ||
      reminderAfter.status !== 200 ||
      reminderAfter.body?.preference?.presetId !== reminderTarget
    ) {
      throw new Error('Appointment reminder preference did not persist');
    }
  }

  await bookingCard.getByRole('link', { name: 'Перенести' }).click();
  await page.waitForURL(/\/app\/patient\/booking\/slot\?/);
  await waitForPage(page);
  result.selection.rescheduled_slot = await selectSlot(page, createBody.booking.slotStart);
  await waitForPage(page);
  await fillRequiredFields(page);
  const rescheduleResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/booking/reschedule',
  );
  await page.locator('form button[type="submit"]').click();
  const rescheduleResponse = await rescheduleResponsePromise;
  const rescheduleBody = await jsonBody(rescheduleResponse);
  result.reschedule = { status: rescheduleResponse.status(), body: rescheduleBody };
  if (rescheduleResponse.status() !== 200 || rescheduleBody?.ok !== true) {
    throw new Error(
      `Booking reschedule failed: ${rescheduleResponse.status()}:${rescheduleBody?.error ?? 'unknown'}`,
    );
  }

  await page.waitForURL(/\/app\/patient\/booking(?:\?|$)/);
  await waitForPage(page);
  await page.reload();
  await waitForPage(page);
  bookingCard = page.locator(`[data-booking-id="${bookingId}"]`);
  await bookingCard.waitFor();
  if ((await bookingCard.getAttribute('data-booking-status')) !== 'confirmed') {
    throw new Error('Rescheduled booking did not read back as manageable');
  }
  const rescheduledReadback = await browserFetch(page, '/api/booking/my');
  const rescheduledUpcoming = (rescheduledReadback.body?.upcoming ?? []).find(
    (row) => row.id === bookingId,
  );
  if (
    rescheduledReadback.status !== 200 ||
    rescheduledUpcoming?.slotStart !== result.selection.rescheduled_slot.start
  ) {
    throw new Error('Rescheduled booking is missing from upcoming bookings at its new time');
  }

  page.once('dialog', (dialog) => void dialog.accept());
  const cancelResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/booking/cancel',
  );
  await bookingCard.getByRole('button', { name: 'Отменить' }).click();
  const cancelResponse = await cancelResponsePromise;
  const cancelBody = await jsonBody(cancelResponse);
  result.cancel = { status: cancelResponse.status(), body: cancelBody };
  if (cancelResponse.status() !== 200 || cancelBody?.ok !== true) {
    throw new Error(`Booking cancel failed: ${cancelResponse.status()}:${cancelBody?.error ?? 'unknown'}`);
  }
  cancelled = true;

  await page.waitForTimeout(500);
  await page.reload();
  await waitForPage(page);
  const bookingsReadback = await browserFetch(page, '/api/booking/my');
  const finalUpcoming = (bookingsReadback.body?.upcoming ?? []).find((row) => row.id === bookingId);
  const finalHistory = (bookingsReadback.body?.history ?? []).find((row) => row.id === bookingId);
  result.readback = {
    created_in_upcoming: true,
    rescheduled_in_upcoming: true,
    cancelled_absent_from_upcoming: finalUpcoming === undefined,
    cancelled_in_history: finalHistory?.status === 'cancelled',
  };
  if (
    bookingsReadback.status !== 200 ||
    finalUpcoming !== undefined ||
    finalHistory?.status !== 'cancelled'
  ) {
    throw new Error(
      `Cancelled booking history mismatch: upcoming=${finalUpcoming?.status ?? 'missing'}, history=${finalHistory?.status ?? 'missing'}`,
    );
  }

  if (result.console_errors.length || result.failed_responses.length) {
    throw new Error(
      `Browser evidence is not clean: console=${result.console_errors.length}, http=${result.failed_responses.length}`,
    );
  }
  result.complete = true;
} catch (error) {
  result.error = compact(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (bookingId && !cancelled) {
    result.recovery_cancel = await browserFetch(page, '/api/booking/cancel', {
      method: 'POST',
      body: JSON.stringify({ bookingId, reason: 'DEV audit recovery cleanup' }),
    }).catch((error) => ({ status: 0, body: { error: compact(error) } }));
  }
  result.finished_at = new Date().toISOString();
  mkdirSync(outDir, { recursive: true });
  const path = `${outDir}/patient-booking-lifecycle-${result.finished_at.replace(/[:.]/g, '-')}.json`;
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ complete: result.complete, path, error: result.error ?? null }));
  await browser.close();
}
