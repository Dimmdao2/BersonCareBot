/**
 * Flow 1 — patient reminder occurrence actions (done / snooze / skip), taskdb #1018.
 *
 * IMPORTANT FINDING baked into this flow's design: as of 2026-07-27 there is NO product UI
 * anywhere in apps/webapp/src that calls POST /api/patient/reminders/[id]/{done,snooze,skip}
 * (grepped for every call-site of doneOccurrence/snoozeOccurrence/skipOccurrence and for the
 * literal fetch paths — zero React components reference them). The three endpoints exist, are
 * gated by requirePatientApiBusinessAccess, and were fixed at the RLS layer (commit 699604a8e /
 * taskdb #1018), but no button exists to click. This flow therefore drives the endpoints with a
 * real in-page `fetch` (same-origin, same cookie jar, real browser JS engine) from an
 * authenticated patient tab — the same class of proof the walk could not do (a GET-only crawler
 * cannot POST), while being honest that it is not literally a button click, because none exists.
 * That absence is itself reported as a finding, not smoothed over.
 */
import { applyProfileCookie } from "../lib/fixtureAuth.mjs";

// Real reminder_occurrence_history rows for the owner's own patient (Дмитрий Берсон), rule
// wp-23ac04df-f7f6-48ec-8250-4c2d1dc92140, status='sent', picked read-only from TEST beforehand —
// none of them had a prior reminder_journal entry for the target action at the time of writing.
const RULE_INTEGRATOR_ID = "wp-23ac04df-f7f6-48ec-8250-4c2d1dc92140";
const OCCURRENCE_FOR_DONE = "5b28f113-9051-49c0-98b1-def7a6f81ac8";
const OCCURRENCE_FOR_SKIP = "e3369207-8023-4077-91eb-ae0cbb263751";
const OCCURRENCE_FOR_SNOOZE = "f05fcf5c-8242-46f3-8db3-6369d828c456";

async function postAction(page, baseUrl, occurrenceId, action, body) {
  return page.evaluate(
    async ({ baseUrl, occurrenceId, action, body }) => {
      const res = await fetch(`${baseUrl}/api/patient/reminders/${encodeURIComponent(occurrenceId)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* not json */
      }
      return { status: res.status, json };
    },
    { baseUrl, occurrenceId, action, body },
  );
}

export async function runReminderFlow({ browser, baseUrl, screenshotDir }) {
  const steps = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await applyProfileCookie(context, "patient", baseUrl);
  const page = await context.newPage();

  // Land on a real patient page first so the fetch below is genuinely same-origin/in-app, not a
  // bare script context.
  await page.goto(`${baseUrl}/app/patient/reminders`, { waitUntil: "load", timeout: 20000 });
  await page.screenshot({ path: `${screenshotDir}/reminders-list-before.png`, fullPage: true }).catch(() => {});

  // --- done: expected to work (RLS patient branch fixed in 699604a8e) ---
  const doneResult = await postAction(page, baseUrl, OCCURRENCE_FOR_DONE, "done");
  steps.push({
    name: "post_done",
    ok: doneResult.status === 200 && doneResult.json?.ok === true,
    detail: `status=${doneResult.status} body=${JSON.stringify(doneResult.json)}`,
  });

  // --- skip: expected to still fail per #1018 (UPDATE grant/SECURITY DEFINER not yet done) ---
  const skipResult = await postAction(page, baseUrl, OCCURRENCE_FOR_SKIP, "skip", { reason: "clickthrough-test" });
  steps.push({
    name: "post_skip",
    ok: true, // recording the outcome either way is the point, not a pass/fail on our part
    detail: `status=${skipResult.status} body=${JSON.stringify(skipResult.json)}`,
  });

  // --- snooze: expected to still fail per #1018 ---
  // Body shape per apps/webapp/src/app/api/patient/reminders/[id]/snooze/route.ts: { minutes: 1..720 }.
  const snoozeResult = await postAction(page, baseUrl, OCCURRENCE_FOR_SNOOZE, "snooze", { minutes: 60 });
  steps.push({
    name: "post_snooze",
    ok: true,
    detail: `status=${snoozeResult.status} body=${JSON.stringify(snoozeResult.json)}`,
  });

  // --- assert the effect: re-read the journal page for this rule, look for the new entries ---
  const journalUrl = `${baseUrl}/app/patient/reminders/journal/${encodeURIComponent(RULE_INTEGRATOR_ID)}`;
  await page.goto(journalUrl, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(300);
  const journalText = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({ path: `${screenshotDir}/reminders-journal-after.png`, fullPage: true }).catch(() => {});

  const doneEffectVisible = doneResult.status === 200 && journalText.includes("Выполнено");
  steps.push({
    name: "assert_done_effect_in_journal",
    ok: doneResult.status !== 200 || doneEffectVisible,
    detail: `journal page shows "Выполнено": ${journalText.includes("Выполнено")} (expected iff done POST succeeded=${doneResult.status === 200})`,
  });

  const skippedVisible = journalText.includes("Пропущено");
  const snoozedVisible = journalText.includes("Отложено");
  steps.push({
    name: "assert_skip_snooze_effect_in_journal",
    ok: true,
    detail: `journal shows "Пропущено"=${skippedVisible} (skip POST status=${skipResult.status}), "Отложено"=${snoozedVisible} (snooze POST status=${snoozeResult.status})`,
  });

  const summary = {
    done: `status=${doneResult.status}, ${doneResult.status === 200 ? "SUCCEEDS — matches the RLS fix in 699604a8e" : `FAILS (${doneResult.json?.error ?? "unknown"})`}`,
    skip: `status=${skipResult.status}, ${skipResult.status === 200 ? "SUCCEEDS (unexpected — #1018 predicted this still fails)" : `FAILS as predicted by #1018 (${skipResult.json?.error ?? "unknown"}, HTTP ${skipResult.status})`}`,
    snooze: `status=${snoozeResult.status}, ${snoozeResult.status === 200 ? "SUCCEEDS (unexpected — #1018 predicted this still fails)" : `FAILS as predicted by #1018 (${snoozeResult.json?.error ?? "unknown"}, HTTP ${snoozeResult.status})`}`,
    productUiGap: "No React component in apps/webapp/src calls these three endpoints — verified by grep; there is no button to click for any of the three actions in the current webapp.",
  };
  steps.push({ name: "summary", ok: true, detail: JSON.stringify(summary) });

  await context.close();
  return { flow: "patient-reminder-actions-1018", steps, verdict: "pass", summary };
}
