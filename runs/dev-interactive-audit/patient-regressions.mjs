#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../clickthrough/lib/browser.mjs';

const baseUrl = 'http://127.0.0.1:5200';
const password = process.env.DEV_AUDIT_PASSWORD ?? '';
const email = process.env.DEV_AUDIT_PATIENT_EMAIL ?? 'kinesiospace@gmail.com';
const outDir = 'runs/dev-interactive-audit/out';

if (!password) throw new Error('DEV_AUDIT_PASSWORD is required');

const result = {
  started_at: new Date().toISOString(),
  complete: false,
  chat: null,
  exercise_comment: null,
  warmup: null,
  reminder_schedule: null,
  console_errors: [],
  failed_responses: [],
  failed_requests: [],
};

function compact(value) {
  return String(value).replace(/\s+/g, ' ').slice(0, 500);
}

async function waitForPage(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

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
page.on('requestfailed', (request) => {
  result.failed_requests.push({
    method: request.method(),
    url: request.url(),
    error: compact(request.failure()?.errorText ?? 'unknown_request_failure'),
  });
});

try {
  await page.goto(`${baseUrl}/app`);
  const login = await browserFetch(page, '/api/auth/email-password/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200 || login.body?.ok !== true) throw new Error('patient_login_failed');

  await page.goto(`${baseUrl}/app/patient/messages`);
  await waitForPage(page);
  const textarea = page.getByRole('textbox', { name: 'Текст сообщения' });
  await textarea.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  if (!(await textarea.isVisible().catch(() => false))) {
    const readOnly = await page.getByTestId('patient-messages-readonly-notice').isVisible().catch(() => false);
    throw new Error(readOnly ? 'patient_chat_read_only' : 'patient_chat_composer_missing');
  }
  const chatText = `DEV audit patient chat ${new Date().toISOString()}`;
  await textarea.fill(chatText);
  const sendResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/patient/messages',
  );
  await page.getByRole('button', { name: 'Отправить' }).click();
  const sendResponse = await sendResponsePromise;
  const sendBody = await sendResponse.json().catch(() => null);
  await page.getByText(chatText, { exact: true }).waitFor();
  const conversationId = sendBody?.message?.conversationId ?? null;
  if (sendResponse.status() !== 200 || sendBody?.ok !== true || !conversationId) {
    throw new Error(`patient_chat_send_failed:${sendResponse.status()}:${sendBody?.error ?? 'unknown'}`);
  }
  const chatReadback = await browserFetch(
    page,
    `/api/patient/messages?conversationId=${encodeURIComponent(conversationId)}`,
  );
  const persistedMessage = (chatReadback.body?.messages ?? []).find(
    (message) => message.text === chatText,
  );
  result.chat = {
    send_status: sendResponse.status(),
    visible_after_send: true,
    persisted_after_readback: Boolean(persistedMessage),
  };
  if (chatReadback.status !== 200 || !persistedMessage) {
    throw new Error('patient_chat_message_missing_after_readback');
  }

  await page.goto(`${baseUrl}/app/patient/treatment`);
  await waitForPage(page);
  let itemLink = page
    .locator('a[href*="/app/patient/treatment/"][href*="/item/"]:visible')
    .first();
  if (!(await itemLink.isVisible().catch(() => false))) {
    const instanceLink = page
      .locator('a[href^="/app/patient/treatment/"]:not([href*="/item/"]):visible')
      .first();
    if (!(await instanceLink.isVisible().catch(() => false))) {
      throw new Error('patient_program_instance_link_missing');
    }
    await instanceLink.click();
    await waitForPage(page);
    itemLink = page
      .locator('a[href*="/app/patient/treatment/"][href*="/item/"]:visible')
      .first();
  }
  if (!(await itemLink.isVisible().catch(() => false))) {
    throw new Error('patient_program_item_link_missing');
  }
  const itemHref = await itemLink.getAttribute('href');
  const itemMatch =
    itemHref && /^\/app\/patient\/treatment\/([^/?]+)\/item\/([^/?]+)/.exec(itemHref);
  if (!itemMatch) throw new Error('patient_program_item_link_invalid');
  const discussionPath = `/api/patient/treatment-program-instances/${encodeURIComponent(itemMatch[1])}/items/${encodeURIComponent(itemMatch[2])}/discussion`;
  const commentText = `DEV audit exercise comment ${new Date().toISOString()}`;
  const commentPost = await browserFetch(page, discussionPath, {
    method: 'POST',
    body: JSON.stringify({ body: commentText }),
  });
  if (commentPost.status !== 200 || commentPost.body?.ok !== true) {
    throw new Error(
      `patient_exercise_comment_send_failed:${commentPost.status}:${commentPost.body?.error ?? 'unknown'}`,
    );
  }
  const commentReadback = await browserFetch(page, `${discussionPath}?limit=50&direction=backward`);
  const persistedComment = (commentReadback.body?.messages ?? []).find(
    (message) => message.body === commentText,
  );
  result.exercise_comment = {
    send_status: commentPost.status,
    persisted_after_readback: Boolean(persistedComment),
  };
  if (commentReadback.status !== 200 || !persistedComment) {
    throw new Error('patient_exercise_comment_missing_after_readback');
  }

  const warmupResponse = await page.goto(`${baseUrl}/app/patient/go/daily-warmup`);
  await waitForPage(page);
  result.warmup = {
    status: warmupResponse?.status() ?? null,
    final_url: page.url().replace(baseUrl, ''),
    content_opened: /\/app\/patient\/content\//.test(page.url()),
  };
  if (warmupResponse?.status() !== 200 || !result.warmup.content_opened) {
    throw new Error(`patient_warmup_open_failed:${warmupResponse?.status() ?? 'no_response'}:${page.url()}`);
  }

  await page.goto(`${baseUrl}/app/patient/reminders`);
  await waitForPage(page);
  const reminderSwitches = page.getByRole('switch');
  const switchCount = await reminderSwitches.count();
  if (switchCount === 0) throw new Error('patient_reminder_switch_missing');
  const reminderSwitch = reminderSwitches.first();
  const label = await reminderSwitch.getAttribute('aria-label');
  const before = await reminderSwitch.getAttribute('aria-checked');
  const firstPatchPromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname.startsWith('/api/patient/reminders/'),
  );
  await reminderSwitch.click();
  const firstPatch = await firstPatchPromise;
  const firstBody = await firstPatch.json().catch(() => null);
  if (firstPatch.status() !== 200 || firstBody?.ok !== true) {
    throw new Error(`patient_reminder_patch_failed:${firstPatch.status()}:${firstBody?.error ?? 'unknown'}`);
  }
  await page.reload();
  await waitForPage(page);
  const persistedSwitch = label
    ? page.getByRole('switch', { name: label }).first()
    : page.getByRole('switch').first();
  const after = await persistedSwitch.getAttribute('aria-checked');
  if (after === before) throw new Error('patient_reminder_toggle_did_not_persist');

  const restorePatchPromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname.startsWith('/api/patient/reminders/'),
  );
  await persistedSwitch.click();
  const restorePatch = await restorePatchPromise;
  const restoreBody = await restorePatch.json().catch(() => null);
  if (restorePatch.status() !== 200 || restoreBody?.ok !== true) {
    throw new Error('patient_reminder_restore_failed');
  }
  result.reminder_schedule = {
    label,
    patch_status: firstPatch.status(),
    persisted: true,
    restored: true,
  };

  if (result.console_errors.length || result.failed_responses.length) {
    throw new Error(
      `Browser evidence is not clean: console=${result.console_errors.length}, http=${result.failed_responses.length}`,
    );
  }
  result.complete = true;
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  result.finished_at = new Date().toISOString();
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}/patient-regressions-${result.finished_at.replaceAll(':', '-')}.json`;
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
  console.log(JSON.stringify({ complete: result.complete, path: file, error: result.error ?? null }));
  if (!result.complete) process.exitCode = 1;
}
