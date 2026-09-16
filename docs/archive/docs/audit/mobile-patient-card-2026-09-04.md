# Independent live audit — mobile patient list, files, account, contacts (2026-09-04)

Candidate branch: `wt/mobile-patient-card-20260904`, commit `11bf787c8` (`feat(doctor-ui): mobile patient
list, files and account redesign`), diff reviewed `1681a27ca..11bf787c8`. Auditor role per AGENTS.md §24
(`auditor-live`, independent, temporary fault injection reverted, no product-code changes).

Screenshots + manifest: `/home/dev/dev-projects/.lead/runs/doctor-mobile-owner-20260904/patient-card-candidate/`.

## Тест или взгляд — per-ID classification (read before this: §10a, §10b)

All list/composition/typography/icon requirements below are **Взгляд** — accepted by live mobile viewing
plus code inspection, per owner instruction and §10a "UI: автоматизировать устойчивый контракт,
изменчивую форму принимать live". No new UI test was written for any of them.

- `CLIENTS-01..05` — Взгляд (filter active-state, icon set, star placement: pure presentation).
- `FILES-01..11` — Взгляд (composition/actions/scroll are presentation & layout, not a data contract),
  **except** `FILES-11` which is a repo-rule check (reuse of existing upload contracts — verified by
  reading the diff/route list, not a test).
- `ACCOUNT-01..09` — Взгляд (section styling, modal chrome, field set, type scale).
- `CONTACTS-01..09, 11` — Взгляд (existing-channel rendering, labels, monogram, legend removal).
- `CONTACTS-10` — **Тест** in the sense of a data/auth contract: whether "confirmed" is derived from a
  real verification event or merely "code sent" is a security-relevant correctness question, not
  presentation. Verified by **code/data trace** (existing canonical `user_contacts.confirmed_at` column,
  already used for login gating elsewhere) plus one live example; no new automated test was warranted
  because the underlying contract is pre-existing and not newly introduced by this diff.
- `ACCESS-01..04` — Взгляд/code-trace (`ACCESS-04` reuses existing block/archive endpoints — confirmed by
  reading the diff, not by executing a real block/archive against DEV data).
- `UNREAD-03` — Взгляд (icon-bubble dot placement + button red state); could not be live-triggered (no
  reachable DEV patient had unread messages this session).
- `MODAL-03` — Взгляд (footer chrome/safe-area).

## Live environment

- Turbopack candidate on `127.0.0.1:5212` (`cd apps/webapp && npx next dev -H 127.0.0.1 -p 5212`), against
  the existing named DEV database (`bcb_webapp_dev`) via `.env`/`apps/webapp/.env.dev` copied read-only
  from the `BersonCareBot` checkout for the duration of the run, then deleted (both are `.gitignore`d).
  No migration was required (this commit touches no schema).
- Headless Chromium (`/usr/bin/chromium-browser`) driven by the globally installed `playwright@1.61.0`
  (no browser-automation MCP tool was available this session); mobile viewport 390×844, touch emulation,
  iPhone Safari UA.
- Login: ordinary email/password form, doctor account `dimmdao@yandex.ru` / `123456testTEST` (AGENTS.md §1a).
- Server stopped at the end; shared DEV (5200) untouched; no other worktree's dev server touched.

## Finding 1 — CRITICAL regression: patient card crashes for most Telegram-linked patients

**Not landable as-is.**

`getPatientCardHeader()` (`apps/webapp/src/infra/repos/pgDoctorClients.ts:862-865`, new in this diff)
unconditionally calls `loadPatientTelegramUsername(canonicalId)` whenever `bindings.telegramId` is set —
this is the CONTACTS-05 "useful Telegram username" plumbing. That repo function calls
`app.read_patient_telegram_display_handle(uuid)`, a pre-existing `SECURITY DEFINER` RPC
(`deploy/postgres/generated/prod-to-target/schema-pre.sql:15631-15654`) whose body requires
`app.current_org_id()` to be bound **and** the patient to be an `active` row in
`public.be_organization_members` for that org — a precondition normally satisfied inside the
**messaging/delivery seam** (capability role `app_seam_delivery_scope_owner`), not inside an ordinary
doctor-session staff query. In the doctor-patient-card request path this guard raises

```
Postgres 42501: "active organization patient required"
  at PL/pgSQL function read_patient_telegram_display_handle(uuid) line 13 at RAISE
  at loadPatientTelegramUsername (pgPatientTelegramUsernameMention.ts:5)
  at getPatientCardHeader (pgDoctorClients.ts:865)
  at loadDoctorPatientCardShellMeta (loadDoctorPatientCardPageBootstrap.ts:319)
  at DoctorPatientCardPage (page.tsx:58)
```

uncaught, crashing the **entire** patient-card page (`Что-то пошло не так`) — every tab (Обзор, Карта,
ЛФК, Файлы, Учётка), not just Contacts. Live-reproduced for **11 of 14 sampled DEV patients (≈79%)**:

| Patient | Result |
|---|---|
| Проверка Системная | OK |
| Костяков Дмитрий | **FAIL** |
| Аминов Евгений | **FAIL** |
| Жукова Оксана Викторовна | **FAIL** |
| Повасина Евгения | **FAIL** |
| Нечаева Надежда | **FAIL** |
| Емельянова Серафима Валерьевна | **FAIL** |
| Акопова Карина Михайловна | **FAIL** |
| Ольга Альмендингер | **FAIL** |
| Любащенко Анастасия Анатольевна | **FAIL** |
| Вовк Ирина | OK |
| Юлия | OK |
| Кудашова Светлана | **FAIL** |
| Иванова Вероника | **FAIL** |

Evidence: `05-patient-card-crash-telegram-bug.png`; full stack trace in the session's server log (dev
server stdout, referenced above, not persisted — trivially reproducible by opening any Telegram-linked
patient's card on this candidate). This is exactly the class of "incorrect reuse of a shared primitive
outside its port-context" the audit brief asks to check for — `read_patient_telegram_display_handle` was
written for, and previously only called from, the delivery/notification seam; wiring it into a doctor
staff-session read path without also establishing `current_org_id()`/membership the way that seam does is
an architecture-boundary violation, not a DEV-provisioning staleness issue.

**Impact on scope:** this single bug makes `CONTACTS-05` unreachable in practice (the feature it powers
never renders — the whole card crashes first), and blocks live verification of `FILES-*`, `ACCOUNT-*`,
`CONTACTS-*`, `ACCESS-*`, `UNREAD-03` for the majority of real patients. The three PASS verdicts below for
those groups are proven only on the reachable minority (`Проверка Системная`, `Вовк Ирина`, `Юлия`).

## Finding 2 — FILES-09 partially implemented (FAIL per brief)

The Files-tab block uses a **fixed** height (`h-[60vh] max-h-[520px] min-h-[240px]`,
`PatientTabFiles.tsx`), not a computed "fill the space between header/tabs and the bottom panels."
Measured live (390×844, the two reachable patients whose shared identity header above the tab content is
identical/minimal): the outer per-tab scroll region is `top:49 → bottom:750` (height 701px); the Files
block itself renders at `top:246 → bottom:752.39` (height 506.39px) — i.e. it **already overflows the
available region by ~2.4px** in the most favorable (shortest-header) case reachable this session. Because
the height is a hardcoded vh/px formula rather than `flex-1`/`min-h-0` fill, any patient whose shared
identity block is taller (longer name, blocked banner, activated-portal state, etc.) will push the total
past the outer region's 701px and force the **outer per-tab container** — the closest thing this app-shell
has to "the page" — to scroll, which is precisely what `FILES-09` prohibits ("сама страница не
прокручивается, прокручивается только внутренний список"). Per the audit brief: *"If any owner requirement
is only partially implemented (especially FILES-09), it is FAIL, not a recommendation."*

## Finding 3 (repo-rule / regression, not owner-scope) — deleted behavioral test for a still-existing risky contract

`PatientTabFiles.ui.test.tsx` (213 lines) was deleted whole. The upload-flow tests in it are legitimately
obsolete (that whole upload UI was replaced). But the **file-deletion tests** — including the
"media_in_use" double-confirmation guard ("Файл используется в материалах" → "Найдено использований: N" →
requires an explicit "Удалить несмотря на использование") — covered logic that is **still present
byte-for-byte** in the new component (`deleteSelectedFile`, `deleteUsageCount`, `confirmUsed` query param;
`PatientTabFiles.tsx:619-757`). This is exactly the "dorogoy i molchaliviy" (expensive + silent) class of
failure §10a asks to keep regression tests for — deleting a file that's embedded in CMS materials without
the second explicit confirmation silently breaks those materials elsewhere in the product. The tests could
have been adapted (add one extra click to open the preview modal first) instead of dropped. Per the audit
brief's own instruction ("do not create a new UI test merely because an old appearance-pinning test was
removed") I did not write a replacement myself — flagging as a recommendation for whoever lands this branch.

## Per-ID verdicts

| ID | Verdict | Evidence |
|---|---|---|
| CLIENTS-01 | PASS | Live: filter chip active/reset (`02`-`04` screenshots), same semantic-primary system as calendar |
| CLIENTS-02 | PASS | Live: list row has no program/exercise/subscription icons (`01`) |
| CLIENTS-03 | PASS | Live: calendar+count badge retained (`01`) |
| CLIENTS-04 | PASS | Live: star right after FIO, "Костяков Дмитрий ★" (`01`) |
| CLIENTS-05 | PASS | Live: star vertically centered in flex row (`01`) |
| UNREAD-03 | **UNPROVED** | Code: dot on icon-bubble via `relative` wrapper scoped to the icon only, button keeps red state while `chatUnreadCount>0` (`PatientCardClient.tsx:294-314`, `DoctorAttentionBadge.tsx`). No reachable DEV patient had unread messages this session (dashboard KPI showed 0) |
| FILES-01 | PASS | Live: no AI/PDF disclaimer text (`07`,`08`) |
| FILES-02 | PASS | Live: white "Файлы и медиа" block, shared section-title class (`07`) |
| FILES-03 | PASS | Live: centered "Файлов нет" (`08`) |
| FILES-04 | PASS | Live: 3 header actions — camera / library / document (`07`) |
| FILES-05 | PASS (code+DOM) | Camera dropdown → Фото/Видео → hidden `image/*`/`video/*` inputs with `capture="environment"` (`PatientTabFiles.tsx` `FilesHeaderActions`) |
| FILES-06 | PASS | Live: library icon opens `accept="image/*,video/*"` input directly — used for the real test upload (`09`) |
| FILES-07 | PASS (code) | Document icon opens plain `<input type=file>`, no accept filter, no capture |
| FILES-08 | PASS | Live: uploaded file + confirms both show in one scrollable list (`09`) |
| FILES-09 | **FAIL** | Finding 2 — fixed-height block, measured overflow of the outer scroll region by ~2.4px even in the shortest-header case reachable |
| FILES-10 | PASS | Live: tap opens standard `DoctorModal` preview with real info + actions (`10`) |
| FILES-11 | PASS | Diff stat shows zero new route files; full upload chain (POST metadata → S3 PUT → confirm) exercised live end-to-end and rolled back (`09`,`11`) |
| ACCOUNT-01 | PASS | Live: header FIO has no pencil (`06`) |
| ACCOUNT-02 | PASS | Live+code: shared `doctorSectionTitleClass`/`SectionCard` (`12`) |
| ACCOUNT-03 | PASS | Live: only a pencil icon, no "Редактирование" text (`12`) |
| ACCOUNT-04 | PASS | Live: pencil → standard `DoctorModal`, not inline (`13`) |
| ACCOUNT-05 | PASS | Live: Отмена left / Сохранить right (`13`) |
| ACCOUNT-06 | PASS | Live: only ФИО/Дата рождения/Пол; no phone/email/weight/display-name (`12`) |
| ACCOUNT-07 | PASS | Code: "ФИО (скрытое)" row + visibility disclaimer paragraph removed from diff |
| ACCOUNT-08 | PASS | Live: exact-date `DoctorDatePicker` (`max=today`), no month-only mode (`13`) |
| ACCOUNT-09 | PASS | Live+code: `doctorBodyTextClass`/`doctorMetaTextClass` replace old `text-[11px]`/`text-xs` hardcodes |
| CONTACTS-01 | PASS | Live: no "+ добавить" header action (`12`,`14`) |
| CONTACTS-02 | PASS | Live: Юлия/Проверка Системная show no Telegram/MAX rows; Вовк Ирина shows only her actually-bound MAX (`12`,`14`,`15`) |
| CONTACTS-03 | PASS | Live: "Основной телефон" label, no "не редактируется" (`12`) |
| CONTACTS-04 | PASS | Live: "✓ подтверждён" compact status, not "подключён" (`14`) |
| CONTACTS-05 | **FAIL** | Finding 1 — code wiring reuses existing `loadPatientTelegramUsername`/`formatTelegramUsernameMention` correctly, but the feature is unreachable: every patient who actually has Telegram crashes the whole card before Contacts renders |
| CONTACTS-06 | PASS | Live: "M" monogram, "привязан", no technical ID (`14`) |
| CONTACTS-07 | PASS (code trace) | `blocked={telegramBotBlocked}` reuses the pre-existing `bindings.*BotBlocked` field (same one the removed duplicate rows used); no reachable DEV patient had `bot_blocked_at` set, so the red "заблокирован" visual itself is unproved live |
| CONTACTS-08 | PASS | Live: no legend text under Контакты (all three account screenshots) |
| CONTACTS-09 | PASS | Live: "+ доп. телефон" retained; phone copy is the pre-existing single `⧉` action (`12`) |
| CONTACTS-10 | PASS | Code/data trace: `emailVerifiedAt` ← canonical `user_contacts.confirmed_at` for the primary email, the same column that gates `/api/auth/email-password/login` (`409 email_not_verified`) and `resolvePlatformAccessContext`; set only inside `confirmEmailChallenge()`'s `onSuccess` (`claimVerifiedEmail`) after a correct code, never on send. UI never renders `unknown`. **Confirmed** branch live-proved (Вовк Ирина, `14`); **unconfirmed-but-present** branch is code-trace only — no such DEV patient was reachable (crash bug limits the pool to 3 patients, none with an unverified email) |
| CONTACTS-11 | PASS | Live+code: chevron/mailto action removed from the email row |
| ACCESS-01 | PASS | Live+code: no duplicate Telegram-bot/MAX-bot rows in the access block (`12`,`14`) |
| ACCESS-02 | PASS | Live: no separate heading above the two buttons (`12`) |
| ACCESS-03 | PASS | Live: two equal-width buttons, "Заблокировать" / "В архив" (`12`) |
| ACCESS-04 | PASS (code trace) | Diff shows the same `POST /api/doctor/clients/{id}/block` / `PATCH .../archive` endpoints and the same archive confirm-step state machine, only markup changed; no real block/archive was executed against DEV data this session |
| MODAL-03 | PASS | `PersonalDataEditModal` uses `DoctorModal`'s standard `footer` prop (safe-area padding built in); `FilePreviewModal` places its actions inline in the body rather than in `footer` — a design choice, not a duplicated footer implementation, so not a violation |

## Console / runtime errors observed

- The Finding 1 crash (`Что-то пошло не так`, Postgres `42501`) — the only functional error.
- One stray `Failed to load resource: 404` for `DoctorCalendarEventPanel` chunk during Turbopack's
  first-time compile of an unrelated route (self-resolved on the next request; not reproducible after
  warm-up, unrelated to this diff).
- No hydration warnings observed in any screen exercised.

## Was `11bf787c8` safe to land as-is?

**No.** Finding 1 is a severe, majority-impact regression (patient card unusable for ~79% of the sampled
patient base) and directly fails `CONTACTS-05`. Finding 2 is an explicit `FILES-09` FAIL per the audit
brief's own instruction. Both must be fixed (at minimum: guard/remove the `loadPatientTelegramUsername`
call so it can't crash `getPatientCardHeader`, and give the Files block a real fill-available-height
layout) before this candidate is re-considered for landing. Finding 3 is a recommendation, not a blocker.
