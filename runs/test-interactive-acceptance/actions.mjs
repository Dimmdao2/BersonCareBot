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
  return String(value).replace(/\s+/gu, ' ').slice(0, 500);
}

async function login(context, email) {
  const response = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
    headers: { Origin: baseUrl },
    data: { email, password },
  });
  const body = await response.json().catch(() => null);
  if (response.status() !== 200 || body?.ok !== true) throw new Error(`login_failed:${email}:${response.status()}`);
}

async function runStep(page, name, action) {
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
  const startedAt = Date.now();
  try {
    const detail = await action();
    results.push({ name, pass: observed.apiErrors.length === 0 && observed.pageErrors.length === 0, durationMs: Date.now() - startedAt, ...observed, detail });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    results.push({
      name,
      pass: false,
      durationMs: Date.now() - startedAt,
      ...observed,
      error: concise(error instanceof Error ? error.message : error),
      route: new URL(page.url()).pathname,
      body: concise(body.slice(-1_500)),
    });
  } finally {
    page.off('response', onResponse);
    page.off('pageerror', onPageError);
    process.stdout.write(`${name}: ${results.at(-1)?.pass ? 'PASS' : 'FAIL'}\n`);
    writeFileSync(resolve(outputDirectory, 'actions-checkpoint.json'), `${JSON.stringify({ marker, results }, null, 2)}\n`);
  }
}

async function waitForSettled(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
}

mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });

try {
  await login(context, 'dimmdao@yandex.ru');
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  let clinicalTestRoute = null;
  let recommendationRoute = null;
  let lfkTemplateRoute = null;
  let testSetRoute = null;
  let treatmentTemplateRoute = null;
  const taskTitle = `${marker} task`;
  const uploadName = `${marker.replaceAll(/[^a-zA-Z0-9-]/gu, '-')}.txt`;

  await runStep(page, 'exercise:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/exercises/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('#ex-title').fill(`${marker} exercise`);
    await page.getByRole('button', { name: 'Создать упражнение' }).click();
    await page.waitForURL(/\/app\/doctor\/exercises\/[0-9a-f-]+$/u, { timeout: 30_000 });
    await waitForSettled(page);
    if (!await page.locator('#ex-title').inputValue().then((value) => value.includes(marker))) throw new Error('created_title_not_visible');
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'exercise:update', async () => {
    await page.locator('#ex-desc').fill(`${marker} updated`);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === new URL(page.url()).pathname,
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const response = await responsePromise;
    if (response.status() < 200 || response.status() >= 400) {
      throw new Error(`exercise_update_failed:${response.status()}`);
    }
    await waitForSettled(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (await page.locator('#ex-desc').inputValue() !== `${marker} updated`) throw new Error('updated_value_not_persisted');
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'exercise:archive', async () => {
    await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
    await waitForSettled(page);
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'clinical-test:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/clinical-tests/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('#ct-title').fill(`${marker} clinical test`);
    await page.getByRole('button', { name: 'Создать тест', exact: true }).click();
    await page.waitForURL(/\/app\/doctor\/clinical-tests\/[0-9a-f-]+$/u, { timeout: 30_000 });
    await waitForSettled(page);
    clinicalTestRoute = new URL(page.url()).pathname;
    return { route: clinicalTestRoute };
  });

  await runStep(page, 'clinical-test:archive', async () => {
    if (!clinicalTestRoute) throw new Error('create_did_not_produce_route');
    await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
    await waitForSettled(page);
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'recommendation:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/recommendations/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('#rec-title').fill(`${marker} recommendation`);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.waitForURL(/\/app\/doctor\/recommendations\/[0-9a-f-]+$/u, { timeout: 30_000 });
    await waitForSettled(page);
    recommendationRoute = new URL(page.url()).pathname;
    return { route: recommendationRoute };
  });

  await runStep(page, 'recommendation:archive', async () => {
    if (!recommendationRoute) throw new Error('create_did_not_produce_route');
    await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
    await waitForSettled(page);
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'lfk-complex:create-draft', async () => {
    await page.goto(`${baseUrl}/app/doctor/lfk-templates/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('input:visible').first().fill(`${marker} lfk complex`);
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await page.waitForURL(/\/app\/doctor\/lfk-templates(?:\/[0-9a-f-]+|\?selected=[0-9a-f-]+)$/u, {
      timeout: 30_000,
    });
    await waitForSettled(page);
    lfkTemplateRoute = new URL(page.url()).pathname;
    return { route: lfkTemplateRoute };
  });

  await runStep(page, 'lfk-complex:archive', async () => {
    if (!lfkTemplateRoute) throw new Error('create_did_not_produce_route');
    await page.getByRole('button', { name: /Архивировать(?: комплекс)?/u }).click();
    await waitForSettled(page);
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'test-set:create-draft', async () => {
    await page.goto(`${baseUrl}/app/doctor/test-sets/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('input:visible').first().fill(`${marker} test set`);
    await page.getByRole('button', { name: 'Создать черновик', exact: true }).click();
    await page.waitForURL(/\/app\/doctor\/test-sets\/[0-9a-f-]+$/u, { timeout: 30_000 });
    await waitForSettled(page);
    testSetRoute = new URL(page.url()).pathname;
    return { route: testSetRoute };
  });

  await runStep(page, 'test-set:archive', async () => {
    if (!testSetRoute) throw new Error('create_did_not_produce_route');
    await page.getByRole('button', { name: /Архивировать(?: набор)?/u }).click();
    await waitForSettled(page);
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'treatment-program-template:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/treatment-program-templates/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('#tpl-title').fill(`${marker} treatment template`);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.waitForURL(/\/app\/doctor\/treatment-program-templates\/[0-9a-f-]+$/u, { timeout: 30_000 });
    await waitForSettled(page);
    treatmentTemplateRoute = new URL(page.url()).pathname;
    return { route: treatmentTemplateRoute };
  });

  await runStep(page, 'treatment-program-template:archive-or-delete', async () => {
    if (!treatmentTemplateRoute) throw new Error('create_did_not_produce_route');
    const button = page.getByRole('button', { name: /Архивировать|Удалить/u }).first();
    await button.click();
    await waitForSettled(page);
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'task:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/tasks`, { waitUntil: 'domcontentloaded' });
    await page.locator('button:visible').filter({ hasText: 'Новая задача' }).click();
    await page.locator('input[placeholder="Кратко"]:visible').fill(taskTitle);
    const save = page.locator('button:visible').filter({ hasText: 'Сохранить' }).last();
    await save.click();
    await page.getByText(taskTitle, { exact: true }).waitFor({ timeout: 30_000 });
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'task:complete', async () => {
    await page.getByRole('button', { name: taskTitle, exact: false }).click();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/doctor\/tasks\/[0-9a-f-]+\/complete$/u.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    await page.locator('button:visible').filter({ hasText: 'Выполнить' }).last().click();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`task_complete_failed:${response.status()}`);
    await page.getByRole('button', { name: taskTitle, exact: false }).waitFor({ state: 'detached' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (await page.getByRole('button', { name: taskTitle, exact: false }).count()) {
      throw new Error('completed_task_still_visible_after_reload');
    }
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'media:upload', async () => {
    await page.goto(`${baseUrl}/app/doctor/content/library`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="file"]').first().setInputFiles({
      name: uploadName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`${marker}\n`, 'utf8'),
    });
    await page.getByText(uploadName, { exact: false }).first().waitFor({ timeout: 30_000 });
    return { route: new URL(page.url()).pathname, uploadName };
  });

  await runStep(page, 'media:delete', async () => {
    const card = page.locator('article').filter({ hasText: uploadName }).first();
    await card.getByRole('button', { name: 'Действия и сведения' }).click();
    await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        /\/api\/admin\/media\/[0-9a-f-]+$/u.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`media_delete_failed:${response.status()}`);
    await page.getByText(uploadName, { exact: false }).waitFor({ state: 'detached', timeout: 30_000 });
    return { route: new URL(page.url()).pathname };
  });
} finally {
  await context.close();
  await browser.close();
}

const artifact = resolve(outputDirectory, `actions-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeFileSync(artifact, `${JSON.stringify({ marker, results }, null, 2)}\n`);
process.stdout.write(`artifact=${artifact}\n`);
if (results.some((result) => !result.pass)) process.exitCode = 1;
