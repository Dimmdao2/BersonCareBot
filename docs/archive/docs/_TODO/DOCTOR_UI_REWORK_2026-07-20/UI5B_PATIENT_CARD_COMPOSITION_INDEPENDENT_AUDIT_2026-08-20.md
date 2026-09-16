# UI-5b patient-card composition — independent audit (2026-08-20)

## Re-audit addendum — candidate `18472ef8e66293da1df7af0b5d37ee3d0d102de1`

**PASS.** The five product findings below are closed on the candidate SHA. This addendum reuses the original
K01–K14 blind kill-set; it does not replace the historical first-pass FAIL record.

### Classification: «тест или взгляд»

- Repeatable behavior — standalone/deep-link state, exact tab navigation, prepared-visit action, membership
  actions/configuration and message access boundaries: behavioral acceptance tests.
- One-time composition state — final header contents, exact desktop/mobile geometry, ordered master/detail
  surfaces, removed duplicate panels/copy and PLAN truth: production-diff inspection.

### K01–K14 re-audit

| ID | Result | Evidence on `18472ef8e` |
| --- | --- | --- |
| K01 | PASS | Existing standalone page/guards/bootstrap and `returnTo` remain; no second route/tree/API was added. |
| K02 | PASS | Header keeps FIO, full «Дата рождения» and canonical chat/phone/email/messenger actions; gender and the old mini-stat/chip fields are absent from display and editor. |
| K03 | PASS | Exactly `Карточка / Программа / Файлы / Учётка` render in `DoctorPageHeader.tabs`; legacy ids resolve to `karta`, mounted tab state is preserved and the tab nav is horizontally scrollable. |
| K04 | PASS | `PatientTabKarta` owns one `md:grid-cols-2` master/detail shell; mobile exposes `Данные / Детали` and hides the non-selected pane; selected visit detail starts absent. |
| K05 | PASS | The card mounts one composed Karta surface; legacy Comms/Finances stacking is removed. Removed `comms` navigation can no longer select an invalid top tab; header communication actions continue through `DoctorOpenChatButton`. |
| K06 | PASS | The left master begins with actionable KPI selectors `Визиты / Будущие записи / Абонементы`, ahead of clinical sections. |
| K07 | PASS | Right-pane order is Notes, Tasks, symptom Dynamics, compact Program and exercise Completion; empty Notes/Tasks prose is absent while add actions remain. |
| K08 | PASS | Program summary shows title, control date and stage pager with active-stage treatment; exercise/media composition is absent and the title opens the existing Program tab. |
| K09 | PASS | Exact-org appointment projection derives `hasVisitRecord` from `clinical_visits`; a prepared visit renders `Открыть заметки` and opens the selected detail instead of starting duplicate creation. |
| K10 | PASS | Left membership surface keeps active list plus closed history; consume/recalculate are active-only, while Add opens the right canonical configuration/selection/payment forms without duplicating package cards. |
| K11 | PASS | Forbidden empty/instructional copy remains removed, diagnoses use one `Диагнозы` list, and Karta reuses the Overview symptom severity-color class. |
| K12 | PASS | Snapshot content/count requires exact organization, a specialist participant identity and membership in the actor-authorized conversation list; null-org, foreign patient, absent authorization and null-specialist cases return no content/count, while the authorized case remains green. |
| K13 | PASS | No in-card search or UI-7 scheduler surface was introduced; search is still owner-deferred and UI-7 checkboxes remain open. |
| K14 | PASS | PLAN records the measured census, truthful closures, open deferred search, and owner-deferred UI-7 without closing it. |

All **14/14** groups pass; **0 failed**, **0 unassessed**.

### Closure of the five initial findings

1. **Access boundary — closed:** exact-org and actor-authorized intersection precedes message/count reads; a
   workspace without a participant specialist identity fails closed.
2. **Broken communications navigation — closed:** the four-tab parent no longer selects removed `comms`; the
   consolidated card remains visible and canonical header chat actions remain valid.
3. **Composition absent — closed:** one 50/50 desktop / one-part mobile master-detail composition now owns the
   moved Records and Overview blocks without stacked Comms/Finances duplicates.
4. **Duplicate visit path — closed:** canonical appointment rows expose exact-org visit presence and prepared
   visits open their existing notes.
5. **False PLAN/header closure — closed:** gender was removed from the header editor and the PLAN evidence now
   describes the actual selected-detail composition.

### Validation evidence

- `pnpm --dir apps/webapp exec vitest --run 'src/app/app/doctor/patients/[userId]/PatientCardClient.ui.test.tsx' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.ui.test.tsx' 'src/app/api/doctor/patients/[userId]/messages-snapshot/messagesSnapshot.route.test.ts'`
  → exit **0**, **3 files passed / 16 tests passed**.
- New-surface fault injection, access class: temporarily inverted the actor-authorized conversation-id
  intersection, then ran the absent-authorization acceptance case → exit **1**; mutation reverted.
- New-surface fault injection, composition action class: temporarily kept `rightPane` on `overview` for
  `Добавить абонемент`, then ran the membership-detail acceptance case → exit **1**; mutation reverted.
- Re-audit fault-injection result: **2 killed / 0 un-killed**. Combined with the first audit's four independent
  oracles: **6 killed / 0 un-killed**.
- `git status --short && git diff --check` after reverting both mutations → exit **0**, clean candidate tree.
- Scoped lint and webapp typecheck were already green for this exact candidate and no product/test source changed
  during re-audit; per the strong-reuse rule they were not repeated. Full CI and live server remain outside this
  focused independent audit.

## Initial audit verdict (historical)

**FAIL** for product candidate `420b737e5d493e3f39f6c31a5c43ff18c9642043` at synchronization HEAD
`f092b4c044ebacccb4c016da8d82748b6f65618a`.

The audit used behavioral tests for repeatable navigation/action/access outcomes and one inspection pass for
placement, responsive composition, text and PLAN state. No production code or PLAN was changed.

## Blind kill-set result

| ID | Method | Result | Evidence |
| --- | --- | --- | --- |
| K01 standalone route/guards/bootstrap/returnTo/history; no second tree/API | inspection | PASS | The standalone page still uses `requireDoctorWorkspaceContext`, organization-scoped identity and the existing bootstrap; legacy routes redirect into it. Candidate diff adds no route or API family. |
| K02 header contents/deep links/chat | inspection | **FAIL** | FIO/date and existing chat/deep links remain, but opening FIO edit still renders the forbidden gender control in `PatientCardClient.tsx:495-525`; its `SelectTrigger` also has no `displayLabel`. PLAN nevertheless closes the “header only” item. |
| K03 exact four top tabs/legacy tabs/mobile reachability | behavioral + mutation | PASS | Exactly `Карточка / Программа / Файлы / Учётка` are in `DoctorPageHeader.tabs`; the nav scrolls horizontally. Temporary `Учётка → Аккаунт` fault was killed by the existing UI assertion and was reverted. |
| K04 desktop 50/50/mobile one-part/detail-hidden composition | inspection | **FAIL** | `PatientCardClient.tsx:718-777` stacks five legacy surfaces. Their inner grids use unrelated ratios (`PatientTabRecords.tsx:376`, Karta `lg` grids) instead of one 50/50 master/detail; mobile stacks both regions rather than showing one part at a time. |
| K05 moved content not duplicated; messaging path/access unchanged | behavioral + inspection | **FAIL** | Karta, Overview, Records, Finances and Comms are all rendered in sequence. Overview’s “вся переписка” still emits `comms` (`PatientTabOverview.tsx:2042-2048`); the parent casts it to the now four-value `TabId` (`PatientCardClient.tsx:734-739`), hides the card and shows no panel. Acceptance test is red. |
| K06 KPI opens required left content | inspection | **FAIL** | Overview renders only `Контроль / Абонемент` (`PatientTabOverview.tsx:1425-1472`), not actionable `Визиты / Будущие записи / Абонементы` above diagnoses. |
| K07 right Notes/Tasks/Dynamics/Program/Completion and empty actions | inspection | **FAIL** | There is no composed right pane; legacy Overview still renders explanatory empty prose `Заметок нет.` and `Задач нет.` (`PatientTabOverview.tsx:1767-1769,1855-1857`). |
| K08 compact navigable program summary | inspection | **FAIL** | The title is plain text, no control date is shown, and stage exercise rows/media are rendered (`PatientTabOverview.tsx:1930-1933,1977-2017`). |
| K09 prepared visit opens notes without duplicate creation | behavioral | **FAIL** | `mapRealToDisplay` hardcodes `hasVisitRecord: false` (`PatientTabRecords.tsx:68-86`); the prepared-appointment acceptance test receives `Оформить визит`, not `Открыть заметки`. |
| K10 membership list/history/actions/configuration flow | inspection | **FAIL** | The old Records membership summary and full Finances surface are both stacked. The existing membership panel preserves active-only consume/recalculate, but Add remains its inline details flow rather than opening the required right configuration/selection/payment pane. |
| K11 forbidden empty/instructional text and diagnosis/symptom presentation | inspection | **FAIL** | The Karta-specific diagnosis removals are present, but the newly stacked legacy surfaces retain forbidden explanatory/empty copy, including Notes/Tasks and Records instructions (`PatientTabRecords.tsx:476-478`). |
| K12 org/record-class visibility and operation parity | behavioral + inspection | **FAIL** | `loadDoctorPatientMessagesSnapshot.ts:23-42` admits conversations with no organization and counts unread by conversation only. More fundamentally, the route has no explicit verified participant/recipient grant although OPERATING_MODEL §6 requires communication content/existence to fail closed without it. The null-organization acceptance test is red. |
| K13 deferred in-card search and UI-7 scheduling excluded | diff/search inspection | PASS | Candidate changes only the card composition/bootstrap/tests/PLAN (plus later merge-only sync); no search/dropdown or scheduler behavior was added. UI-7 boxes remain open. |
| K14 PLAN truth/defer state | inspection | **FAIL** | UI-7 defer is correctly recorded without closing boxes, but the `[x]` header-only claim is false while the gender editor remains; the selected-detail `[x]` cites collapse of the old history rather than the required selected-detail composition. |

All **14/14** named groups were assessed: **11 triggered**, **3 not triggered**, **0 unassessed**. The automated
behavioral set covered **4 independent classes: 4 caught/killed, 0 un-killed** (three product-red acceptance
oracles plus one injected tab-label fault). Presentation/mechanical requirements received one inspection pass.

## Product findings

1. **Access boundary:** any doctor who can resolve the patient identity can receive same-org communication content
   and unread existence metadata without the required participant/recipient grant; legacy null-org conversations
   are also admitted. Impact: restricted patient communication can be disclosed to non-participants.
2. **Broken card navigation:** “вся переписка” selects removed tab id `comms`, hiding the only mounted card panel.
   Impact: the doctor gets an empty workspace until choosing a valid top tab.
3. **Composition absent:** the candidate concatenates the five old panels rather than implementing the required
   master/detail card. Impact: duplicated visits/memberships/communications, wrong desktop/mobile interaction,
   missing KPI/right-pane/program/membership outcomes.
4. **Duplicate visit path:** the appointment projection cannot represent an existing visit record and therefore
   offers visit creation for a prepared visit. Impact: a doctor can start a duplicate clinical visit instead of
   opening its notes.
5. **False PLAN closure/header content:** the forbidden gender editor remains under a closed header checklist item;
   the selected-detail item is closed using evidence for a different old-history collapse.

## Validation evidence

- `pnpm --dir apps/webapp exec vitest --run 'src/app/app/doctor/patients/[userId]/PatientCardClient.ui.test.tsx' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.ui.test.tsx' 'src/app/api/doctor/patients/[userId]/messages-snapshot/messagesSnapshot.route.test.ts'`
  → exit **1**, **3 failed / 8 passed / 11 total**. The three failures are the three intentional acceptance oracles.
- Fault injection: temporarily changed the account-tab label `Учётка` to `Аккаунт`, then ran
  `pnpm --dir apps/webapp exec vitest --run 'src/app/app/doctor/patients/[userId]/PatientCardClient.ui.test.tsx' -t 'renders exactly four product tabs inside the page header'`
  → exit **1**, assertion could not find `Учётка`; mutation reverted.
- `pnpm --dir apps/webapp typecheck` → exit **0**.
- `pnpm --dir apps/webapp exec eslint 'src/app/app/doctor/patients/[userId]/PatientCardClient.ui.test.tsx' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.ui.test.tsx' 'src/app/api/doctor/patients/[userId]/messages-snapshot/messagesSnapshot.route.test.ts'`
  → exit **0**.
- Full CI and live dev server were not run: the brief requires focused evidence, and the product-red acceptance
  tests already provide the gate result.

One incorrectly formed initial Vitest command included an extra `--`, began a broad webapp run, and was terminated;
it is discarded and is not cited as validation evidence.
