#!/usr/bin/env node
/**
 * Runs every click-through flow against TEST, sequentially (one Chromium instance, one flow at a
 * time — this box's dev-server capacity notes say keep heavy browser work modest), and writes:
 *   - runs/clickthrough/out/results-<timestamp>.json   (full structured results)
 *   - runs/clickthrough/out/REPORT.md                  (human-readable summary, latest run)
 *
 * Usage: node runs/clickthrough/run-all.mjs
 * Screenshots land in runs/clickthrough/screenshots/. Never prints cookies/secrets/PII — grep the
 * output/artifacts for the session cookie name before committing (see lib/fixtureAuth.mjs).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, BASE_URL } from './lib/browser.mjs';
import { runLfkDiaryFlow } from './flows/lfkDiary.mjs';
import { runReminderFlow } from './flows/reminders.mjs';
import { runBrandingFlow } from './flows/branding.mjs';
import { runAdminSettingsFlow } from './flows/adminSettings.mjs';
import { runBookingFlow } from './flows/booking.mjs';

const OUT_DIR = 'runs/clickthrough/out';
const SCREENSHOT_DIR = 'runs/clickthrough/screenshots';

const FLOWS = [
  { name: 'reminders', run: runReminderFlow },
  { name: 'lfkDiary', run: runLfkDiaryFlow },
  { name: 'booking', run: runBookingFlow },
  { name: 'branding', run: runBrandingFlow },
  { name: 'adminSettings', run: runAdminSettingsFlow },
];

function renderMarkdown(results, meta) {
  const lines = [];
  lines.push(`# Click-through test report`);
  lines.push('');
  lines.push(`Run at: ${meta.startedAt} — ${meta.finishedAt}`);
  lines.push(`Base URL: ${meta.baseUrl}`);
  lines.push('');
  for (const r of results) {
    lines.push(`## ${r.flow} — verdict: **${r.verdict}**`);
    if (r.verdictDetail) lines.push(`\n> ${r.verdictDetail}\n`);
    if (r.summary) lines.push(`\n\`\`\`json\n${JSON.stringify(r.summary, null, 2)}\n\`\`\`\n`);
    lines.push('');
    for (const step of r.steps) {
      lines.push(`- [${step.ok ? 'x' : ' '}] **${step.name}** — ${step.detail}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const flow of FLOWS) {
    console.log(`=== running flow: ${flow.name} ===`);
    try {
      const result = await flow.run({
        browser,
        baseUrl: BASE_URL,
        screenshotDir: SCREENSHOT_DIR,
        log: console.log,
      });
      results.push(result);
      console.log(`=== ${flow.name} verdict: ${result.verdict} ===`);
    } catch (e) {
      console.error(`=== ${flow.name} threw: ${e.message} ===`);
      results.push({
        flow: flow.name,
        steps: [{ name: 'uncaught_exception', ok: false, detail: e.stack ?? e.message }],
        verdict: 'error',
      });
    }
  }
  await browser.close();
  const finishedAt = new Date().toISOString();

  const meta = { startedAt, finishedAt, baseUrl: BASE_URL };
  const ts = startedAt.replace(/[:.]/g, '-');
  const jsonPath = `${OUT_DIR}/results-${ts}.json`;
  writeFileSync(jsonPath, JSON.stringify({ meta, results }, null, 2));

  const md = renderMarkdown(results, meta);
  writeFileSync(`${OUT_DIR}/REPORT.md`, md);

  console.log(`\nwrote ${jsonPath}`);
  console.log(`wrote ${OUT_DIR}/REPORT.md`);

  const overallOk = results.every((r) => r.verdict === 'pass' || r.verdict === 'blocked');
  process.exitCode = overallOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
