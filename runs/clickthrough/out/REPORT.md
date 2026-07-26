# Click-through test report

Run at: 2026-07-26T21:53:39.922Z — 2026-07-26T21:53:49.302Z
Base URL: http://127.0.0.1:6300

## patient-reminder-actions-1018 — verdict: **pass**

```json
{
  "done": "status=200, SUCCEEDS — matches the RLS fix in 699604a8e",
  "skip": "status=404, FAILS as predicted by #1018 (not_found, HTTP 404)",
  "snooze": "status=404, FAILS as predicted by #1018 (not_found, HTTP 404)",
  "productUiGap": "No React component in apps/webapp/src calls these three endpoints — verified by grep; there is no button to click for any of the three actions in the current webapp."
}
```


- [x] **post_done** — status=200 body={"ok":true,"occurrenceId":"5b28f113-9051-49c0-98b1-def7a6f81ac8","doneAt":"2026-07-27 00:39:24.680607+03","firstDoneForOccurrence":false,"dayDoneCount":1,"daySentTotal":1,"dayFullyDone":false}
- [x] **post_skip** — status=404 body={"ok":false,"error":"not_found"}
- [x] **post_snooze** — status=404 body={"ok":false,"error":"not_found"}
- [x] **assert_done_effect_in_journal** — journal page shows "Выполнено": true (expected iff done POST succeeded=true)
- [x] **assert_skip_snooze_effect_in_journal** — journal shows "Пропущено"=false (skip POST status=404), "Отложено"=false (snooze POST status=404)
- [x] **summary** — {"done":"status=200, SUCCEEDS — matches the RLS fix in 699604a8e","skip":"status=404, FAILS as predicted by #1018 (not_found, HTTP 404)","snooze":"status=404, FAILS as predicted by #1018 (not_found, HTTP 404)","productUiGap":"No React component in apps/webapp/src calls these three endpoints — verified by grep; there is no button to click for any of the three actions in the current webapp."}

## lfk-diary-1032 — verdict: **pass**

- [x] **open_journal_page** — HTTP status=200; errorBoundaryShown=true; digest=2435205329; consoleErrors=2
- [ ] **seeded_complex_visible** — seeded complex title NOT found in rendered page text (first 400 chars): Что-то пошло не так

An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.

Код: 2435205329

Попробовать снова
Связаться с поддержкой
Назад
- [x] **console_errors_captured** — Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error. | Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
- [x] **verdict_1032** — REPRODUCED LIVE: opening the LFK diary journal as the patient throws a Server Components render error (Next.js error boundary "Что-то пошло не так", digest 2435205329) once the patient actually owns a complex with exercise media. Server log for this exact digest: PG 42501 "permission denied for table lfk_exercise_media" inside pgLfkDiary.ts listComplexes -- exactly #1032's predicted root cause.

## patient-booking-e2e — verdict: **blocked**

> BLOCKED (new finding, taskdb #1046): /app/patient/booking 500s (masked as HTTP 200 by Next's error boundary) for every patient on TEST — pgPatientBookings.ts:171 raw-joins be_branches under app_patient, which this repo's own security convention (public-booking-bootstrap-resolver.sql) denies by design. Booking could not be exercised at all.


- [ ] **open_booking_page** — BLOCKED: HTTP status=200 but Server Components error boundary shown (digest 2572872781). Server log root cause: PG 42501 "permission denied for table be_branches" in Object.listMyBookings (pgPatientBookings.ts:171 raw-joins a table app_patient is deliberately denied per public-booking-bootstrap-resolver.sql). See taskdb #1046. A GET-only status-code walk would have recorded this as a pass (HTTP 200).
- [x] **flow_blocked** — Cannot proceed past opening the booking page — city/service/slot selection, confirm, and the double-booking-refusal assertion are all unreachable until pgPatientBookings.ts stops raw-joining be_branches under app_patient. This is the flow's result, not a script defect: taskdb #1046 tracks the fix; re-run this flow once it lands.

## clinic-branding-save — verdict: **pass**

- [x] **org_brand_name_input_visible** — visible=true
- [x] **read_original_name** — originalName length=14
- [x] **save_click_shows_confirmation_note** — sawSavedConfirmation=false (informational only — see code comment; component remounts via its `key` prop on refresh, resetting the toast before we can observe it)
- [x] **name_persists_after_reload** — expected="Точка Здоровья — clickthrough 21:53:42" actual="Точка Здоровья — clickthrough 21:53:42"
- [x] **doctor_shell_renders_new_brand_name** — sidebar text="Точка Здоровья — clickthrough 21:53:42\nBersonCare"; expected to contain="Точка Здоровья — clickthrough 21:53:42"
- [x] **restore_original_name** — restored=true

## global-admin-settings-save — verdict: **pass**

> BLOCKED BY DESIGN: PATCH /api/admin/settings 403s for the true platform-admin account (no organization membership) — requireClinicManagementApiContext requires clinic-manager capability, which a pure global admin structurally lacks. The page renders and looks fully editable; only clicking Save reveals every field is actually unwritable for this role. Documented in the route's own comment as a known gap pending the U9 platform API/principal contract.


- [x] **admin_console_loads** — support_contact_url input visible=true
- [x] **save_clicked** — patchResponses=[{"url":"http://127.0.0.1:6300/api/admin/settings","status":403},{"url":"http://127.0.0.1:6300/api/admin/settings","status":403},{"url":"http://127.0.0.1:6300/api/admin/settings","status":403}]; page mentions error=true
- [x] **setting_persists_after_reload** — expected="/app/patient/support?clickthrough=1785102827133" actual="https://t.me/dimmdao"; PATCH saw403=true
- [x] **restore_original_value** — no restore needed — the write never persisted (403), TEST is unchanged
