#!/usr/bin/env node

import { chromium } from '../dev-interactive-audit/lib/browser.mjs';

const baseUrl = 'https://test.bersoncare.ru';
const password = process.env.TEST_ACCEPTANCE_PASSWORD || '';
const email = process.env.TEST_ACCEPTANCE_EMAIL || 'dimmdao@yandex.ru';
const clickLabel = process.env.TEST_ACCEPTANCE_CLICK || '';
const routes = process.argv.slice(2);

if (!password) throw new Error('TEST_ACCEPTANCE_PASSWORD is required');
if (routes.length === 0) throw new Error('Pass at least one TEST route');

const browser = await chromium.launch({ headless: true });
const viewport = process.env.TEST_ACCEPTANCE_DESKTOP === '1'
  ? { width: 1440, height: 900 }
  : { width: 390, height: 844 };
const context = await browser.newContext({ viewport, locale: 'ru-RU' });

try {
  const login = await context.request.post(`${baseUrl}/api/auth/email-password/login`, {
    headers: { Origin: baseUrl },
    data: { email, password },
  });
  if (login.status() !== 200) throw new Error(`login_failed:${login.status()}`);

  const page = await context.newPage();
  for (const route of routes) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
    if (clickLabel) {
      await page.locator('button:visible').filter({ hasText: clickLabel }).first().click();
      await page.waitForTimeout(300);
    }
    const dialog = page.locator('[role="dialog"]').last();
    const root = clickLabel && await dialog.count() > 0 ? dialog : page.locator('body');
    const controls = await root.locator('input:not([type="hidden"]), textarea, select, button, [role="button"], [role="combobox"], [contenteditable="true"]').evaluateAll((nodes) =>
      nodes.filter((node) => {
        const style = globalThis.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).map((node, index) => {
        const id = node.getAttribute('id');
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : null;
        return {
          index,
          tag: node.tagName.toLowerCase(),
          type: node.getAttribute('type'),
          name: node.getAttribute('name'),
          id,
          role: node.getAttribute('role'),
          label: node.getAttribute('aria-label') || label || node.textContent?.trim().replace(/\s+/gu, ' ').slice(0, 100) || null,
          placeholder: node.getAttribute('placeholder'),
          value: node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement ? node.value : null,
          disabled: 'disabled' in node ? node.disabled : null,
        };
      }),
    );
    process.stdout.write(`${JSON.stringify({ route, finalRoute: new URL(page.url()).pathname, status: response?.status() ?? null, controls }, null, 2)}\n`);
  }
} finally {
  await context.close();
  await browser.close();
}
