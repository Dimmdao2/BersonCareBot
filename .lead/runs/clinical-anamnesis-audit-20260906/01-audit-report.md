# auditor-live report — candidate `ac5c4f5d1`, branch `wt/clinical-anamnesis-20260906`

Blind kill-set written first: [`00-blind-killset.md`](00-blind-killset.md) (before reading the diff and before
reading any test file). Canon read first: AGENTS.md §10a, §10b, §16, §17, §21, §24 + owner checklist
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` P4.1–P4.3.

**VERDICT: FAIL** — one hard CI gate is red on the candidate and one repo-rule (§16) is violated. Every owner
requirement in scope is otherwise satisfied and was proven live.

---

## 1. Findings

### F1 — `pnpm run audit` (final full-CI step) is red: the new table has no RLS descriptor/classification

`node scripts/check-saas-db-regression.mjs` → **exit 1**:

```
check-saas-db-regression: SAAS new public org-table RLS coverage
check-new-table-rls-coverage: NEW public organization_id table lacks RLS coverage;
missing RLS descriptor/classification: public.clinical_disease_anamnesis.
```

`package.json:65` — `"audit": "node scripts/check-saas-db-regression.mjs"` — is the last step of
`ci:resume:after-build-webapp`, so full CI cannot go green on this SHA.

The table was declared in `deploy/postgres/privileges/declaration.ts` (REV10_CLINICAL_ACCESS + TABLE_ROWS +
REV10_LOCKED_POLICY_DATA) but not in the three registries its sibling `clinical_anamnesis_*` tables occupy:

- `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:255` — `['public.clinical_anamnesis_illness', { column: 'patient_user_id' }]`
- `docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs:47` — `'public.clinical_anamnesis_illness',`
- `deploy/postgres/phase4-force-rls-cutover.sql:131` — `('"public"."clinical_anamnesis_illness"'),`

Not an open wall: the privilege generator already emits `ENABLE`/`FORCE ROW LEVEL SECURITY` and both policies
for the table (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:13189-13223`). This is a classification
gap that fails the gate, and the gate is fail-closed by design.

Reproduce: `node docs/_TODO/SAAS_FOUNDATION/scripts/check-new-table-rls-coverage.mjs` → exit 1.
(Note: `… | tail` swallows the code — check `$?` on the bare command.)

### F2 — §16 violation: local `text-[13px]` in the new symptom preview

`apps/webapp/src/app/app/doctor/patients/[userId]/tabs/karta/PatientClinicalSections.tsx:273`

```tsx
<span className="mt-0.5 block truncate text-[13px] font-normal text-muted-foreground">
```

§16 «Chrome-типографика»: «Локальные `text-[13px]`, `text-[18px]`, `text-lg`, `text-xl`, `text-2xl`,
`text-3xl` запрещены; нестандартные размеры разрешены только через соответствующие общие роли», and §16's own
self-check grep targets exactly this token. After this commit it is the **only** `text-[13px]` in
`app/app/doctor` + `shared/ui/doctor`:

```
$ grep -rn "text-\[13px\]|text-lg|text-xl|text-3xl" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob '*.tsx'
…/karta/PatientClinicalSections.tsx:273
```

The shared role is `doctorMetaTextClass` = `text-[13px] leading-[18px] text-muted-foreground md:text-xs
md:leading-4`, re-exported as `doctorDnaFlatListMetaClass` — **already imported in this file and used on the
very next element**. Besides the rule, the local literal also loses the desktop step-down: the preview line
stays 13px on desktop while the meta line 4 lines below drops to `text-xs`, so two adjacent muted lines in the
same row disagree. One-line fix: `cn(doctorDnaFlatListMetaClass, 'mt-0.5 block truncate font-normal')`.

### F3 — §10b: the added route-test case is a duplicate of an already-covered failure class (low)

`apps/webapp/src/app/api/doctor/patients/[userId]/patientCardNeverGated.route.test.ts` gained
`it('sets the disease anamnesis text')`. It targets the same handler and the same #1069 gate as the existing
`it('appends an anamnesis entry')`. Proven, not asserted — I re-introduced the gate in the POST handler
(temporary mutation, reverted):

```
× appends an anamnesis entry      AssertionError: expected 403 to be 201
× sets the disease anamnesis text AssertionError: expected 403 to be 200
Tests  2 failed | 9 passed (11)
```

The pre-existing case already reddens, so the new `it` adds no independent class. §10b filter 4 («нет ли уже
достаточной защиты») and «нет бессмысленного дубля» → delete the added `it` and, with it, the
`setAnamnesisDisease` entry in `fakes`/`fakeDeps`/`beforeEach` that exists only to serve it. Non-blocking.

---

## 2. Owner IDs

| ID | Verdict | Evidence |
|---|---|---|
| `CLINICAL-SYMPTOM-01` | **PASS** | Live, iPhone-XR 414×896. Description branch: `04-mobile-preview-description-truncated.png` — first line only, ellipsis, muted, under the name. Fallback branch: `02-…-symptom-preview.png` — first entry's note is `NULL`, so the preview takes the next non-empty note and only its first line («Стало реже, пока сила боли не меняется.», source note is 2 lines). Earliest-not-latest proven by appending a NEWER note through the app API and re-rendering: preview unchanged (`03-mobile-preview-earliest-note.png`); test row deleted afterwards. `complaintAnamnesisPreview` (PatientClinicalSections.tsx:40) matches, and `pgPatientClinical.ts:167` orders history `asc(createdAt)`. |
| `CLINICAL-SYMPTOM-02` | **PASS** | Live: Иванова's two symptoms have neither description nor notes → **no preview row at all** (`01-mobile-ivanova-karta.png`). Date/срок, severity badge, trend line and the red `!` key-symptom marker are all still rendered on the same rows. `firstLine()` trims, so a whitespace-only value is treated as empty. |
| `CLINICAL-DIAGNOSIS-01` | **PASS** | No code change in this commit; verified live against the real routes with no visit context: created **and** edited both a symptom and a diagnosis from the card — `{"ok":true}` ×4, stored rows had `source_visit_id = NULL`. Fixtures deleted. `clinical_complaint.source_visit_id`, `clinical_diagnosis.source_visit_id`, `clinical_complaint_update.visit_id` are all NULLABLE; `updateDiagnosisFields` writes `clinical_diagnosis` directly and never touches the visit-bound `clinical_diagnosis_update`. No entitlement/visit gate in `complaints/route.ts`, `diagnoses/route.ts` or `anamnesis/route.ts`. |
| `DISEASE-ANAMNESIS-01` | **PASS (persistence: structural, see §4)** | Live order on card: Симптомы → Диагнозы → **Анамнез заболевания** (own white `doctorSectionCardClass` block) → Анамнез жизни (`01-…-karta.png`, `30-desktop-karta.png`). Not mixed into the biographical sections. Patient-scoped single text by construction: `uq_clinical_disease_anamnesis_patient_org (patient_user_id, organization_id)` + `onConflictDoUpdate` on that target; org from `requiredPrincipalOrganizationId()`; read filtered by `patientUserId` (+ org when a principal org exists) and backed by FORCE RLS. |
| `DISEASE-ANAMNESIS-02` | **PASS** | `SquarePen` icon, right side of the block header, shared `Button variant="ghost" size="icon-sm"` — same primitive/placement as the section it replaced. Visible in `01-mobile-ivanova-karta.png` / `15-mobile-short-no-chevron.png`. Editor form contains only the textarea + Сохранить — no patient selector (`11-mobile-editor-long-text.png`, `31-desktop-editor-top-oriented.png`); the patient comes from the card and is shown in the modal title. |
| `DISEASE-ANAMNESIS-03` | **PASS** | Measured in the live DOM, not read from source. Collapsed: `{clamp:"5", visibleLines:5, totalLines:16}` + chevron-down centred at the bottom (`12-mobile-after-save-collapsed.png`). Chevron down → `{clamp:"none", visibleLines:16, totalLines:16}` (`13-mobile-expanded.png`). Chevron up → `{clamp:"5", visibleLines:5, totalLines:16}` (`14-…-recollapsed.png`). Empty text → no chevron (`01-…-karta.png`). Short text saved **over** the long one → chevron disappears, i.e. it re-measures instead of going stale: `{visibleLines:1, totalLines:1}`, 1 button left in the block = the SquarePen (`15-mobile-short-no-chevron.png`). |
| `DISEASE-ANAMNESIS-04` | **PASS** | Next layer of the shared `DoctorModal` over the still-mounted card (card content queryable underneath). Computed style of the input: `border:0px`, `background:rgba(0,0,0,0)`, `padding:0px`, `resize:none` — borderless, no nested frame, no raw dialog shell. Mobile growth direction measured from empty: `taBottom` pinned at 819 while `taTop` moves 795 → 627 (8 lines) → 107 (60 lines) — starts at the bottom above the footer and grows upward (`20/21/22-mobile-*`, `11-mobile-editor-long-text.png`). Desktop 1440×900: `taTop == bodyTop + 16px` at every length — top-oriented, borderless (`31-desktop-editor-top-oriented.png`). Single scroll owner at every length I measured: while the text fits, the auto-grow keeps the textarea's own `scrollHeight == clientHeight` so only the modal body could scroll; at 60 lines flex-shrink caps the textarea at the body height and the textarea's native scroll takes over while the modal body reports `scrollHeight == clientHeight` (745 == 745 mobile, 706 == 706 desktop) — so exactly one element scrolls in both regimes, never two (`22-mobile-…png`, `22-desktop-…png`). |
| `DISEASE-ANAMNESIS-05` | **PASS** | Save: block updates in place, no navigation/reload (card DOM survives), only the top layer closes (0 textareas left, card intact), shared `react-hot-toast` «Сохранено» (`15-mobile-short-no-chevron.png`). Cancel: draft «ОТМЕНЁННЫЙ ЧЕРНОВИК…» typed then closed → block text unchanged (`16-mobile-editor-with-draft-before-cancel.png` + `step6_after_cancel_text`), because `openEditor()` re-seeds `draft` from `text`. Failure is loud, not silent — verified twice: injected 500 and a real 400 (20 001 chars > `z.string().max(20000)`) both give the shared toast «Не удалось сохранить» **and** an inline `FormError` above the input, the modal stays open with the draft intact, Сохранить re-enables and the block text does not change (`17-mobile-save-failure-toast.png`, `18-mobile-oversize-save.png`). |
| `LIFE-ANAMNESIS-01` | **PASS (see §5 note on «после блока приёмов»)** | Own block titled «Анамнез жизни» with all four subsections — сопутствующие заболевания, травмы и операции, болезни и стрессы, образ жизни — rendered with existing data (`01-…-karta.png`, `15-…png`, `30-desktop-karta.png`). No separate legacy «Сопутствующие заболевания» block anywhere on the card: the only occurrence in `app/doctor/patients/**` is the subsection title inside this block. |
| `LIFE-ANAMNESIS-02` | **PASS** | The intermediate «open the full list» modal is gone; subsections render inline and never collapse — every filled value is visible without a click. Colour contract confirmed on one screen holding both states (`15-mobile-short-no-chevron.png`): «Травмы и операции» and «Образ жизни» (filled) are black `text-foreground`, «Сопутствующие заболевания» and «Болезни, стрессы» (empty) are muted grey. Empty state is a bare `—`; `grep` finds no «записей нет» / «не внесено» in the doctor patient zone. |
| `LIFE-ANAMNESIS-03` | **PASS** | Editing goes through the pre-existing `PATCH /api/doctor/patients/[userId]/anamnesis` + `UpdateAnamnesisEntryInput` + the same nested editor modal; no parallel contract was introduced for life anamnesis (the new `SetAnamnesisDiseaseInput` belongs to the separate disease block). Live: edited an existing trauma entry and reverted it — row count stayed 2, ids unchanged, no delete. The route exposes no `DELETE`; the three `clinical_anamnesis_*` tables are untouched by the schema diff, so no new per-encounter dependency. |

---

## 3. Migration and privileges verdict — **PASS, except F1**

| Check | Result |
|---|---|
| GRANT / REVOKE / CREATE ROLE / ALTER ROLE / ALTER DEFAULT PRIVILEGES / CREATE POLICY in the migration | none — `node scripts/check-migration-privileges.mjs` → `OK (124 migration files)` |
| statement-owner contract | all 3 statements carry `-- BCB-MIGRATION-OWNER: app_object_owner`; `postgres` not used; `BCB-MIGRATION-VERIFY` probe present in the leading block |
| timestamp-forward / naming / collisions | `20260906T025405_the_disease_anamnesis_is_one_replaced_text.sql` matches `YYYYMMDDTHHMMSS_slug`, unique second; `bash apps/webapp/scripts/check-drizzle-migration-order.sh` → OK. It sorts before the already-pending `20260906T101500`, but both are unapplied and pending is selected by ledger `tag`, not by watermark (`migration-order.mjs:44`), so nothing is skipped — DEV ledger max is `20260905T233449`. |
| `meta/_journal.json` | untouched, still `{"version":"7","dialect":"postgresql","entries":[]}`; `meta/*.json` snapshots not in the commit |
| table declared before the migration | yes — the static gate refuses an undeclared guarded table and passes |
| `app_staff` read/write/update path | `GRANT SELECT` (table) + `GRANT INSERT (created_at, created_by, id, organization_id, patient_user_id, text)` + `GRANT UPDATE (text)`. The upsert inserts exactly those columns and its `DO UPDATE` sets only `text`, so the column grants match the statement exactly — no runtime `42501`. |
| owner / RLS | `OWNER TO app_object_owner`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, restrictive `rev10_context_gate_75` + permissive `rev10_saas_org_dormant_p0_8_3` with the org-or-patient predicate mirroring `clinical_anamnesis_*` |
| generated parity | `generate-cli.mjs --check` and `--all --check --port-context-only` → byte-exact, both green. The 1 180-line churn in the two `privileges.*.sql` files is policy renumbering (`rev10_*_76` → `_77`) caused by inserting a table alphabetically before `clinical_test_regions`; +38 net lines. |
| index on hot columns in the same PR (§1) | `uq_…_patient_org (patient_user_id, organization_id)` + `idx_…_organization_id` |
| **owner-aware rollback-only preflight** | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` → **PASS**. `Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=3 total=123 … unapplied=0`. Real `SET LOCAL ROLE` owners + FORCE RLS, single transaction ending in ROLLBACK. Shared DEV unchanged: `select to_regclass('public.clinical_disease_anamnesis')` → empty afterwards. (`--runtime-env-root` is the repo's preflight-only path for exactly this case — an exact candidate checkout with no env files.) |
| **live DB/RLS behavioural proof** | **BLOCKED** — see §4 |
| new-table RLS coverage gate | **FAIL** — finding F1 |

### 4. BLOCKED: live RLS proof for `clinical_disease_anamnesis`

A `*.devDbProof.test.mjs` / `*.rls.integration.test.ts` run against the table is impossible on this candidate:
the relation does not exist on `bcb_webapp_dev`, and creating it means applying the migration, which AGENTS.md
§1/§3b puts **after** landing (`candidate rollback-preflight → checks → audit → landing → integration
preflight → --execute`). Applying it now would also leave a rejected candidate's table on the shared DEV.
I did not do it, and I did not create a disposable database.

Safe command once the branch has landed on the integration branch:

```
bash deploy/host/migrate-dev.sh --execute          # from the integration checkout, not from a worktree
```

then the behavioural proof against the named DEV per §10b. Until then the wall is established structurally
only: declaration → generated `ENABLE`/`FORCE RLS` + both policies → deploy `assert_*` steps. No fake route
test in this audit claims a DB/RLS guarantee.

---

## 5. Observations (recommendations, not findings — §24.6)

1. `LIFE-ANAMNESIS-01` says «После блока приёмов расположен … «Анамнез жизни»». The `Приёмы: N` block is
   `ENCOUNTERS-01`, a later still-unchecked stage; today «Анамнез жизни» follows «Анамнез заболевания»
   directly. Nothing in this candidate contradicts the requirement — the relative order will only become
   observable when the encounters block lands. Flagged so it is not read as closed prematurely.
2. `text-[14px]` (PatientClinicalSections.tsx:1090) is now the only such literal in the doctor zone. It is not
   on §16's forbidden list, so it is not F2, but the shared body role (`text-base` / `md:text-sm`) is the
   intended source.
3. `AnamnesisState.disease` is optional (`disease?: string`). Every real producer sets it (pg repo, in-memory
   repo) and the SSR bootstrap reuses the same port, so the "silently empty block" path is not reachable
   today; a required field would make it unreachable by construction.
4. `uq_clinical_disease_anamnesis_patient_org` covers a nullable `organization_id`. Under default NULLS
   DISTINCT a NULL-org row would not dedupe and `ON CONFLICT` would not fire. Unreachable, because the write
   path goes through `requiredPrincipalOrganizationId()`.
5. `complaintAnamnesisPreview` depends on `ActiveComplaint.history` being oldest-first. That is true
   (`pgPatientClinical.ts:167` orders `asc(createdAt)`) and was proven live, but the ordering is not stated on
   `ComplaintHistoryEntry` the way it is on `trend`. Documenting it — or selecting by `recordedAt` explicitly —
   would make a future "show newest first" refactor unable to silently flip the preview.
6. `POST … {section:'disease'}` answers `200`, the three sibling sections answer `201`. No owner requirement
   touches this; noted only because the response shape now differs inside one endpoint.

---

## 6. Blind kill-set outcome

Format: `breakage → the assertion/observation that caught it`. Faults marked **[injected]** were physically
introduced by me and rolled back; the rest were checked against the real product and real data.

| # | breakage | caught by |
|---|---|---|
| S1-1 | fallback takes the latest history note instead of the earliest | live: appended a NEWER note through the app API — preview did not change (`03-…png`) |
| S1-2 | history wins over the symptom's own description | live: setting a description flipped the preview to it (`04-…png`) |
| S1-3 | whole multi-line text rendered instead of the first line | live: 2-line source note → 1 preview line (`02-…png`); 2-line description → 1 line (`04-…png`) |
| S1-4 | empty/whitespace entry not skipped → blank preview | live: first history row has `note = NULL`, preview took the next one (`02-…png`); `firstLine()` trims |
| S1-5 | no ellipsis, line wraps | live: `…` at the viewport edge (`04-…png`) |
| S1-6 | preview also on non-active symptoms | read: `ComplaintRow` renders it for both, `historical` only recolours — matches the owner text («под названием каждого актуального симптома» is not an exclusion of history rows); no owner requirement broken |
| S2-1 | empty preview row rendered | live: Иванова's two symptoms render no preview element (`01-…png`) |
| S2-2 | preview duplicates a string already on the row | live: preview ≠ symptom name in every observed row |
| S2-3 | date / срок / динамика / important marker lost | live: all four still present next to the new line (`04-…png`, `01-…png`) |
| D1-1 | add/edit hidden without an active encounter | live: «Добавить симптом»/«Добавить диагноз» present on the card with no visit context (`01-…png`) |
| D1-2 | route rejects a write without `encounterId` | live: create+edit of both entities returned `{"ok":true}` with no visit |
| D1-3 | NOT NULL `visit_id` blocks the insert | introspection: `source_visit_id` / `visit_id` NULLABLE; stored rows had NULL |
| D1-4 | edit path still gated | live: PATCH on both entities succeeded; `updateDiagnosisFields` never writes `clinical_diagnosis_update` |
| DA1-1 | block in the wrong position | live: order Симптомы → Диагнозы → Анамнез заболевания → Анамнез жизни |
| DA1-2 | text stored per-encounter | read: table has no visit column; upsert keyed on `(patient_user_id, organization_id)` |
| DA1-3 | merged into the life-anamnesis card | live: separate white `doctorSectionCardClass` section |
| DA1-4 | read not scoped by patient | read: `eq(patientUserId)` + RLS patient predicate |
| DA1-5 | read/write not scoped by clinic | read: `requiredPrincipalOrganizationId()` on write, org filter on read, FORCE RLS org predicate. **Live cross-tenant proof BLOCKED — §4** |
| DA2-1 | wrong icon | live + read: `SquarePen` |
| DA2-2 | action not right-aligned in the header | live (`01-…png`) |
| DA2-3 | patient selector in the form | live: form is textarea + Сохранить only |
| DA2-4 | hand-rolled icon button instead of the shared primitive | read: shared `Button variant="ghost" size="icon-sm"` from doctor primitives; ESLint zone check green |
| DA3-1 | false chevron on short/empty text | live: empty → none (`01-…png`); short → none (`15-…png`) |
| DA3-2 | no chevron on real overflow | live: 16-line text → chevron (`12-…png`) |
| DA3-3 | clamp is not 5 lines | live DOM: `webkitLineClamp:"5"`, `visibleLines:5` |
| DA3-4 | expand still clamped | live DOM: `clamp:"none"`, `visibleLines:16 == totalLines:16` |
| DA3-5 | chevron up does not restore 5 lines | live DOM: back to `visibleLines:5` |
| DA3-6 | overflow measured once, then stale | live: saved a SHORT text over the long one → chevron disappeared |
| DA3-7 | chevron not centred at the bottom | live (`12-…png`) |
| DA4-1 | raw dialog shell / local modal | read + live: `DoctorModal`, canonical mobile drawer chrome and desktop dialog |
| DA4-2 | replaces the layer instead of stacking | live: card still mounted and queryable under the modal |
| DA4-3 | bordered textarea on mobile | live computed style: `border:0px`, transparent bg, `padding:0px` |
| DA4-4 | mobile input top-anchored / grows downward | live geometry: bottom pinned at 819, top 795 → 627 → 107 |
| DA4-5 | textarea behind the footer | live: `taBottom 819 < bodyBottom 835`, footer below |
| DA4-6 | desktop bottom-anchored | live: `taTop == bodyTop + 16` at 1, 8 and 60 lines |
| DA4-7 | double scroll owner | live: body `scrollHeight == clientHeight` at 60 lines |
| DA5-1 | needs a reload to show the new text | live: block updated in place, card DOM survived |
| DA5-2 | closes the whole stack | live: 0 textareas after save, card intact |
| DA5-3 | failure swallowed silently | **[injected]** 500 via route interception **and** a real 400 (20 001 chars) → toast «Не удалось сохранить», modal stays open, block unchanged |
| DA5-4 | local ad-hoc toast | read: shared `react-hot-toast`, same import as the rest of the file |
| DA5-5 | cancel persists the draft | live: typed a draft, closed, text unchanged |
| DA5-6 | writes to a stale/other patient | read: `userId` comes from props and is re-resolved server-side through `getClientIdentityForOrganization` |
| LA1-1 | old «Сопутствующие заболевания» block survives | live + grep: only the subsection title inside the new block |
| LA1-2 | life anamnesis before the encounters block | n/a this stage — §5.1 |
| LA1-3 | a subsection missing | live: all four present |
| LA1-4 | existing rows not read | live: Иванова's 2 trauma + 1 lifestyle rows rendered |
| LA2-1 | subsections still collapsible | live: values visible with no interaction |
| LA2-2 | title colours inverted | live: filled black, empty muted, both on one screen (`15-…png`) |
| LA2-3 | «записей нет» / «не внесено» | live + grep: only `—` |
| LA2-4 | empty subsection dropped entirely | live: shown, muted, with `—` |
| LA3-1 | new parallel contract for life anamnesis | read: same PATCH route + `UpdateAnamnesisEntryInput` |
| LA3-2 | edit deletes/replaces historical rows | live: edited + reverted, row count and ids unchanged; no `DELETE` handler |
| LA3-3 | new NOT NULL encounter dependency | read: the three `clinical_anamnesis_*` tables are untouched by the diff |
| LA3-4 | edit writes to another patient | read: `patientUserId` re-resolved server-side; repo filters by it |
| M-1 | GRANT/REVOKE in the migration | `check-migration-privileges.mjs` → OK |
| M-2 | relation missing from the declaration → runtime 42501 | declaration read + column-exact grant match with the upsert |
| M-3 | RLS not enabled / no policy | generated artifact lines 13189-13223 |
| M-4 | generated artifacts stale | `generate-cli.mjs --check` ×2 byte-exact |
| M-5 | timestamp not forward → silently skipped | `check-drizzle-migration-order.sh` OK; pending is by ledger `tag`; DEV ledger max is older than both pending files |
| M-6 | `meta/_journal.json` hand-edited | not in the commit; still `entries: []` |
| M-7 | wrong table owner | `OWNER TO app_object_owner` in the artifact, `BCB-MIGRATION-OWNER: app_object_owner` in the migration |
| M-8 | preflight fails | preflight PASS, rolled back, DEV unchanged |
| #1069 | a new patient-card write route lands behind the tariff gate | **[injected]** re-added `getSnapshot` + 403 to the anamnesis POST → the **pre-existing** `appends an anamnesis entry` case reddens (`expected 403 to be 201`) — which is what makes the newly added case redundant (F3) |

**Uncaught: 1.** `DA1-5` (live cross-tenant read/write proof for the new table) has no evidence beyond the
declaration and the generated policy, because the table cannot exist on DEV before landing — see §4. No named
fault was left unaddressed for any other reason. Per §10a, an uncaught fault is a fact for the report, not an
automatic task; this one is a sequencing block, not a defect.

**No new tests were added.** Every remaining kill-set item is either presentation (the plan itself says
«визуальные требования закрываются только живой проверкой mobile UI, а не тестами текста/классов» and
«Presentation-правки не покрываются новыми UI-тестами»), or a one-off action proven by reading the final state
per §24.4, or a DB/RLS guarantee that §10b lets only the live `devDbProof` layer claim. Naming a failure I
could not both make expensive-and-silent *and* prove at a cheaper layer would have produced machinery, not
protection.

---

## 7. Runs

| what | command | result |
|---|---|---|
| webapp typecheck | `pnpm --dir apps/webapp typecheck` | exit 0 |
| ESLint (changed files) | `npx eslint <6 changed files>` from `apps/webapp` | exit 0 |
| route test (as committed) | `npx vitest --run --project=route …/patientCardNeverGated.route.test.ts` | 11 passed |
| migration privileges gate | `node scripts/check-migration-privileges.mjs` | OK (124 files) |
| migration order gate | `bash apps/webapp/scripts/check-drizzle-migration-order.sh` | OK |
| generated privileges parity | `node deploy/postgres/privileges/generate-cli.mjs --check` (+ `--all --check --port-context-only`) | byte-exact |
| **saas db regression / audit** | `node scripts/check-saas-db-regression.mjs` | **exit 1 — F1** |
| rollback-only preflight | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | PASS, rolled back |
| live candidate | `NODE_ENV=development npx next dev --webpack -H 127.0.0.1 -p 5210` (isolated port; 5200 untouched, still answering) | screenshots below |

Full CI was not run (out of scope for this pass).

## 8. Screenshots

All under `.lead/runs/clinical-anamnesis-audit-20260906/`, each one opened and read by me:

`01-mobile-ivanova-karta.png`, `02-mobile-nechaeva-symptom-preview.png`,
`03-mobile-preview-earliest-note.png`, `04-mobile-preview-description-truncated.png`,
`10-mobile-editor-empty.png`, `11-mobile-editor-long-text.png`, `12-mobile-after-save-collapsed.png`,
`13-mobile-expanded.png`, `14-mobile-recollapsed.png`, `15-mobile-short-no-chevron.png`,
`16-mobile-editor-with-draft-before-cancel.png`, `17-mobile-save-failure-toast.png`,
`18-mobile-oversize-save.png`, `20-mobile-editor-empty-anchor.png`,
`21-mobile-editor-grows-upward.png`, `22-mobile-editor-overflow-scrolled-top.png`,
`20-desktop-editor-empty-anchor.png`, `21-desktop-editor-grows-upward.png`,
`22-desktop-editor-overflow-scrolled-top.png`, `30-desktop-karta.png`,
`31-desktop-editor-top-oriented.png`.

`10-mobile-editor-empty.png` and `11-mobile-editor-long-text.png` are the same frame: at that point in the
flow the block already held the long text, so `openEditor()` seeded the draft from it. The genuinely empty
editor is `20-mobile-editor-empty-anchor.png`.

## 9. State left behind

- Product code: **unchanged**. Both temporary mutations (the #1069 gate injection in `anamnesis/route.ts`,
  the in-process stub in `pgPatientClinical.ts` that let the UI run without applying the migration) were
  reverted with `git checkout`; `git status` carries only this artifact directory.
- Shared DEV `bcb_webapp_dev`: restored exactly. The complaint update I appended was deleted, the description
  I set was returned to `NULL`, the trauma entry was reverted to its original text, and the symptom and
  diagnosis created to prove `CLINICAL-DIAGNOSIS-01` were deleted with their child rows
  (`select count(*) … where text like 'AUDIT-%'` → 0 on all three tables). No permanent fixtures.
- The candidate server on 5210 was stopped and the two gitignored env files copied in for the run were
  removed. The shared dev server on 5200 was never touched and still answers.

---

## 10. Minimal handoff to close the FAIL

1. **F1** — register `public.clinical_disease_anamnesis` beside its `clinical_anamnesis_illness` sibling in
   `rls-descriptor-model.mjs`, `p0-8-3-policy-targets.mjs` and `phase4-force-rls-cutover.sql`; then
   `node scripts/check-saas-db-regression.mjs` must exit 0.
2. **F2** — PatientClinicalSections.tsx:273 → `cn(doctorDnaFlatListMetaClass, 'mt-0.5 block truncate font-normal')`
   (the constant is already imported); the §16 self-check grep must come back empty.
3. **F3** (optional, canon hygiene) — drop the added `it('sets the disease anamnesis text')` and its
   `setAnamnesisDisease` fake wiring.

Nothing else blocks landing. Per §24.6 I did not apply any of these — the fix belongs to the executor chosen
under §24.1.
