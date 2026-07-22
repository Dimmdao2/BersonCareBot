# Track A — UI-1 Schedule + appointment detail reality audit

## Audit contract

- Run: `ui1_reality_audit` (`audit/ui1-reality-20260723`).
- Audited HEAD: `cef84186449d6d1e38672e2136745e61bc83a3f5`.
- Owner denominator: exactly 20 UI-1 rows from
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § «UI-1 — Schedule … и appointment detail».
- This is the single independent presentation/interaction audit pass. Product code, DB, runtime, deploy and taskdb
  were not changed.
- `real-done` requires the row's code/test evidence plus the live evidence required by the owner work order.
  Repository evidence without a source-bound current LIVE PNG is therefore `partial`, not fake PASS.
- Existing schedule PNG directories are source-named `fd79bee43`, `ee66f4ad7` and `908cb0486`; all three precede
  the UI-1 fixes `30e07dc00`, `68eec658d`, `cd9d5d06c` and `31b6326bc`, so they are not evidence for current UI-1.
  `LOG.md:4434-4441` records a DEV live pass but provides no source-bound PNG path. Current TEST deploy evidence is
  exact product SHA `45ffed7318c584cf501d6972e231d197bebce6f6`, locked smoke `22/22`; it is runtime evidence, not visual or
  owner interaction acceptance.

## Targeted verification actually run

The isolated audit worktree has no installed `node_modules`; its first command stopped before Vitest with
`Command "vitest" not found`. The audited implementation and all three test files were byte-identical to the
integration checkout at `afefa8ac1a165537964a36f5601d0c6f3121afeb`, so the targeted run used the installed
dependencies there:

```text
pnpm --dir apps/webapp exec vitest run \
  src/app/app/doctor/schedule/tabs/ScheduleWorkTab.test.tsx \
  src/app/app/doctor/calendar/DoctorCalendarEventPanel.test.tsx \
  src/app/app/doctor/clients/AppointmentStaffCommentsSection.test.tsx

PASS — 3 files / 53 tests
```

Vitest global setup printed a non-fatal DEV migration warning for migration `0229` (`permission_denied`); the three
in-memory/jsdom suites still ran and passed. Full CI was not repeated: the current deployed product SHA already has
the accumulated green CI recorded in `TEST_DEPLOY_EVIDENCE_2026-07-22.md:41-55`, and no product code changed after it.

## Row-by-row matrix

| # | Checkbox (quoted verbatim) | Code evidence | Test evidence | Source-bound live PNG / TEST evidence | Verdict |
|---:|---|---|---|---|---|
| 1 | `[x] Template-days используют существующие цвета локаций.` | `ScheduleWorkTab.tsx:322-347,398-424` resolves the existing branch color and keeps it as the template-day base surface. | `ScheduleWorkTab.test.tsx:474-498` proves per-date and weekday-template branch colors. Current targeted suite PASS. | TEST `45ffed731` contains `30e07dc00`; no post-fix source-bound schedule PNG. | partial |
| 2 | `[x] Время и город выводятся один раз в weekday header, а не в каждой date-cell.` | `ScheduleWorkTab.tsx:354-367,440-489,1225-1257` places template summary in the weekday header and suppresses template time/location in date cells. | `ScheduleWorkTab.test.tsx:482-493` asserts the cell omits `8–12`/`Мск` and the complete grid contains `8–12 · Мск` exactly once. Current targeted suite PASS. | TEST includes the code; no post-fix source-bound desktop/mobile PNG. | partial |
| 3 | `[x] Действие настройки времени называется «Установить».` | `ScheduleWorkTab.tsx:1378-1387` renders `Установить`. | `ScheduleWorkTab.test.tsx:615-623` asserts `Установить` and absence of the old `Сохранить` button. Current targeted suite PASS. | TEST includes the code; no post-fix source-bound PNG. | partial |
| 4 | `[x] Недельный график переиспользует canonical DoctorDateTimePicker, без локального picker fork (#960).` | `ScheduleWorkTab.tsx:25,515-533,1310-1330,1506-1526` imports the single shared picker and uses it at all six time callsites; canonical implementation is `shared/ui/doctor/DoctorDateTimePicker.tsx:18-139`. No local picker component exists in the tab. | The full `ScheduleWorkTab` suite passes, but it has no exact static assertion preventing a future local picker fork. | TEST `45ffed731` contains `31b6326bc`; no source-bound picker interaction PNG. | partial |
| 5 | `[x] Grid lines имеют согласованную спокойную presentation-плотность.` | `ScheduleWorkTab.tsx:385-435,1224-1264` uses the same muted `border-border/60`, `gap-0.5` and compact padding for headers/cells. | The grid renders throughout the passing `ScheduleWorkTab` suite, but no assertion locks this subjective density contract. | Existing schedule PNGs predate the final grid/color fixes; no valid current PNG. | partial |
| 6 | `[x] Location filters независимы; «Все» включает все локации.` | `ScheduleWorkTab.tsx:565-566,609-635,705-710,1054-1067,1138-1179` stores a set, toggles each location independently and makes `Все` restore the full set. | `ScheduleWorkTab.test.tsx:509-538` proves default all-selected, independent toggle and restore-all; `540-590` preserves global rows. Current targeted suite PASS. | TEST includes the behavior; no source-bound live click-through PNG/video. | partial |
| 7 | `[x] В appointment detail остаётся ровно один доступный close-control в каждом host-context.` | Embedded schedule uses panel close at `ScheduleCalendarTab.tsx:2052-2076`; modal hosts keep the primitive close and pass `showCloseControl={false}` at `TodayAppointmentFullModal.tsx:89-104` and `TodayMiniCalendarWithModal.tsx:127-140`; the primitive supplies one close at `shared/ui/primitives/dialog.tsx:42-76`. | `DoctorCalendarEventPanel.test.tsx:162-175` proves the panel close is absent when delegated to a host. There is no focused wrapper test counting the host close. | `LOG.md:4434-4441` reports one-close DEV acceptance but no source-bound PNG; no current modal/embedded PNG. | partial |
| 8 | `[x] ФИО крупнее, остаётся единственной card navigation и имеет existing chat/phone actions с mobile/desktop поведением и отсутствующими-data states.` | `DoctorCalendarEventPanel.tsx:527-584` has the sole patient-card link in the larger heading, reuses `DoctorOpenChatButton`/`phoneToTelHref`, mobile `tel:` and desktop visible-copy confirmation; actions are omitted without canonical data. | `DoctorCalendarEventPanel.test.tsx:98-140,231-248` proves one FIO link, chat, normalized mobile phone, desktop visible/copy state, and plain heading without canonical patient id. Current targeted suite PASS. | DEV behavior is described at `LOG.md:4434-4441`; no source-bound current desktop/mobile PNG. | partial |
| 9 | `[x] Актуальные дата/время выделены; semantic status badge находится в той же строке; дублирующая подпись статуса отсутствует.` | `DoctorCalendarEventPanel.tsx:138-152,601-614` renders emphasized current time and semantic status badge in one row; no duplicate status label is rendered. | `DoctorCalendarEventPanel.test.tsx:142-144,217-228` proves confirmed/cancelled semantic tones and absence of `Статус записи:`. Current targeted suite PASS. | TEST includes the code; no source-bound current status-state PNG. | partial |
| 10 | `[x] Rubitime ID, Rubitime manage-link и отдельная ссылка «Карточка пациента» не рендерятся.` | `DoctorCalendarEventPanel.tsx:505-704` has no render use of `rubitimeId`/`rubitimeManageUrl` and only the FIO card navigation plus the distinct visit-creation CTA. | `DoctorCalendarEventPanel.test.tsx:98-159` supplies legacy values and proves no Rubitime text or `Карточка пациента`. Current targeted suite PASS. | TEST includes the code; no source-bound current appointment PNG. | partial |
| 11 | `[x] «Филиал / Услуга / Специалист» подписаны; specialist row скрывается только при server-proven solo-mode.` | `DoctorCalendarEventPanel.tsx:505-507,621-636` derives solo mode from server-returned filter metadata and always labels branch/service; specialist is hidden only for one returned specialist. | `DoctorCalendarEventPanel.test.tsx:145-150,196-215` proves clinic labels, clinic specialist row and solo-only hiding. Current targeted suite PASS. | TEST includes the code; DEV fixture did not cover every solo/clinic state and no source-bound PNG exists. | partial |
| 12 | `[x] Исходное время показывается только после фактического переноса.` | `DoctorCalendarEventPanel.tsx:120-136,508-515,615-619` compares calendar minutes and renders only a real difference. | `DoctorCalendarEventPanel.test.tsx:177-194` proves same-minute seconds are hidden and a real reschedule is shown. Current targeted suite PASS. | TEST includes the code; no source-bound unchanged/rescheduled PNG pair. | partial |
| 13 | `[x] «Создать визит из записи» оформлено отдельным центрированным действием.` | `DoctorCalendarEventPanel.tsx:645-661` renders a dedicated centered row and existing patient-card visit URL. | `DoctorCalendarEventPanel.test.tsx:151-154` proves the CTA and `createVisitFrom` target. Current targeted suite PASS. | DEV result is described in `LOG.md:4437-4439`; no source-bound PNG. | partial |
| 14 | `[x] Пустой/whitespace комментарий нельзя отправить.` | `AppointmentStaffCommentsSection.tsx:50-52,92-104` trims before submit and disables for an empty trimmed draft. | `AppointmentStaffCommentsSection.test.tsx:23-34` proves empty, whitespace-only and non-empty states. Current targeted suite PASS. | TEST includes the code; no source-bound live interaction artifact. | partial |
| 15 | `[x] Диагностическая payment panel скрыта до доказанных provider/cash/invoice/pay-link/QR contracts; домен не удалён.` | `DoctorCalendarEventPanel.tsx:505-704` does not import/render `BookingStaffPaymentPanel`; the domain component remains at `app/app/settings/BookingStaffPaymentPanel.tsx`. | `DoctorCalendarEventPanel.test.tsx:7-10,98-159` installs a sentinel mock and proves it is not rendered. Current targeted suite PASS. | TEST includes the code; no source-bound appointment PNG. | partial |
| 16 | `[ ] После отдельного money/provider gate карточка различает частичную предоплату с суммой.` | Intentionally absent from the UI-1c panel; the detailed plan places it after a separate money/provider gate. | N/A until that high-risk gate defines the contract. | No readiness/provider runtime evidence and no owner acceptance. | owner-deferred |
| 17 | `[ ] После отдельного money/provider gate карточка различает полную оплату с суммой.` | Intentionally absent from the UI-1c panel; the detailed plan places it after a separate money/provider gate. | N/A until that high-risk gate defines the contract. | No readiness/provider runtime evidence and no owner acceptance. | owner-deferred |
| 18 | `[ ] После отдельного money/provider gate состояние «Не оплачено» даёт server-authorized действия «Оплачено наличными» и «Выставить счёт»; UI-1c не изобретает эти contracts.` | Correct safe state: `DoctorCalendarEventPanel` does not invent cash/invoice actions. | The sentinel payment-panel assertion passes; server-authorized money actions have no in-scope tests because their contract is not yet gated. | No provider/server-authorization evidence. | owner-deferred |
| 19 | `[x] UI-1c присутствует на exact TEST SHA eb64a495644; mandatory patient-card/schedule smoke и первичная read-only visual проверка прошли. Owner interaction acceptance остаётся отдельным gate.` | `eb64a495644` is an ancestor of current deployed product SHA `45ffed731`; UI-1c commits `68eec658d`, `d65c73c23`, `cd9d5d06c` and picker `31b6326bc` are also ancestors. The literal SHA is stale as current-state wording, but this is evidence drift, not a product regression. | Current targeted 3 files / 53 tests PASS; accumulated CI on `45ffed731` is recorded green. | `TEST_DEPLOY_EVIDENCE_2026-07-22.md:41-55` records current TEST `45ffed731`, 22/22 locked smoke and 403 deny smoke. Historical DEV visual result is log-only; owner interaction acceptance and a current source-bound PNG remain missing. | partial |
| 20 | `[ ] SCH-G5 остаётся отдельным owner gate #848, не скрывается внутри UI-1 completion.` | No fallback-slot semantic change was added to UI-1 code. | N/A: the row is a product decision gate, not a code assertion to implement here. | Owner gate `#848` remains open; it is not hidden by the repository implementation. | owner-deferred |

## Aggregation

| Verdict | Count |
|---|---:|
| real-done | 0 |
| partial | 16 |
| fake-done | 0 |
| owner-deferred | 4 |
| **Total** | **20** |

## Coherent residual batch (do not execute inside this audit)

No dependency-ready product defect was found in the 20-row scope. The remaining dependency-ready work is one
evidence-closure batch, not a product rewrite:

1. add narrow contract assertions for canonical-picker/no-local-fork, grid-density classes, both modal wrapper close
   counts and missing-data action states;
2. capture source-SHA-bound desktop/mobile PNGs after opening the populated `work` grid and both embedded/modal
   appointment-detail contexts (confirmed, cancelled/rescheduled, solo/clinic, with/without phone);
3. update the row-19 current TEST evidence from stale `eb64a495644` to deployed `45ffed731` while preserving the
   historical deployment statement.

Money/provider rows 16–18 and SCH-G5 row 20 are excluded from that batch and stay behind their explicit gates.

closed 0/20 against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § UI-1

**NOT DONE:** source-bound current live PNG/owner interaction acceptance is missing for rows 1–15 and 19; exact
contract tests are additionally missing for rows 4, 5 and the modal-wrapper half of row 7. Rows 16–18 await the
separate money/provider gate. Row 20 awaits owner decision `#848`.
