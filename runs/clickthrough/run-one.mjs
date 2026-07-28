#!/usr/bin/env node
import { chromium, BASE_URL } from './lib/browser.mjs';
import { runLfkDiaryFlow } from './flows/lfkDiary.mjs';
import { runReminderFlow } from './flows/reminders.mjs';
import { runBrandingFlow } from './flows/branding.mjs';
import { runAdminSettingsFlow } from './flows/adminSettings.mjs';
import { runBookingFlow } from './flows/booking.mjs';

const FLOWS = {
  lfkDiary: runLfkDiaryFlow,
  reminders: runReminderFlow,
  branding: runBrandingFlow,
  adminSettings: runAdminSettingsFlow,
  booking: runBookingFlow,
};

async function main() {
  const name = process.argv[2];
  const fn = FLOWS[name];
  if (!fn) {
    console.error(`unknown flow ${name}; known: ${Object.keys(FLOWS).join(', ')}`);
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const result = await fn({
    browser,
    baseUrl: BASE_URL,
    screenshotDir: 'runs/clickthrough/screenshots',
    log: console.log,
  });
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
