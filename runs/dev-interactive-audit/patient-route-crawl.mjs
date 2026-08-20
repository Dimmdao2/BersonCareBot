#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../clickthrough/lib/browser.mjs';

const baseUrl = 'http://127.0.0.1:5200';
const password = process.env.DEV_AUDIT_PASSWORD ?? '';
const email = process.env.DEV_AUDIT_PATIENT_EMAIL ?? 'kinesiospace@gmail.com';
const outDir = 'runs/dev-interactive-audit/out';
const maxRoutes = Math.max(1, Number(process.env.DEV_AUDIT_MAX_ROUTES ?? 80));
const workerCount = Math.max(1, Number(process.env.DEV_AUDIT_WORKERS ?? 2));

if (!password) throw new Error('DEV_AUDIT_PASSWORD is required');

const defaultSeeds = [
  '/app/patient',
  '/app/patient/about',
  '/app/patient/address',
  '/app/patient/bind-phone',
  '/app/patient/booking',
  '/app/patient/cabinet',
  '/app/patient/courses',
  '/app/patient/diary',
  '/app/patient/diary/lfk/journal',
  '/app/patient/diary/symptoms/journal',
  '/app/patient/emergency',
  '/app/patient/help',
  '/app/patient/install',
  '/app/patient/lessons',
  '/app/patient/messages',
  '/app/patient/notifications',
  '/app/patient/notifications/settings',
  '/app/patient/organizations',
  '/app/patient/profile',
  '/app/patient/purchases',
  '/app/patient/reminders',
  '/app/patient/sections',
  '/app/patient/support',
  '/app/patient/treatment',
  '/app/patient/treatment/promo',
  '/app/patient/go/daily-warmup',
];
const seeds = process.env.DEV_AUDIT_PATIENT_ROUTES
  ? process.env.DEV_AUDIT_PATIENT_ROUTES.split(',').map((route) => route.trim()).filter(Boolean)
  : defaultSeeds;

const result = {
  started_at: new Date().toISOString(),
  complete: false,
  routes: [],
  console_errors: [],
  failed_responses: [],
};

function compact(value) {
  return String(value).replace(/\s+/g, ' ').slice(0, 500);
}

function normalizeRoute(rawHref) {
  try {
    const url = new URL(rawHref, baseUrl);
    if (url.origin !== baseUrl || !url.pathname.startsWith('/app/patient')) return null;
    if (
      url.pathname.endsWith('/login') ||
      url.pathname.includes('/booking/confirm') ||
      url.pathname.includes('/booking/pay') ||
      url.pathname.includes('/memberships/pay')
    ) {
      return null;
    }
    const allowedSearch = new URLSearchParams();
    if (url.searchParams.get('from') === 'daily_warmup') {
      allowedSearch.set('from', 'daily_warmup');
    }
    return `${url.pathname}${allowedSearch.size ? `?${allowedSearch}` : ''}`;
  } catch {
    return null;
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const loginPage = await context.newPage();

try {
  await loginPage.goto(`${baseUrl}/app`);
  const login = await loginPage.evaluate(
    async ({ target, loginEmail, loginPassword }) => {
      const response = await fetch(target, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    {
      target: `${baseUrl}/api/auth/email-password/login`,
      loginEmail: email,
      loginPassword: password,
    },
  );
  if (login.status !== 200 || login.body?.ok !== true) throw new Error('patient_login_failed');
  await loginPage.close();

  const queue = [];
  const scheduled = new Set();
  const enqueue = (route) => {
    const normalized = normalizeRoute(route);
    if (!normalized || scheduled.has(normalized) || scheduled.size >= maxRoutes) return;
    scheduled.add(normalized);
    queue.push(normalized);
  };
  for (const route of seeds) enqueue(route);

  async function worker(workerId) {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120_000);
    let currentRoute = '';
    page.on('console', (message) => {
      if (message.type() === 'error') {
        result.console_errors.push({ route: currentRoute, message: compact(message.text()) });
      }
    });
    page.on('pageerror', (error) => {
      result.console_errors.push({ route: currentRoute, message: compact(error.message) });
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
        result.failed_responses.push({
          route: currentRoute,
          method: response.request().method(),
          status: response.status(),
          url: new URL(response.url()).pathname,
        });
      }
    });

    while (true) {
      const route = queue.shift();
      if (!route) break;
      currentRoute = route;
      const started = Date.now();
      try {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
        const finalUrl = page.url();
        const bodyText = compact(await page.locator('body').innerText().catch(() => ''));
        const bodyVisible = await page.locator('body').isVisible().catch(() => false);
        const mainVisible = await page.locator('main').first().isVisible().catch(() => false);
        const errorBoundary = /Internal Server Error|Application error|Что-то пошло не так/i.test(bodyText);
        result.routes.push({
          worker: workerId,
          route,
          status: response?.status() ?? null,
          final_url: finalUrl.replace(baseUrl, ''),
          body_visible: bodyVisible,
          body_text_length: bodyText.length,
          main_visible: mainVisible,
          error_boundary: errorBoundary,
          ms: Date.now() - started,
        });
        const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
          anchors.map((anchor) => anchor.getAttribute('href')).filter(Boolean),
        );
        for (const href of hrefs) enqueue(href);
      } catch (error) {
        result.routes.push({
          worker: workerId,
          route,
          error: error instanceof Error ? error.message : String(error),
          ms: Date.now() - started,
        });
      }
    }
    await page.close();
  }

  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));
  result.routes.sort((left, right) => left.route.localeCompare(right.route));
  const routeFailures = result.routes.filter(
    (row) =>
      row.error ||
      row.status !== 200 ||
      !row.body_visible ||
      row.body_text_length === 0 ||
      row.final_url?.includes('/login') ||
      row.error_boundary,
  );
  if (routeFailures.length || result.console_errors.length || result.failed_responses.length) {
    throw new Error(
      `Patient crawl is not clean: routes=${routeFailures.length}, console=${result.console_errors.length}, http=${result.failed_responses.length}`,
    );
  }
  result.complete = true;
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  result.finished_at = new Date().toISOString();
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}/patient-route-crawl-${result.finished_at.replaceAll(':', '-')}.json`;
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
  console.log(JSON.stringify({
    complete: result.complete,
    route_count: result.routes.length,
    path: file,
    error: result.error ?? null,
  }));
  if (!result.complete) process.exitCode = 1;
}
