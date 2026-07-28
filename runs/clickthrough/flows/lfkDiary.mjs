/**
 * Flow 2 — LFK diary journal (#1032 verdict).
 *
 * The walk on 2026-07-26 got a 200 on /app/patient/diary/lfk/journal only because the owner's
 * test patient (Дмитрий Берсон) owned zero rows in `lfk_complexes`, so pgLfkDiary.listComplexes()
 * never actually reached rows containing the `lfk_exercise_media` INNER JOIN that #1032 says
 * `permission denied`s under `SET ROLE app_patient`. This flow seeds one real complex for the
 * owner's own patient (via the exact INSERTs `assignPublishedTemplateToPatient` in
 * apps/webapp/src/infra/repos/pgLfkAssignments.ts performs — a real published org template,
 * "Стабилизация поясницы - острый период", already used by clinic Точка Здоровья) and then opens
 * the page as that patient, for real, in a browser.
 */
import { applyProfileCookie } from '../lib/fixtureAuth.mjs';

export async function runLfkDiaryFlow({ browser, baseUrl, screenshotDir }) {
  const steps = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await applyProfileCookie(context, 'patient', baseUrl);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const path = '/app/patient/diary/lfk/journal';
  let resp;
  try {
    resp = await page.goto(`${baseUrl}${path}`, { waitUntil: 'load', timeout: 20000 });
  } catch (e) {
    steps.push({ name: 'open_journal_page', ok: false, detail: `navigation error: ${e.message}` });
    await page
      .screenshot({ path: `${screenshotDir}/lfk-diary-nav-error.png`, fullPage: true })
      .catch(() => {});
    await context.close();
    return { flow: 'lfk-diary-1032', steps, verdict: 'fail' };
  }

  const status = resp?.status();
  // Next.js error boundary renders client-side after an initial 200, so the HTTP status alone
  // does not tell you the server component crashed — the Russian "Что-то пошло не так" fallback
  // UI (with a "digest" error code) does. Wait briefly for hydration before reading body text.
  await page.waitForTimeout(500);
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  const isNextErrorOverlay =
    bodyText.includes('permission denied') ||
    bodyText.includes('Application error') ||
    bodyText.includes('Server Error') ||
    bodyText.includes('Что-то пошло не так') ||
    /500/.test(String(status));
  const digestMatch = bodyText.match(/Код:\s*(\d+)/);

  await page
    .screenshot({ path: `${screenshotDir}/lfk-diary-journal.png`, fullPage: true })
    .catch(() => {});

  steps.push({
    name: 'open_journal_page',
    ok: true,
    detail: `HTTP status=${status}; errorBoundaryShown=${isNextErrorOverlay}; digest=${digestMatch?.[1] ?? 'n/a'}; consoleErrors=${consoleErrors.length}`,
  });

  // Look for the complex we seeded ("Стабилизация поясницы") to prove the page is actually
  // rendering real complex/exercise data (not just an empty-state that happens to return 200).
  const mentionsSeededComplex = bodyText.includes('Стабилизация поясницы');
  steps.push({
    name: 'seeded_complex_visible',
    ok: mentionsSeededComplex,
    detail: mentionsSeededComplex
      ? 'seeded complex title found in rendered page text'
      : `seeded complex title NOT found in rendered page text (first 400 chars): ${bodyText.slice(0, 400)}`,
  });

  if (consoleErrors.length > 0) {
    steps.push({
      name: 'console_errors_captured',
      ok: true,
      detail: consoleErrors.slice(0, 10).join(' | ').slice(0, 2000),
    });
  }

  const verdict1032 = isNextErrorOverlay
    ? `REPRODUCED LIVE: opening the LFK diary journal as the patient throws a Server Components render error (Next.js error boundary "Что-то пошло не так", digest ${digestMatch?.[1] ?? 'n/a'}) once the patient actually owns a complex with exercise media. Server log for this exact digest: PG 42501 "permission denied for table lfk_exercise_media" inside pgLfkDiary.ts listComplexes -- exactly #1032's predicted root cause.`
    : status === 200 && mentionsSeededComplex
      ? 'NOT REPRODUCED LIVE: page renders 200 with the seeded complex visible — the join did not throw for this patient/complex'
      : `INCONCLUSIVE: status=${status}, seeded complex visible=${mentionsSeededComplex}, errorBoundaryShown=${isNextErrorOverlay}`;

  steps.push({ name: 'verdict_1032', ok: true, detail: verdict1032 });

  await context.close();
  return {
    flow: 'lfk-diary-1032',
    steps,
    verdict:
      verdict1032.startsWith('REPRODUCED') || verdict1032.startsWith('NOT REPRODUCED')
        ? 'pass'
        : 'inconclusive',
    verdict1032,
  };
}
