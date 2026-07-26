#!/usr/bin/env node
/** One-off connectivity check: does each fixture profile's cookie actually authenticate? */
import { chromium, BASE_URL } from "./lib/browser.mjs";
import { applyProfileCookie } from "./lib/fixtureAuth.mjs";

const CHECKS = [
  { profile: "patient", path: "/app/patient", expectText: null },
  { profile: "doctor", path: "/app/doctor", expectText: null },
  { profile: "clinic_admin", path: "/app/settings", expectText: null },
  { profile: "global_admin", path: "/app/admin/app-settings", expectText: null },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const check of CHECKS) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await applyProfileCookie(context, check.profile, BASE_URL);
    const page = await context.newPage();
    const resp = await page.goto(`${BASE_URL}${check.path}`, { waitUntil: "load", timeout: 20000 });
    const finalUrl = page.url();
    const title = await page.title().catch(() => "");
    console.log(
      `${check.profile.padEnd(14)} ${check.path.padEnd(28)} status=${resp?.status()} finalUrl=${finalUrl} title=${JSON.stringify(title)}`,
    );
    await context.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error("smoke-auth-check failed:", e.message);
  process.exit(1);
});
