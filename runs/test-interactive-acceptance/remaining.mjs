#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '../dev-interactive-audit/lib/browser.mjs';

const baseUrl = process.env.TEST_ACCEPTANCE_BASE_URL || 'https://test.bersoncare.ru';
const password = process.env.TEST_ACCEPTANCE_PASSWORD || '';
const outputDirectory = resolve(import.meta.dirname, 'out');
const marker = `ACCEPTANCE ${new Date().toISOString().replaceAll(':', '-')}`;
const results = [];

if (!password) throw new Error('TEST_ACCEPTANCE_PASSWORD is required');
if (!['http://127.0.0.1:5200', 'https://test.bersoncare.ru'].includes(new URL(baseUrl).origin)) {
  throw new Error('TEST_ACCEPTANCE_BASE_URL must target canonical DEV or TEST');
}

function concise(value) {
  return String(value).replace(/\s+/gu, ' ').slice(0, 900);
}

async function login(context, email) {
  const response = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
    headers: { Origin: baseUrl },
    data: { email, password },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok() || body?.ok !== true) throw new Error(`login_failed:${email}:${response.status()}`);
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined);
}

async function step(page, name, action) {
  const observed = { apiErrors: [], pageErrors: [] };
  const onResponse = (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      const url = new URL(response.url());
      observed.apiErrors.push(`${response.request().method()} ${url.pathname}${url.search} ${response.status()}`);
    }
  };
  const onPageError = (error) => observed.pageErrors.push(concise(error.message));
  page.on('response', onResponse);
  page.on('pageerror', onPageError);
  try {
    const detail = await action();
    results.push({ name, pass: observed.apiErrors.length === 0 && observed.pageErrors.length === 0, ...observed, detail });
  } catch (error) {
    results.push({
      name,
      pass: false,
      ...observed,
      error: concise(error instanceof Error ? error.message : error),
      route: new URL(page.url()).pathname,
      body: concise(await page.locator('body').innerText().catch(() => '')),
    });
  } finally {
    page.off('response', onResponse);
    page.off('pageerror', onPageError);
    process.stdout.write(`${name}: ${results.at(-1)?.pass ? 'PASS' : 'FAIL'}\n`);
    writeFileSync(resolve(outputDirectory, 'remaining-checkpoint.json'), `${JSON.stringify({ marker, results }, null, 2)}\n`);
  }
}

mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });

try {
  await login(context, 'dimmdao@yandex.ru');
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  let appointmentId = null;

  await step(page, 'appointment:create-existing-patient', async () => {
    await page.goto(`${baseUrl}/app/doctor/schedule`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: '+ Создать запись', exact: true }).click();
    const patientSearch = page.getByPlaceholder('Имя или телефон…');
    await patientSearch.fill('Альмендингер');
    const patientOption = page.getByRole('option').filter({ hasText: 'Альмендингер Ольга' }).first();
    await patientOption.waitFor({ timeout: 12_000 });
    await patientOption.click();
    await page.getByRole('button', { name: 'Выберите дату и время', exact: true }).click();
    const day = page.locator('button[data-day]:visible:not([disabled])').last();
    const pickedDay = await day.getAttribute('data-day');
    await day.click();
    const time = page.getByRole('button', { name: '20:00', exact: true });
    if (await time.count()) await time.click();
    else await page.locator('button:visible').filter({ hasText: /^20:/u }).first().click();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/doctor/booking-engine/appointments/manual'),
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).last().click();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    appointmentId = body?.appointment?.id ?? null;
    if (!response.ok() || body?.ok !== true || !appointmentId) {
      throw new Error(`appointment_create_failed:${response.status()}:${JSON.stringify(body)}`);
    }
    return { appointmentId, pickedDay };
  });

  await step(page, 'appointment:cancel-created', async () => {
    if (!appointmentId) throw new Error('create_did_not_produce_appointment');
    await page.getByRole('button', { name: 'Список', exact: true }).click();
    const row = page.locator(`[data-testid="list-appt-${appointmentId}"]`);
    await row.waitFor({ timeout: 15_000 });
    await row.click();
    await page.getByRole('button', { name: /Отменить/u }).first().click();
    const reasonTrigger = page.getByRole('combobox').last();
    if (await reasonTrigger.isVisible().catch(() => false)) {
      await reasonTrigger.click();
      await page.getByRole('option').first().click();
    }
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes(`/appointments/${appointmentId}`) && response.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /Подтвердить|Отменить запись/u }).last().click();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    if (!response.ok() || body?.ok !== true) {
      throw new Error(`appointment_cancel_failed:${response.status()}:${JSON.stringify(body)}`);
    }
    return { appointmentId };
  });

  await step(page, 'chat:send-owner-message', async () => {
    await page.goto(`${baseUrl}/app/doctor/communications`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.locator('button:visible').filter({ hasText: 'Берсон Дмитрий' }).last().click();
    const message = `${marker} проверка чата`;
    await page.getByLabel('Текст ответа').fill(message);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && /\/api\/doctor\/messages\/[0-9a-f-]+$/u.test(new URL(response.url()).pathname),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    if (!response.ok() || body?.ok !== true) {
      throw new Error(`chat_send_failed:${response.status()}:${JSON.stringify(body)}`);
    }
    await page.getByText(message, { exact: true }).waitFor({ timeout: 12_000 });
    return { message };
  });

  await step(page, 'lfk-complex:create-draft', async () => {
    await page.goto(`${baseUrl}/app/doctor/lfk-templates/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('input:visible').first().fill(`${marker} lfk complex`);
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/api/doctor/lfk-templates'),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    if (!response.ok() || body?.ok !== true) throw new Error(`lfk_create_failed:${response.status()}:${JSON.stringify(body)}`);
    await page.waitForURL(/\/app\/doctor\/lfk-templates\/[0-9a-f-]+$/u, { timeout: 12_000 });
    return { route: new URL(page.url()).pathname };
  });

  await step(page, 'lfk-complex:archive', async () => {
    if (!/\/lfk-templates\/[0-9a-f-]+$/u.test(new URL(page.url()).pathname)) throw new Error('lfk_not_created');
    await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
    await settle(page);
    return { route: new URL(page.url()).pathname };
  });

  await step(page, 'test-set:create-draft', async () => {
    await page.goto(`${baseUrl}/app/doctor/test-sets/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('input:visible').first().fill(`${marker} test set`);
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/api/doctor/test-sets'),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Создать черновик', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    if (!response.ok() || body?.ok !== true) throw new Error(`test_set_create_failed:${response.status()}:${JSON.stringify(body)}`);
    await page.waitForURL(/\/app\/doctor\/test-sets\/[0-9a-f-]+$/u, { timeout: 12_000 });
    return { route: new URL(page.url()).pathname };
  });

  await step(page, 'test-set:archive', async () => {
    if (!/\/test-sets\/[0-9a-f-]+$/u.test(new URL(page.url()).pathname)) throw new Error('test_set_not_created');
    await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
    await settle(page);
    return { route: new URL(page.url()).pathname };
  });
} finally {
  await context.close();
  await browser.close();
}

const artifact = resolve(outputDirectory, `remaining-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeFileSync(artifact, `${JSON.stringify({ marker, results }, null, 2)}\n`);
process.stdout.write(`artifact=${artifact}\n`);
if (results.some((result) => !result.pass)) process.exitCode = 1;
