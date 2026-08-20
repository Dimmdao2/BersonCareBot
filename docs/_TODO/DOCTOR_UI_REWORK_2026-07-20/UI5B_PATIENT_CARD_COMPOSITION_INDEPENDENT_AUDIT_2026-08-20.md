# UI-5b patient-card composition — independent audit (2026-08-20)

## Verdict

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
