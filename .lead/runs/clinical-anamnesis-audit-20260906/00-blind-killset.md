# Blind kill-set — auditor-live, candidate ac5c4f5d1

Written BEFORE reading the production diff and BEFORE reading any test file.
Sources read first: AGENTS.md §10a, §10b, §16, §17, §21, §24 + owner checklist
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` (P4.1–P4.3).

Classification per §24.4: **A** = quality of a one-off action (prove by reading final state / rg / AST /
introspection / one-shot runtime check — no test), **B** = repeatable behaviour (behavioural test admissible
if it also passes the §10b filter: expensive AND silent failure, cheapest public layer).

---

## CLINICAL-SYMPTOM-01 — **B** (data derivation), presentation part **A**

| # | breakage | expected catch |
|---|---|---|
| S1-1 | fallback picks the *latest* history entry instead of the *earliest* non-empty one | wrong preview line |
| S1-2 | fallback fires even when the symptom's own description exists (priority inverted) | preview shows history, not description |
| S1-3 | whole multi-line text rendered — first line not extracted | block height grows, 2+ lines |
| S1-4 | whitespace-only description treated as present → empty preview, fallback never fires | blank muted row |
| S1-5 | no ellipsis/`truncate` — long line wraps instead of clipping | live look |
| S1-6 | preview also rendered for non-active symptoms | live look |

## CLINICAL-SYMPTOM-02 — **B** (no-empty-row) + **A** (no regression of existing fields)

| # | breakage | expected catch |
|---|---|---|
| S2-1 | preview row rendered when both description and history are empty → empty duplicated row | blank row under name |
| S2-2 | preview duplicates a string already displayed on the same row | visible duplicate |
| S2-3 | adding the preview drops date / срок / динамика выраженности / important flag from the row | missing field |

## CLINICAL-DIAGNOSIS-01 — **A** (gate removal is a one-off; availability itself is **B** at route level)

| # | breakage | expected catch |
|---|---|---|
| D1-1 | UI hides add/edit symptom or diagnosis when there is no active encounter | button absent |
| D1-2 | route/service rejects create/update without `encounterId` (400/403/"нет активного приёма") | HTTP status |
| D1-3 | DB column `encounter_id` NOT NULL on symptom/diagnosis → insert from card fails | 23502 |
| D1-4 | edit path (not create) still gated | update rejected |

## DISEASE-ANAMNESIS-01 — **A** (placement) + **B** (patient-scoped persistence, tenant scoping)

| # | breakage | expected catch |
|---|---|---|
| DA1-1 | block rendered before diagnoses or after life anamnesis | order on screen |
| DA1-2 | text stored per-encounter, not patient-scoped → different text per appointment / disappears | reload shows other text |
| DA1-3 | block merged into the life-anamnesis card, not its own white block | live look |
| DA1-4 | read not scoped by patient → patient A sees patient B's text | cross-patient leak |
| DA1-5 | read/write not scoped by clinic/org → cross-tenant leak | tenant leak |

## DISEASE-ANAMNESIS-02 — **A** (icon + shared action + no patient picker)

| # | breakage | expected catch |
|---|---|---|
| DA2-1 | icon is `Pencil`/`Edit`/`Edit3` instead of `SquarePen` | rg + live |
| DA2-2 | edit action not right-aligned in the block header | live look |
| DA2-3 | edit form contains a patient selector | live look |
| DA2-4 | local hand-rolled icon button instead of the shared doctor action primitive (§16 reuse-first) | rg |

## DISEASE-ANAMNESIS-03 — **B** (overflow detection is real logic)

| # | breakage | expected catch |
|---|---|---|
| DA3-1 | chevron always rendered → short/empty text gets a false chevron | live look, short + empty text |
| DA3-2 | chevron never rendered even on real overflow → long text unreachable | live look, >5 lines |
| DA3-3 | collapsed clamp is not 5 lines (3/6/none) | measured line count |
| DA3-4 | expand does not show the full text (still clamped) | live look |
| DA3-5 | chevron up does not restore the 5-line clamp | live look |
| DA3-6 | overflow measured once and never re-measured after text change/resize → stale chevron | after save of shorter text |
| DA3-7 | chevron not centered at the bottom | live look |

## DISEASE-ANAMNESIS-04 — **A** (shell/layout structure), verified live + by reading

| # | breakage | expected catch |
|---|---|---|
| DA4-1 | editor uses a raw dialog shell / local modal instead of the shared `DoctorModal` | rg + live chrome |
| DA4-2 | editor replaces the current layer instead of stacking as the next layer | card disappears |
| DA4-3 | mobile textarea has a visible border/rounded frame | live look |
| DA4-4 | mobile input starts at the top and grows downward | live look |
| DA4-5 | textarea hidden behind / overlapping the footer | live look |
| DA4-6 | desktop right-sheet text bottom-anchored instead of top-oriented | live look |
| DA4-7 | double scroll owner (modal body scrolls AND textarea scrolls) | live scroll |

## DISEASE-ANAMNESIS-05 — **B** (save flow)

| # | breakage | expected catch |
|---|---|---|
| DA5-1 | save needs a page reload / `router.refresh()` for the block to update | stale text after save |
| DA5-2 | save closes the whole stack (patient card closes too), not only the top layer | card gone |
| DA5-3 | failed save is swallowed silently — no error toast, user believes it saved | silent data loss |
| DA5-4 | local ad-hoc toast instead of the shared doctor toast | rg |
| DA5-5 | cancel persists the draft anyway / draft leaks into the block | text changed after cancel |
| DA5-6 | save posts a stale/other patient id | wrong patient's record written |

## LIFE-ANAMNESIS-01 — **A** (placement, absence of the old block) + **B** (existing data actually read)

| # | breakage | expected catch |
|---|---|---|
| LA1-1 | old «Сопутствующие заболевания» block still present on the card → duplication | live look |
| LA1-2 | life-anamnesis block placed before the encounters block | order |
| LA1-3 | one of the four subsections missing (сопутствующие / травмы и операции / болезни и стрессы / образ жизни) | live look |
| LA1-4 | existing rows not read — block always empty although data exists | empty block on seeded patient |

## LIFE-ANAMNESIS-02 — **A** (look)

| # | breakage | expected catch |
|---|---|---|
| LA2-1 | subsections still collapsible / collapsed by default → filled values hidden | live look |
| LA2-2 | title colour inverted (filled muted, empty black) | live look |
| LA2-3 | «записей нет» / «не внесено» phrases present | rg + live |
| LA2-4 | empty subsection dropped entirely instead of shown compactly muted | live look |

## LIFE-ANAMNESIS-03 — **B** (no data loss) + **A** (contract reuse)

| # | breakage | expected catch |
|---|---|---|
| LA3-1 | a new parallel zod/type contract created instead of reusing the existing one (§5/§24.2) | diff read |
| LA3-2 | edit deletes/replaces historical rows (replace-all semantics) → silent data loss | rows count drops |
| LA3-3 | new NOT NULL `encounter_id` dependency added to life-anamnesis rows | DDL |
| LA3-4 | edit writes to a different patient | wrong row |

---

## Migration / privileges kill-set (mandatory block of the brief)

| # | breakage | expected catch |
|---|---|---|
| M-1 | migration contains GRANT/REVOKE (§1 «Миграция не выдаёт и не отзывает права») | rg over the SQL |
| M-2 | new relation absent from `deploy/postgres/privileges/declaration.ts` → `app_staff` gets 42501 at runtime | declaration read + deploy assert |
| M-3 | RLS not enabled / no policy on the new relation → cross-tenant read | pg introspection |
| M-4 | generated artifacts stale vs declaration (parity broken) | regenerate + diff |
| M-5 | migration timestamp not forward → watermark migrator silently skips it | filenames vs journal |
| M-6 | `meta/_journal.json` hand-edited / non-empty diff | git diff |
| M-7 | new table owned by the wrong role | introspection |
| M-8 | rollback-only preflight fails on the candidate | repo preflight mechanism |

## Live acceptance kill-set (no test can replace it)

| # | observation to make |
|---|---|
| L-1 | iPhone XR: block order — symptoms → diagnoses → Анамнез заболевания → Приёмы → Анамнез жизни |
| L-2 | real >5-line text: chevron appears, centered bottom; short text: no chevron; empty: no chevron |
| L-3 | chevron down = full text, chevron up = back to exactly 5 lines |
| L-4 | editor opens as the next layer over the card, mobile borderless bottom-growing, desktop top-oriented |
| L-5 | cancel leaves the text unchanged; save updates in place without reload + toast |
| L-6 | no double scroll owner, no nested frame, no raw dialog shell, doctor primitives respected |
