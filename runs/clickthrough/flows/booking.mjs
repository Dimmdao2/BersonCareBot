/**
 * Flow 3 — book an appointment end-to-end as a patient, including a slot that should be refused.
 *
 * NEW LIVE FINDING (2026-07-27, discovered by this flow, not previously known — see taskdb #1046):
 * /app/patient/booking currently throws a Server Components render error for every patient on
 * TEST. Root cause: apps/webapp/src/infra/repos/pgPatientBookings.ts:171 does a raw
 * `LEFT JOIN be_branches` under the app_patient DB role inside listUpcomingByUser/
 * listHistoryByUser (→ listMyBookings → this page). But deploy/postgres/
 * public-booking-bootstrap-resolver.sql FATAL-asserts that app_patient must NEVER get
 * direct SELECT on be_branches/be_clinic_services/be_specialist_service_availability
 * — that access is meant to go only through the SECURITY DEFINER
 * app.resolve_public_booking_organization(). This is a genuine code bug (a query that never
 * migrated to the definer seam this repo's own security convention requires), not a missing
 * grant — confirmed read-only via information_schema.role_table_grants (app_patient has zero
 * privileges on be_branches, exactly as the resolver's assertion demands). The walk on
 * 2026-07-26 recorded HTTP 200 for this exact route/role and called it clean, because Next.js
 * returns HTTP 200 with a client-hydrated error boundary even when the Server Component crashed
 * — a GET-only status-code check cannot see that. This flow can only prove the blocker, not
 * complete a booking — every step past "open the booking page" is structurally unreachable until
 * pgPatientBookings.ts is fixed.
 */
import { applyProfileCookie } from '../lib/fixtureAuth.mjs';

export async function runBookingFlow({ browser, baseUrl, screenshotDir }) {
  const steps = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await applyProfileCookie(context, 'patient', baseUrl);
  const page = await context.newPage();

  const resp = await page.goto(`${baseUrl}/app/patient/booking`, {
    waitUntil: 'load',
    timeout: 20000,
  });
  await page.waitForTimeout(500);
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  const digestMatch = bodyText.match(/Код:\s*(\d+)/);
  const errorBoundaryShown = bodyText.includes('Что-то пошло не так');
  await page
    .screenshot({ path: `${screenshotDir}/booking-open-blocked.png`, fullPage: true })
    .catch(() => {});

  steps.push({
    name: 'open_booking_page',
    ok: !errorBoundaryShown,
    detail: errorBoundaryShown
      ? `BLOCKED: HTTP status=${resp?.status()} but Server Components error boundary shown (digest ${digestMatch?.[1] ?? 'n/a'}). Server log root cause: PG 42501 "permission denied for table be_branches" in Object.listMyBookings (pgPatientBookings.ts:171 raw-joins a table app_patient is deliberately denied per public-booking-bootstrap-resolver.sql). See taskdb #1046. A GET-only status-code walk would have recorded this as a pass (HTTP 200).`
      : `HTTP status=${resp?.status()}, page rendered normally`,
  });

  if (errorBoundaryShown) {
    steps.push({
      name: 'flow_blocked',
      ok: true,
      detail:
        "Cannot proceed past opening the booking page — city/service/slot selection, confirm, and the double-booking-refusal assertion are all unreachable until pgPatientBookings.ts stops raw-joining be_branches under app_patient. This is the flow's result, not a script defect: taskdb #1046 tracks the fix; re-run this flow once it lands.",
    });
    await context.close();
    return {
      flow: 'patient-booking-e2e',
      steps,
      verdict: 'blocked',
      verdictDetail:
        "BLOCKED (new finding, taskdb #1046): /app/patient/booking 500s (masked as HTTP 200 by Next's error boundary) for every patient on TEST — pgPatientBookings.ts:171 raw-joins be_branches under app_patient, which this repo's own security convention (public-booking-bootstrap-resolver.sql) denies by design. Booking could not be exercised at all.",
    };
  }

  // --- Unreached in the current TEST state, kept ready for when #1046 is fixed. ---
  steps.push({
    name: 'note',
    ok: true,
    detail:
      'booking page rendered — full wizard walk not yet implemented past this point (unreached in current TEST state).',
  });
  await context.close();
  return { flow: 'patient-booking-e2e', steps, verdict: 'partial' };
}
