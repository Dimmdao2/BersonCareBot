#!/usr/bin/env node

import { chromium } from '../dev-interactive-audit/lib/browser.mjs';

const baseUrl = process.env.TEST_ACCEPTANCE_BASE_URL || 'https://test.bersoncare.ru';
const password = process.env.TEST_ACCEPTANCE_PASSWORD || '';
const patientId = process.argv[2] || '9278b8ef-c355-4b30-bb58-c23b4b71272e';

if (!password) throw new Error('TEST_ACCEPTANCE_PASSWORD is required');
if (!['http://127.0.0.1:5200', 'https://test.bersoncare.ru'].includes(new URL(baseUrl).origin)) {
  throw new Error('TEST_ACCEPTANCE_BASE_URL must target canonical DEV or TEST');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });

try {
  const login = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
    headers: { Origin: baseUrl },
    data: { email: 'dimmdao@yandex.ru', password },
  });
  if (!login.ok()) throw new Error(`login_failed:${login.status()}`);

  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const failures = [];
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failures.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`);
    }
  });

  await page.goto(`${baseUrl}/app/doctor/patients/${patientId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Новый визит/u }).click();
  await page.getByRole('button', { name: 'Создать без записи', exact: true }).click();
  const primaryVisitButton = page.getByRole('button', { name: 'Первичный', exact: true });
  if (!(await primaryVisitButton.isVisible().catch(() => false))) {
    const body = await page.locator('body').innerText();
    const buttons = await page.getByRole('button').allInnerTexts();
    throw new Error(`visit_panel_not_open:${JSON.stringify({ buttons, body: body.slice(-1500) })}`);
  }
  await primaryVisitButton.click();

  const locationInput = page.getByPlaceholder('Место приёма');
  if (await locationInput.isVisible().catch(() => false)) {
    await locationInput.fill('Онлайн');
  } else {
    const selects = page.getByRole('combobox');
    await selects.nth(0).click();
    await page.getByRole('option', { name: 'Другое...', exact: true }).click();
    await locationInput.fill('Онлайн');
  }

  const serviceInput = page.getByPlaceholder('Услуга');
  if (await serviceInput.isVisible().catch(() => false)) {
    await serviceInput.fill('Приём');
  } else {
    const selects = page.getByRole('combobox');
    await selects.last().click();
    await page.getByRole('option', { name: 'Другое...', exact: true }).click();
    await serviceInput.fill('Приём');
  }

  await page.getByPlaceholder('Симптом…').fill('Проверочная жалоба');
  await page.getByPlaceholder('Данные объективного осмотра…').fill('Проверочный осмотр');
  await page.getByPlaceholder('Проведённые манипуляции…').fill('Проверочная манипуляция');
  await page.getByPlaceholder('Динамика / результат…').fill('Проверочный результат');
  await page.getByPlaceholder('Рекомендации / назначения…').fill('Проверочная рекомендация');

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/doctor/patients/${patientId}/visits`,
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Сохранить визит', exact: true }).click();
  const response = await responsePromise;
  const body = await response.text();
  process.stdout.write(`${JSON.stringify({ status: response.status(), body, failures }, null, 2)}\n`);
  if (!response.ok()) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
