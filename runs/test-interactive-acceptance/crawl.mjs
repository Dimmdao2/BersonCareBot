#!/usr/bin/env node

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { chromium } from '../dev-interactive-audit/lib/browser.mjs';

const baseUrl = process.env.TEST_ACCEPTANCE_BASE_URL || 'https://test.bersoncare.ru';
const password = process.env.TEST_ACCEPTANCE_PASSWORD || '';
const requestedRoles = (process.env.TEST_ACCEPTANCE_ROLES || 'doctor,patient,global_admin')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const root = resolve(import.meta.dirname, '../..');
const outputDirectory = resolve(import.meta.dirname, 'out');
const routeLimit = 240;

if (!['http://127.0.0.1:5200', 'https://test.bersoncare.ru'].includes(new URL(baseUrl).origin)) {
  throw new Error('TEST_ACCEPTANCE_BASE_URL must target canonical DEV or TEST');
}
if (!password) throw new Error('TEST_ACCEPTANCE_PASSWORD is required');

const roles = Object.freeze({
  doctor: {
    email: 'dimmdao@yandex.ru',
    roots: [join(root, 'apps/webapp/src/app/app/doctor'), join(root, 'apps/webapp/src/app/app/settings')],
    prefixes: ['/app/doctor', '/app/settings', '/app/account'],
    viewport: { width: 390, height: 844 },
  },
  patient: {
    email: 'kinesiospace@gmail.com',
    roots: [join(root, 'apps/webapp/src/app/app/patient')],
    prefixes: ['/app/patient'],
    viewport: { width: 390, height: 844 },
  },
  global_admin: {
    email: 'dimmdao@gmail.com',
    roots: [join(root, 'apps/webapp/src/app/app/admin')],
    prefixes: ['/app/admin', '/app/account', '/app/doctor/analytics'],
    viewport: { width: 1440, height: 900 },
  },
});

function redact(value) {
  return String(value)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, ':uuid')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, ':email')
    .replace(/\+?[0-9][0-9 ()-]{8,}[0-9]/gu, ':phone')
    .replace(/\s+/gu, ' ')
    .slice(0, 500);
}

function staticRoutes(directory, routePrefix) {
  const routes = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('[')) routes.push(...staticRoutes(path, `${routePrefix}/${entry.name}`));
      continue;
    }
    if (entry.name === 'page.tsx') routes.push(routePrefix);
  }
  return routes;
}

function initialRoutes(role) {
  const routes = role.roots.flatMap((directory) => {
    const relativeRoot = relative(join(root, 'apps/webapp/src/app'), directory).replaceAll('\\', '/');
    return staticRoutes(directory, `/${relativeRoot}`);
  });
  if (role.prefixes.includes('/app/account')) routes.push('/app/account');
  if (role.prefixes.includes('/app/doctor/analytics')) routes.push('/app/doctor/analytics');
  return [...new Set(routes)].filter((route) => !route.includes('/dev/')).sort();
}

function isAllowed(role, url) {
  let parsed;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return false;
  }
  return parsed.origin === new URL(baseUrl).origin && role.prefixes.some((prefix) =>
    parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`));
}

function canonicalRoute(url) {
  const parsed = new URL(url, baseUrl);
  return `${parsed.pathname}${parsed.search}`;
}

function routeTemplate(route) {
  const parsed = new URL(route, baseUrl);
  if (parsed.pathname === '/app/patient/diary' && parsed.searchParams.has('week')) {
    parsed.searchParams.set('week', ':week');
  }
  if (parsed.pathname.endsWith('/journal') && parsed.searchParams.has('month')) {
    parsed.searchParams.set('month', ':month');
  }
  if (parsed.searchParams.has('page')) parsed.searchParams.set('page', ':page');
  return `${parsed.pathname}${parsed.search}`.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,
    ':uuid',
  );
}

async function authenticate(context, role) {
  let response;
  try {
    response = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
      headers: { Origin: baseUrl },
      data: { email: role.email, password },
      timeout: 90_000,
    });
  } catch {
    throw new Error('login_request_failed');
  }
  const body = await response.json().catch(() => null);
  if (response.status() !== 200 || body?.ok !== true || body?.factorRequired === true) {
    throw new Error(`login_failed:${response.status()}:${body?.error ?? 'unknown'}`);
  }
  let identity;
  try {
    identity = await context.request.get(`${baseUrl}/api/me`, {
      headers: { Origin: baseUrl },
      timeout: 90_000,
    });
  } catch {
    throw new Error('identity_request_failed');
  }
  const identityBody = await identity.json().catch(() => null);
  if (identity.status() !== 200 || identityBody?.ok !== true) {
    throw new Error(`identity_failed:${identity.status()}`);
  }
  return { role: identityBody.user?.role ?? null };
}

async function crawlRole(browser, name, role) {
  const context = await browser.newContext({ viewport: role.viewport, locale: 'ru-RU' });
  const identity = await authenticate(context, role);
  const page = await context.newPage();
  page.setDefaultTimeout(3_000);
  const queue = initialRoutes(role);
  const queued = new Set(queue);
  const queuedTemplates = new Set(queue.map(routeTemplate));
  const visited = new Set();
  const results = [];
  let active = null;

  page.on('console', (message) => {
    if (message.type() === 'error' && active) active.consoleErrors.push(redact(message.text()));
  });
  page.on('pageerror', (error) => {
    if (active) active.pageErrors.push(redact(error.message));
  });
  page.on('requestfailed', (request) => {
    if (
      active &&
      request.url().startsWith(baseUrl) &&
      request.failure()?.errorText !== 'net::ERR_ABORTED'
    ) {
      active.requestFailures.push({ method: request.method(), path: canonicalRoute(request.url()), error: redact(request.failure()?.errorText ?? 'failed') });
    }
  });
  page.on('response', (response) => {
    if (!active || !response.url().startsWith(baseUrl) || response.status() < 400) return;
    const parsed = new URL(response.url());
    if (parsed.pathname.startsWith('/api/')) {
      active.apiErrors.push({ method: response.request().method(), path: `${parsed.pathname}${parsed.search}`, status: response.status() });
    }
  });

  while (queue.length && visited.size < routeLimit) {
    const target = queue.shift();
    if (!target || visited.has(target)) continue;
    visited.add(target);
    active = { route: target, consoleErrors: [], pageErrors: [], requestFailures: [], apiErrors: [] };
    const started = performance.now();
    let response = null;
    try {
      response = await page.goto(`${baseUrl}${target}`, { waitUntil: 'commit', timeout: 90_000 });
      if ((response?.status() ?? 500) < 500) {
        await page.waitForLoadState('domcontentloaded', { timeout: 4_000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(200);
      const serverFailed = (response?.status() ?? 500) >= 500;
      const body = serverFailed ? '' : await page.locator('body').innerText().catch(() => '');
      const mainCharacters = serverFailed ? 0 : await page.locator('main').innerText().then((text) => text.trim().length).catch(() => 0);
      const hrefs = serverFailed ? [] : await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
      for (const href of hrefs) {
        if (!isAllowed(role, href)) continue;
        const route = canonicalRoute(href);
        const template = routeTemplate(route);
        if (!queued.has(route) && !visited.has(route) && !queuedTemplates.has(template)) {
          queued.add(route);
          queuedTemplates.add(template);
          queue.push(route);
        }
      }
      const controls = serverFailed ? [] : await page.locator('button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="switch"], [role="tab"]').evaluateAll((nodes) =>
        nodes.filter((node) => {
          const style = globalThis.getComputedStyle(node);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }).map((node) => ({
          tag: node.tagName.toLowerCase(),
          type: node.getAttribute('type'),
          role: node.getAttribute('role'),
          label: (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          href: node instanceof HTMLAnchorElement ? `${node.pathname}${node.search}` : null,
        })),
      );
      const fatal = serverFailed || /Что-то пошло не так|An error occurred in the Server Components render|Internal Server Error|status 500/iu.test(body);
      results.push({
        ...active,
        finalRoute: canonicalRoute(page.url()),
        status: response?.status() ?? null,
        durationMs: Math.round(performance.now() - started),
        mainCharacters,
        fatal,
        controls,
        pass: Boolean(response?.ok()) && !fatal && active.consoleErrors.length === 0 && active.pageErrors.length === 0 && active.requestFailures.length === 0 && active.apiErrors.length === 0,
      });
    } catch (error) {
      results.push({ ...active, finalRoute: canonicalRoute(page.url()), status: response?.status() ?? null, durationMs: Math.round(performance.now() - started), fatal: true, controls: [], pass: false, navigationError: redact(error instanceof Error ? error.message : error) });
    } finally {
      writeFileSync(join(outputDirectory, `checkpoint-${name}.json`), `${JSON.stringify({ name, identity, results }, null, 2)}\n`);
      const latest = results.at(-1);
      process.stdout.write(`${name} ${results.length}/${queue.length + results.length}: ${latest?.route ?? target} status=${latest?.status ?? 'none'} pass=${latest?.pass === true}\n`);
      active = null;
    }
  }
  await context.close();
  return { name, identity, initialRoutes: initialRoutes(role), routeLimitReached: visited.size >= routeLimit, results };
}

mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { baseUrl, startedAt: new Date().toISOString(), roles: [] };
try {
  for (const name of requestedRoles) {
    const role = roles[name];
    if (!role) throw new Error(`unknown_role:${name}`);
    report.roles.push(await crawlRole(browser, name, role));
  }
} finally {
  await browser.close();
}
report.finishedAt = new Date().toISOString();
const suffix = report.finishedAt.replaceAll(':', '-');
const artifact = join(outputDirectory, `crawl-${suffix}.json`);
writeFileSync(artifact, `${JSON.stringify(report, null, 2)}\n`);
for (const role of report.roles) {
  const failed = role.results.filter((item) => !item.pass);
  process.stdout.write(`${role.name}: routes=${role.results.length} failed=${failed.length}\n`);
  for (const item of failed) {
    process.stdout.write(`  ${item.route} -> ${item.finalRoute} status=${item.status ?? 'none'} api=${item.apiErrors.map((entry) => `${entry.method} ${entry.path} ${entry.status}`).join(',') || '-'} fatal=${item.fatal}\n`);
  }
}
process.stdout.write(`artifact=${artifact}\n`);
