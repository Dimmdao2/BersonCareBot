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
  return String(value).replace(/\s+/gu, ' ').slice(0, 800);
}

function moscowDateAfter(days) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + days * 86_400_000));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function login(context, email) {
  const response = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
    headers: { Origin: baseUrl },
    data: { email, password },
  });
  const body = await response.json().catch(() => null);
  if (response.status() !== 200 || body?.ok !== true) {
    throw new Error(`login_failed:${email}:${response.status()}`);
  }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined);
}

async function runStep(page, name, action) {
  const observed = { apiErrors: [], pageErrors: [] };
  const onResponse = (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      const url = new URL(response.url());
      observed.apiErrors.push(
        `${response.request().method()} ${url.pathname}${url.search} ${response.status()}`,
      );
    }
  };
  const onPageError = (error) => observed.pageErrors.push(concise(error.message));
  page.on('response', onResponse);
  page.on('pageerror', onPageError);
  const startedAt = Date.now();
  try {
    const detail = await action();
    results.push({
      name,
      pass: observed.apiErrors.length === 0 && observed.pageErrors.length === 0,
      durationMs: Date.now() - startedAt,
      ...observed,
      detail,
    });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    results.push({
      name,
      pass: false,
      durationMs: Date.now() - startedAt,
      ...observed,
      error: concise(error instanceof Error ? error.message : error),
      route: new URL(page.url()).pathname,
      body: concise(body.slice(-2_000)),
    });
  } finally {
    page.off('response', onResponse);
    page.off('pageerror', onPageError);
    process.stdout.write(`${name}: ${results.at(-1)?.pass ? 'PASS' : 'FAIL'}\n`);
    writeFileSync(
      resolve(outputDirectory, 'flows-checkpoint.json'),
      `${JSON.stringify({ marker, results }, null, 2)}\n`,
    );
  }
}

mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'ru-RU',
});

try {
  await login(context, 'dimmdao@yandex.ru');
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);

  const clientLastName = 'Проверка';
  const clientFirstName = 'Системная';
  let clientId = null;
  const ownerPatientId = 'f81bf8fb-aed6-427a-9523-5c311f7b5789';
  let targetPatientId = ownerPatientId;
  let programTitle = `${marker} program`;
  let programRoute = null;
  let appointmentId = null;
  const patientFileName = `${marker.replaceAll(/[^a-zA-Z0-9-]/gu, '-')}-patient.txt`;

  await runStep(page, 'task:cleanup-acceptance', async () => {
    await page.goto(`${baseUrl}/app/doctor/tasks`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    let completed = 0;
    for (;;) {
      const task = page.getByText(/ACCEPTANCE .* task/u).first();
      if (!(await task.count()) || !(await task.isVisible().catch(() => false))) break;
      await task.click();
      const complete = page.getByRole('button', { name: 'Выполнить', exact: true }).last();
      await complete.click();
      await page.waitForTimeout(350);
      completed += 1;
      if (completed > 20) throw new Error('unexpected_acceptance_task_count');
    }
    return { completed };
  });

  await runStep(page, 'client:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/patients`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /Новый (клиент|пациент)/u }).first().click();
    await page.locator('#doctor-new-client-last-name').fill(clientLastName);
    await page.locator('#doctor-new-client-first-name').fill(clientFirstName);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/doctor/clients'),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Создать', exact: true }).last().click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`client_create_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    await page.waitForURL(/\/app\/doctor\/patients\/[0-9a-f-]+/u, { timeout: 30_000 });
    await settle(page);
    clientId = new URL(page.url()).pathname.split('/').at(-1) ?? null;
    if (!clientId || !/^[0-9a-f-]{36}$/u.test(clientId)) throw new Error('client_id_not_observed');
    targetPatientId = clientId;
    await page.getByText(clientLastName, { exact: false }).first().waitFor({ timeout: 30_000 });
    return { clientId, route: new URL(page.url()).pathname };
  });

  await runStep(page, 'program:assign-blank', async () => {
    await page.goto(`${baseUrl}/app/doctor/patients/${targetPatientId}`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(page);
    await page.getByRole('button', { name: 'Программа', exact: true }).click();
    await page.getByRole('button', { name: 'Назначить программу лечения', exact: true }).click();
    await page.getByRole('radio', { name: 'Пустой план' }).click();
    await page.getByLabel('Название программы, необязательно').fill(programTitle);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/doctor/clients/${targetPatientId}/treatment-program-instances`),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Создать пустой план', exact: true }).click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`program_assign_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    await page.getByText(programTitle, { exact: true }).waitFor({ timeout: 12_000 });
    programRoute = await page.getByRole('link', { name: programTitle, exact: true }).getAttribute('href');
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'program:complete', async () => {
    if (!programRoute) throw new Error('program_assign_did_not_produce_route');
    await page.goto(`${baseUrl}${programRoute}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Завершить программу лечения', exact: true }).click();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/api/doctor/treatment-program-instances/'),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Завершить программу', exact: true }).click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`program_complete_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'patient-file:upload', async () => {
    await page.goto(`${baseUrl}/app/doctor/patients/${targetPatientId}`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(page);
    await page.getByRole('button', { name: 'Файлы', exact: true }).click();
    await page.getByTitle('Загрузить файл').click();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/doctor/patients/${targetPatientId}/files`),
      { timeout: 12_000 },
    );
    await page.locator('#upload-file-input').setInputFiles({
      name: patientFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`${marker}\n`, 'utf8'),
    });
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`patient_file_init_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    await page.getByText(patientFileName, { exact: false }).first().waitFor({ timeout: 30_000 });
    return { route: new URL(page.url()).pathname, patientFileName };
  });

  await runStep(page, 'patient-file:delete', async () => {
    if (!(await page.getByText(patientFileName, { exact: false }).count())) {
      throw new Error('upload_did_not_produce_file');
    }
    await page.getByText(patientFileName, { exact: false }).first().click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    const confirm = page.getByRole('button', { name: /Удалить/u }).last();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes(`/api/doctor/patients/${targetPatientId}/files/`),
      { timeout: 12_000 },
    );
    await confirm.click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`patient_file_delete_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Файлы', exact: true }).click();
    if (await page.getByText(patientFileName, { exact: false }).count()) {
      throw new Error('deleted_patient_file_still_visible_after_reload');
    }
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'appointment:create', async () => {
    await page.goto(`${baseUrl}/app/doctor/schedule`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: '+ Создать запись', exact: true }).click();
    const patientSearch = page.getByPlaceholder('Имя или телефон…');
    const patientQuery = clientId ? clientLastName : 'Дмитрий Берсон';
    await patientSearch.fill(patientQuery);
    const patientOption = page.getByRole('option').filter({ hasText: patientQuery }).first();
    await patientOption.waitFor({ timeout: 12_000 });
    await patientOption.click();
    await page.getByRole('button', { name: 'Выберите дату и время', exact: true }).click();
    const appointmentDate = moscowDateAfter(1);
    const availableDay = page.locator(
      `.rdp-day[data-day="${appointmentDate}"] .rdp-day_button:visible:not([disabled])`,
    );
    await availableDay.click();
    await page.getByRole('option', { name: '20:00', exact: true }).click();
    await page.keyboard.press('Escape');
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/doctor/booking-engine/appointments/manual'),
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).last().click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    appointmentId = responseBody?.appointment?.id ?? null;
    if (!response.ok() || responseBody?.ok !== true || !appointmentId) {
      throw new Error(`appointment_create_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    await page.getByTestId('create-appointment-btn').waitFor({ timeout: 12_000 });
    return { appointmentId, appointmentDate, route: new URL(page.url()).pathname };
  });

  await runStep(page, 'appointment:cancel', async () => {
    if (!appointmentId) throw new Error('appointment_create_failed');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Список', exact: true }).click();
    const row = page.getByText(clientLastName, { exact: false }).first();
    await row.waitFor({ timeout: 30_000 });
    await row.click();
    await page.getByRole('button', { name: 'Отменить', exact: true }).first().click();
    const reason = page.getByRole('combobox').filter({ hasText: /Причина|Выберите/u }).last();
    if (await reason.count()) {
      await reason.click();
      await page.getByRole('option').first().click();
    }
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/appointments/${appointmentId}/manual-cancel`),
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: /Подтвердить отмену|Отменить запись/u }).last().click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`appointment_cancel_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    return { route: new URL(page.url()).pathname };
  });

  await runStep(page, 'client:archive', async () => {
    if (!clientId) return { skipped: 'client_create_failed' };
    await page.goto(`${baseUrl}/app/doctor/patients/${clientId}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Учётка', exact: true }).click();
    await page.getByRole('button', { name: 'В архив', exact: true }).click();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/doctor/clients/${clientId}/archive`),
      { timeout: 12_000 },
    );
    await page.getByRole('button', { name: 'Да', exact: true }).click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.ok !== true) {
      throw new Error(`client_archive_failed:${response.status()}:${JSON.stringify(responseBody)}`);
    }
    await page.getByRole('button', { name: 'Вернуть из архива', exact: true }).waitFor({ timeout: 30_000 });
    return { clientId, route: new URL(page.url()).pathname };
  });
} finally {
  await context.close();
  await browser.close();
}

const artifact = resolve(outputDirectory, `flows-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeFileSync(artifact, `${JSON.stringify({ marker, results }, null, 2)}\n`);
process.stdout.write(`artifact=${artifact}\n`);
if (results.some((result) => !result.pass)) process.exitCode = 1;
