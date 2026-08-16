#!/usr/bin/env node
import { chromium } from '../clickthrough/lib/browser.mjs';
import { ROLE_SCENARIOS } from './scenarios.mjs';

const baseUrl = process.env.DEV_AUDIT_BASE_URL || 'http://127.0.0.1:5200';
const password = process.env.DEV_AUDIT_PASSWORD || '';
if (!password) throw new Error('DEV_AUDIT_PASSWORD is required');

async function inspect(role, key) {
  const scenario = ROLE_SCENARIOS[role];
  const email = process.env[scenario.emailEnv] || scenario.defaultEmail;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const login = await page.evaluate(
      async ({ loginEmail, loginPassword }) => {
        const response = await fetch('/api/auth/email-password/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', 'X-Real-IP': '127.0.0.1' },
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      },
      { loginEmail: email, loginPassword: password },
    );
    if (login.status !== 200 || login.body?.ok !== true) {
      throw new Error(`${role}_login_failed:${login.status}`);
    }
    const response = await page.evaluate(async () => {
      const result = await fetch('/api/admin/settings', {
        credentials: 'include',
        headers: { 'X-Real-IP': '127.0.0.1' },
      });
      return { status: result.status, body: await result.json().catch(() => null) };
    });
    const row = response.body?.settings?.find((item) => item.key === key);
    const value = row?.valueJson?.value ?? null;
    return {
      role,
      status: response.status,
      key,
      configured: Boolean(row),
      fiscalVatCode: value?.fiscalVatCode ?? value?.payeeRequisites?.vatCode ?? null,
      fiscalTaxSystemCode:
        value?.fiscalTaxSystemCode ?? value?.payeeRequisites?.taxSystemCode ?? null,
    };
  } finally {
    await browser.close();
  }
}

const results = await Promise.all([
  inspect('doctor', 'booking_payment_providers'),
  inspect('global_admin', 'saas_billing_payment_provider'),
]);
console.log(JSON.stringify(results));
