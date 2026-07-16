# UX-07 — Independent visual/usability audit

**Historical pre-ruling notice (2026-07-16):** этот PASS и visual seals предшествуют
[`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md). Они сохраняются без переписывания как evidence для
прежнего source-bound prototype, но **superseded for current normative acceptance** и не подтверждают интеграцию
новых owner outcomes. Текущий канон ожидает полный re-audit.

**Статус:** **PASS; UX-07 complete.** Final source-bound re-audit of the interaction/context convergence is complete;
independent visual/usability seals #1 and #2 are granted on source
`929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657` and evidence batch
`2026-07-15T21-03-18Z`.  
**Reviewer #1:** Codex subagent `/root/ux07_visual_reviewer1`, independent from the UX-07 executor.  
**Дата:** 2026-07-15.  
**Scope:** the complete static scenario prototype, its retained render evidence and its consistency with the audited
UX-04…06 contracts. Application code, API, DB and delivery were not changed or exercised.

## 1. Evidence and method

The review used these authoritative inputs:

- `ORCHESTRATION_BINDINGS.md`, initiative `README.md`, `REQUIREMENTS.md` and the UX-07 roadmap checklist;
- audited `ENTRY_AND_INVITE_JOURNEYS.md`, `UX04_SCREEN_STATE_LIST.md`, `BRANDING_DOMAIN_CONTRACT.md`,
  `BRANDING_CAPABILITY_MATRIX.md`, `TARGET_IA.md`, `SCREEN_COMPOSITION.md` and `ROUTE_MIGRATION_MAP.md`;
- `UX07_PROTOTYPE_INDEX.md`, `UX07_USABILITY_FINDINGS.md` and the complete current
  `ux07-prototype/index.html`;
- all 12 retained PNGs and the manifest in
  `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T19-36-23Z/`.

The current file was served only from `127.0.0.1:8787`; port `:5200` was not used. Reviewer #1 rendered and
interacted with every current prototype state in both modes: 73 states × desktop/mobile = **146 state/viewport
checks** across all nine scenarios. The pass exercised direct hashes, scenario selection, map selection,
previous/next, viewport switching, terminal/error states, malformed hashes and browser back/forward. Every retained
screenshot was opened at original resolution and inspected rather than accepted from its manifest entry.

## 2. Reviewer #1 verdict

The structural contract trace is strong, and the current source renders without console or horizontal-overflow
failures. However, the artifact is not yet a valid usability seal candidate. Several primary and recovery actions
do not represent the action printed on the button, browser history can detach the visible state from the URL,
staff/public mobile navigation loses required context or recovery destinations, and product-facing screens expose
architecture/audit vocabulary and controls that the contracts say must be absent before authorization or a ruling.

These issues share renderer, transition-model and content-layer causes. They require one integrated UX-07
correction pass over the whole prototype and fresh evidence, followed by a full re-audit. A sequence of narrow
copy/button patches would not establish consistency. **Reviewer #1 does not grant a visual/usability seal.**

## 3. Full checklist

| Check | Reviewer #1 result | Evidence |
|---|---|---|
| All nine required scenarios exist | PASS | acquisition, staff, patient, SMS, booking, multi-org, dual-surface, branding/domain and clinic-card flows all render |
| Required journey families | PASS (structural) | `ACQ-01…05`, `STF-01…08`, `PIN-01…09`, `SMS-01…03`, `PBK-01…08`, `MOR-01…05` and relevant `ERR-*` states are present |
| Canonical destination trace | PASS | displayed state destinations use UX-06 canonical IDs or documented aliases |
| Desktop/mobile render stability | PASS (mechanical) | 146 current-state checks; no body/device horizontal overflow detected |
| Browser console/network | PASS | zero page exceptions, console errors or failed external requests during the full pass |
| Hash/direct-link navigation | FAIL | direct initial hashes work, but back/forward/hash changes do not re-render the corresponding state |
| Primary CTA and recovery correctness | FAIL | generic linear transitions advance to unrelated variants or do nothing at terminal states |
| Task clarity and hierarchy | FAIL | contract/debug terminology is frequently the primary user copy; architecture state dominates the task |
| Active organization visibility | FAIL | neutral patient chooser is pre-labelled with an organization; mobile staff hides the organization entirely |
| Responsive navigation/recovery | FAIL | mobile staff menu/navigation is non-interactive; mobile public header hides legal/support recovery |
| Permission-before-filter | FAIL in rendered UI | controls for shared history/specialist scope are shown before capability instead of being absent |
| Candidate/ruling safety | FAIL in rendered UI | OM/BD/API-contract diagnostics and a cross-org action are exposed as product-facing rows/labels |
| Install/push ordering | PASS (structural) | first value precedes install; installed launch/re-auth precede the explicit push step |
| Transport/auth/relationship separation | PASS in state model | email/SMS delivery, proof and relationship are represented separately; SMS does not elevate auth |
| Domain/base/binding separation | PASS in state model | base, surface bindings, fallback, sender and PWA axes remain distinct |
| Accessibility basics | FAIL | simulated fields are `div`s; shell navigation and mobile menu are non-semantic/non-keyboard controls |
| Synthetic data/no side effects | PASS | masked/test identities only; no API, DB, delivery or application runtime use |
| Retained render integrity | PARTIAL | all 12 file hashes match the manifest, but at least one render predates the current source state set |
| `git diff --check` | PASS | no whitespace errors at reviewer checkpoint |

## 4. Consolidated phase-level findings

### F1 — The transition model is a linear evidence deck, not a trustworthy task/recovery prototype

**Root cause:** every in-screen primary action is wired to the same global `next step`, every secondary action to
the same `previous step`, while flow arrays mix happy paths and mutually exclusive error variants. The hash is
written by render but is not observed as navigation state.

Concrete evidence:

- Browser back changed the URL from `staff step=2` to `step=1`, while the visible title stayed
  `Приглашение отправлено`; forward did not repair the already detached rendering.
- In staff acceptance, `Срок ссылки истёк` advances to the unrelated `other active organization` variant instead of
  requesting/restarting the invite journey.
- In booking, `Свободного времени пока нет` advances to contact details instead of selecting another service/time;
  the final slot-conflict and final SMS recovery buttons are visibly enabled but cannot advance anywhere.
- `Безопасное восстановление`, `Продолжить`, `Открыть`, install, push and context-change actions therefore cannot be
  interpreted as validation of the recovery path named on the screen.

**Required integrated outcome:** one explicit transition graph for normal actions and each recovery outcome,
including terminal destinations, with URL/history as a synchronized state source. The re-audit must follow the
actual labelled CTA path, not only the reviewer footer/map.

### F2 — Product copy and reviewer diagnostics are the same presentation layer

**Root cause:** architecture invariants and state-machine diagnostics were inserted as primary headings, body copy,
badges and actions instead of being kept in a reviewer overlay or secondary technical detail.

Examples span the whole prototype: `membership`, `capabilities`, `masked recipient`, `raw token exchanged`,
`canonical patient identity`, `enrollment`, `idempotent`, `specialist binding`, `platform alias`, `HostnameBase`,
`surface bindings`, `origin audit`, `one-way canonical fallback`, `owner decision` and `data/API contract`. Russian
and English are mixed inside the same user sentence. Generic recovery copy repeats an invariant rather than telling
the person what will happen next.

This prevents a first-time specialist, invited employee or patient from evaluating the intended task, even where
the underlying contract is correct. It also makes pending OM/BD gates appear as product status vocabulary.

**Required integrated outcome:** separate a plain-language product layer from an optional reviewer/diagnostic layer
across all nine scenarios. Keep exact security/domain facts inspectable, but make the primary message, action and
recovery understandable without the architecture documents.

### F3 — The shared shell ignores state-specific context and capability variants

**Root cause:** one fixed public/staff/patient shell is selected mostly from the screen-ID prefix; it does not model
the neutral, denied, authorized and capability-dependent variants required by UX-04…06.

Concrete evidence:

- `MOR-02 / PAT-01` says the launch is neutral and asks the patient to choose, but the mobile chrome already names
  `Клиника Север` as if it were active.
- Desktop staff shows the organization in its top bar; mobile hides that bar and shows only `BersonCare` plus the
  surface name. The hamburger is a plain, inert character and no staff navigation drawer/bottom destination exists.
- Mobile public screens hide `Поддержка` and `Legal` with no alternative platform recovery navigation.
- `owner without specialist binding` still renders the dropdown-looking surface switch that its own copy says must
  be absent.
- Clinic history visibly offers `Вся доступная` and `Специалист X` controls while stating capability is absent;
  the patient list likewise renders an unauthorized wider-scope control. The contract requires those controls and
  unavailable counts to be absent, not annotated as forbidden.
- The handoff view renders `Cross-org transfer` as a product row even though UX-06 reserves no launch navigation
  while OM-6/7 are pending.

**Required integrated outcome:** compose shells and controls from the actual trusted context, capability and ruling
state. Neutral/denied views must not imply a selected organization or expose unavailable actions; mobile must retain
the same organization identity and recovery/navigation reachability as desktop.

### F4 — Accessibility semantics are simulated rather than prototyped

**Root cause:** visual boxes and text spans stand in for interactive controls.

Rendered form fields are `div.input` rather than labelled inputs, so validation, focus and typing cannot be tested.
Desktop nav items, patient bottom navigation and the mobile menu are `div`/`span` elements without link/button
semantics, keyboard operation or current-destination state. Several critical labels and diagnostic lines also use
very small secondary text. This is broader than exact contrast polishing: the current prototype cannot test a
keyboard path through signup, invite, booking, organization switching or mobile navigation.

**Required integrated outcome:** use semantic low-fidelity controls and a coherent keyboard/focus path for the
critical scenarios. Exact production screen-reader output remains an implementation concern, but the scenario
prototype must not rely on mouse-only decorative controls for its central tasks.

### F5 — Retained screenshot evidence is no longer tied to the reviewed source revision

**Root cause:** the manifest hashes image files but does not record the source hash/revision, and the source changed
after the capture.

All 12 PNG hashes still match the manifest. Nevertheless, the retained `staff-wrong-account-desktop.png` reports
`Шаг 6 из 10`, while the current source and fresh render contain 12 staff states and report `Шаг 6 из 12` (the two
additional terminal variants are visible in the current map). The prototype file timestamp is also later than the
capture. Therefore the manifest proves file integrity, not that the pictures represent the artifact being sealed.

**Required integrated outcome:** regenerate representative desktop/mobile evidence only after the integrated
correction, record a source hash or commit identifier, and include enough recovery/context variants to substantiate
the final reviewer claims.

## 5. What passed and must be preserved

- The state inventory covers the required ACQ/STF/PIN/SMS/PBK/MOR families and all nine scenario themes.
- Staff remains one-organization in the data model and patient multi-org switching remains enrollment-bound.
- Install follows first value; browser use remains available; push is represented as separate consent.
- SMS is transport-only and does not replace email proof.
- Host/domain/brand/sender/PWA presentation does not grant authority; base and surface readiness remain separate.
- The clinic model distinguishes primary assignment, care team and work-item reassignment instead of a generic
  transfer mutation.
- Synthetic data, local assets and a self-contained static artifact avoid runtime or privacy side effects.
- The visual direction is coherent with the current BersonCare language and mechanically adapts without horizontal
  clipping.

The correction owner should preserve these contracts while replacing the interaction, content and context
composition causes above.

## 6. Reviewer #2 — independent assessment and false-rejection check

**Reviewer #2:** Codex subagent `/root/ux07_visual_reviewer2`, independent from the UX-07 executor and reviewer #1.  
**Run date:** 2026-07-15.  
**Server:** temporary static server `127.0.0.1:8788`; port `:5200`, application runtime, API, DB and delivery were not
used.

Reviewer #2 first assessed the current prototype without using reviewer #1 findings as a checklist. The pass read
the audited UX-04…06 contracts, both UX-07 executor records, the full prototype source and evidence manifest; it
then rendered all **73 states in both desktop and mobile modes (146 checks)** across all nine scenarios. Direct
initial hashes, scenario/map selection, labelled in-screen actions, previous/next, viewport changes, external hash
changes, browser back/forward, terminal recovery, organization/context chrome, keyboard semantics, console/network
failures and horizontal overflow were checked. All 12 retained PNGs were inspected and compared with fresh renders
of the current source.

### 6.1 Independent verdict before reading reviewer #1

The visual system is coherent, all required scenario/state families exist, every displayed destination resolves to
a canonical UX-06 screen or the documented `ORG-PUB-04` state alias, and all 146 fresh renders completed with zero
console errors, failed requests or body/device horizontal overflow. The structural security model also preserves
one-org staff, enrollment-bound patient multi-org, first value before install, SMS without auth elevation and
independent domain/sender/PWA readiness.

The current artifact nevertheless fails as a task-flow/usability prototype. It behaves as a sequential state deck:
the same generic next/previous handlers are reused for mutually exclusive outcomes, terminal recovery actions can
be inert, and URL history is not observed after initial load. Primary product copy exposes implementation and audit
terms, while shells and controls are not derived from the represented context/capability. Central forms and
navigation are visual simulations rather than keyboard-usable controls. The retained evidence also predates the
current 12-state staff flow. **Reviewer #2 does not grant visual/usability seal #2.**

### 6.2 Comparison with reviewer #1

| Reviewer #1 finding | Reviewer #2 classification | Independent evidence / nuance |
|---|---|---|
| F1 transition/history model | **True** | Back changed the staff hash from step 2 to step 1 while the visible title stayed `Приглашение отправлено`; external hash change behaved the same. Expired staff invite advanced to the unrelated other-org conflict; no-slots advanced to contact data; terminal SMS and slot-conflict recovery did nothing. The landing secondary invite CTA is also inert at step 0, and many visually actionable slot/service/chooser controls have no transition. |
| F2 product copy mixed with diagnostics | **True** | Terms such as `membership`, `canonical patient identity`, `enrollment`, `HostnameBase`, `surface bindings`, `origin audit`, `BD-5`, `OM-4/5`, `idempotent` and `Correlation: UX07-DEMO` are rendered in the primary product layer across public, patient and staff scenarios. |
| F3 context/capability-insensitive shell | **True, and incomplete** | Neutral `PAT-01` already names `Клиника Север`; staff mobile omits the organization; mobile public hides support/legal; owner-without-binding still shows a surface switch; unauthorized history/all-patient controls and cross-org handoff are rendered. Additionally, the active navigation item is always the first item: desktop Domains/History still highlight Overview/Today, and patient Booking highlights Today. This makes route orientation incorrect even in authorized states. |
| F4 accessibility semantics | **True** | Current source contains zero real form inputs and zero links. Fields are `div.input`; staff navigation is `div`; patient bottom destinations and the hamburger are inert `span`s. Keyboard focus therefore cannot traverse the represented signup, booking, chooser or navigation tasks. |
| F5 evidence tied to old source | **True** | All image hashes match the manifest, but fresh/current staff step 6 says `из 12`; retained `staff-wrong-account-desktop.png` says `из 10`. Current source mtime is later than the retained capture. The manifest has no source hash or commit. |

No reviewer #1 finding is a false rejection. F3 was slightly incomplete because it did not call out the systematically
wrong active-destination marker; F1 also extends beyond generic recovery buttons to inert secondary and object-level
controls. These additions reinforce the same root causes and do not justify a separate narrow fix cycle.

### 6.3 Reviewer #2 checks and evidence

| Check | Result |
|---|---|
| Nine scenarios / 73 state objects / desktop+mobile | PASS structurally; 146/146 rendered |
| UX-06 destination IDs | PASS; 21 distinct IDs, no unknown ID outside documented alias |
| Initial direct hashes and flow/map selection | PASS |
| Hashchange, browser back/forward and labelled CTA destinations | FAIL |
| Console, network and horizontal overflow | PASS; 0 errors, 0 failed requests, 0 overflow cases |
| Plain-language primary layer | FAIL |
| Trusted context and capability variants | FAIL in rendered shell/controls |
| Mobile navigation and recovery parity | FAIL |
| Keyboard/semantic accessibility basics | FAIL |
| Screenshot file integrity | PASS; manifest hashes match |
| Screenshot-to-current-source integrity | FAIL; staff evidence is stale and no source revision is recorded |
| Synthetic/local/no side effects | PASS |
| Markdown local links and prototype canonical IDs | PASS |
| `git diff --check` | PASS at reviewer checkpoint |

### 6.4 Phase-level integrated correction brief

One correction owner should repair the complete UX-07 artifact by root cause, not by individual button or copy
finding:

1. **Interaction/state architecture:** replace the linear array transition assumption with an explicit labelled
   action graph, including happy paths, branches, recovery and terminal destinations. Make hash/history a synchronized
   state source and ensure every visually actionable control either follows its named destination or is visibly
   non-interactive reviewer evidence.
2. **Product versus review presentation:** write plain-language task, outcome and recovery copy for all nine
   scenarios; move state IDs, contract invariants, OM/BD/API diagnostics and correlation data into a clearly optional
   reviewer layer. Preserve the exact underlying security/domain facts without asking end users to read them.
3. **Context/capability composition:** derive shell identity, active navigation, mode switch, filters and actions from
   the represented trusted context and capability/ruling state. Keep organization and platform recovery reachable on
   mobile; omit unavailable shared-history/all-patient/cross-org controls instead of presenting them as disabled
   architecture commentary.
4. **Semantic low-fidelity interaction:** use labelled form controls, buttons/links/nav landmarks, current-destination
   semantics and a coherent keyboard/focus path for every critical journey. Exact production screen-reader wording
   may remain later work, but central tasks cannot remain mouse-only decoration.
5. **Evidence convergence:** after all corrections, regenerate the representative desktop/mobile set from the final
   source, record source SHA-256 or commit ID in the manifest and include the corrected recovery, neutral-context,
   mobile staff/public navigation and capability-withheld variants. Then run one complete re-audit, not a sequence of
   narrow spot approvals.

## 7. Consolidated pre-correction verdict

Both independent reviewers reach the same result: **UX-07 FAIL; visual/usability seals #1 and #2 are not granted**.
The failure is not missing scenario coverage or an unsafe underlying product contract. It is a cross-cutting mismatch
between the state inventory and a usable, trustworthy interactive prototype: transitions, user-facing language,
context/capability composition, navigation semantics and retained evidence are not yet mutually consistent.

UX-07 remains open. The next valid step is one phase-level integrated correction covering F1…F5 plus reviewer #2's
active-navigation and inert-control additions, followed by fresh evidence and a full independent re-audit of the
entire corrected prototype by both reviewers. No owner ruling is required to perform that correction; OM/BD gates
must remain pending and visibly separated from product copy.

## 8. Reviewer #1 full re-audit after integrated correction — 2026-07-15T20:32Z

**Artifact SHA-256:** `c4903ff11452053367d7be4174ff188620a512371eebf726211b440a20de0c3d`.  
**Current evidence:** `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T20-16-39Z/`; the earlier batch is
treated only as superseded historical evidence.  
**Reviewer #1 verdict:** **FAIL; visual/usability seal #1 remains withheld.**

### 8.1 Independent re-audit method

Reviewer #1 re-read the orchestration canon, the complete UX-04 journey/state contract, the UX-05 branding/domain
and capability contracts, the UX-06 IA/composition/migration outputs, both pre-correction reviews, the corrected
prototype index/findings and the complete current HTML source. The current file was served only from temporary
`127.0.0.1:8789`; `:5200`, application runtime, API, DB and delivery were not used.

The re-audit independently:

- rendered all **9 scenarios / 73 states** at 1440×1000 desktop and 430×920 mobile: **146 renders**;
- clicked all **142 labelled product actions** in both viewports: **284 action checks**;
- verified declared target hash/title and post-navigation heading focus for all 284 actions;
- exercised direct hash, external hash, reviewer map/selection, viewport changes and non-self browser
  back/forward paths;
- inspected product copy with reviewer diagnostics closed, active navigation, neutral/authorized organization
  chrome, mode availability, withheld capability controls, public recovery links and semantic form/navigation
  controls;
- opened and closed every applicable mobile staff/patient drawer with its toggle and tested keyboard behavior;
- opened all **16 fresh PNGs** at original resolution and matched every image hash plus the manifest source hash.

The independent mechanical pass found zero state/hash/title transition mismatch, zero horizontal body/device
overflow, zero browser exception, console error or failed network request, and zero visible architecture-term match
from the pre-correction F2 list. `git diff --check` remained PASS.

### 8.2 F1–F5 re-audit

| Original cause | Result | Independent evidence |
|---|---|---|
| F1 — linear deck / detached URL state | **PARTIAL; one substantive class remains** | Explicit cross-state recovery and happy-path transitions, external hash and back/forward now synchronize correctly. However, 18 unique labelled actions target the same state and produce no visible outcome; see 8.3. |
| F2 — product copy mixed with diagnostics | **PASS** | Primary layer is plain Russian; exact state IDs, lifecycle terms and OM/BD information are closed in the reviewer disclosure. No former jargon match was visible across 146 renders. |
| F3 — fixed context/capability shell | **PASS** | Neutral `PAT-01` says `Организация не выбрана` and has no org bottom nav; mobile staff keeps `Клиника Север`; owner without binding has no mode switch; active Domains/Patients/Booking markers are correct; unavailable all-patient/history/cross-org controls are absent. Public mobile keeps Support and Documents. |
| F4 — simulated accessibility | **PASS for the required semantic low-fidelity baseline, with one drawer follow-up** | Forms use labelled inputs/selects; product actions and navigation are buttons/links/nav; no interactive div/span surrogate remains; action navigation focuses `#pageTitle`; keyboard can enter the real form controls. The drawer toggle opens/closes and preserves navigation, but Escape does not close it in any of 42 applicable mobile states. |
| F5 — stale evidence | **PASS** | Current source hash exactly matches the manifest; all 16 PNG hashes match; screenshots represent the 12-state staff flow and the corrected recovery/context/capability variants. All 16 were visually reviewed without clipping or stale labels. |

Previously passing security/product boundaries also remain intact: one-org staff, enrollment-bound patient multi-org,
first value before install, optional browser access, separate push consent, SMS without auth elevation, independent
domain/sender/PWA readiness, permission-before-filter and no generic/cross-org patient transfer action.

### 8.3 Remaining substantive finding — declared target is not the same as an observable action outcome

The correction replaced the global linear handler with an explicit graph, but it mechanically treats a same-state
target as a completed action. **18 unique user-facing actions** re-render the identical title/hash without changing
content, status, feedback, disclosure or destination. The behavior occurs in both viewports (36 observed clicks).

Some same-state actions could be valid if they exposed an observable retry/result (`Отправить новый код`,
`Проверить ещё раз`, `Отправить ещё раз`, `Проверить статус`). The current prototype shows no such result. More
importantly, several labels promise a different task and are still inert:

- `Как восстановить доступ`, `Нужна помощь`, `Обратиться в поддержку`, `Поддержка`;
- `Добавить в календарь`, `Как подготовиться`, `Открыть ближайший визит`;
- `Проверить настройки`, `Открыть назначение визита`.

This is the reviewer #2 inert-control addition that the correction record claims to close; it is not a new owner
decision or a demand to prototype every production CRUD screen. A labelled support/recovery/object CTA must either
lead to a represented safe destination/outcome, visibly disclose the represented result, or not be drawn as a
working action. A self-target without feedback cannot prove the task named on the button.

The missing Escape behavior is a secondary keyboard defect in the same corrected interaction layer: all 42 tested
mobile drawers remain open after Escape, although the semantic toggle can close them. It should be corrected with
the remaining action semantics, but it is not the primary reason for withholding the seal.

### 8.4 Seal decision and next gate

Reviewer #1 cannot grant seal #1 while labelled support, recovery and object actions remain observationally inert.
This is a narrower residual of the existing F1/reviewer #2 correction contract, not evidence that the integrated
pass failed wholesale. F2, F3, F5 and the central semantic portion of F4 are genuinely closed and should not be
reworked.

One interaction-convergence pass should review the **complete set of 18 same-state actions as a class**, assign an
honest represented outcome/destination or remove the false affordance, and add Escape-close to the shared mobile
drawer. Then reviewer #1 must repeat the complete interaction audit against a new source-bound evidence batch;
spot-checking only the changed buttons is insufficient for a visual seal.

## 9. Reviewer #2 full re-audit after integrated correction — 2026-07-15T20:55Z

**Artifact SHA-256:** `c4903ff11452053367d7be4174ff188620a512371eebf726211b440a20de0c3d`.  
**Evidence:** `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T20-16-39Z/`.  
**Reviewer #2 verdict:** **FAIL; visual/usability seal #2 remains withheld.**

### 9.1 Independent method and evidence

Reviewer #2 re-read the current UX-07 index/findings, complete corrected source and new manifest against the already
audited UX-04…06 contracts. Before reading reviewer #1 section 8, the re-audit used only temporary static server
`127.0.0.1:8793` and independently checked:

- all **9 scenarios / 73 states × desktop and mobile = 146 renders**;
- all **284 visible product-action instances**, including cross-flow and same-state targets;
- direct/external hash, browser back/forward, reviewer map, scenario/viewport switching and heading focus;
- keyboard entry through representative signup, booking, organization chooser and staff navigation;
- mobile menu open/close, focus ownership and Escape behavior;
- plain product copy versus the closed diagnostic layer, trusted organization chrome, active navigation,
  management/clinical modes and capability-withheld states;
- console, network and body/device overflow on every state;
- all 16 retained screenshots, their dimensions/image hashes and the exact source SHA in the manifest.

The source and manifest SHA match. All 16 image hashes match. The 146-state pass produced zero console errors,
failed requests or horizontal-overflow cases. Initial hash, external hash and non-self back/forward visibly restore
the correct title and context. Forms/navigation are semantic, diagnostics are closed by default, neutral multi-org
and active destination markers are correct, and the representative evidence is current.

### 9.2 Independent verdict before comparison

The integrated correction genuinely closes the old linear-order dependency for cross-state paths, the product-copy
diagnostic leak, fixed-shell/active-nav defects, simulated form/navigation semantics and stale evidence. Those areas
should be preserved.

The current artifact still cannot be sealed as a trustworthy scenario prototype because its graph validates only
that a declared target was reached, not that the action printed to the user occurred. **18 unique same-state actions
(36 desktop/mobile instances)** re-render identical content and provide no result, status or disclosure. In
addition, several non-self labelled links lead to a screen whose task does not match the label, including public
support/documents and public invite recovery. The mobile drawer is keyboard-openable, but opening it replaces the
focused toggle and leaves focus on `body`; Escape does not close it or restore focus.

### 9.3 Comparison with reviewer #1 section 8

Reviewer #1's residual same-state/Escape finding is **true but incomplete**.

| Residual class | Reviewer #2 evidence | Classification |
|---|---|---|
| 18 same-state actions | Every one preserves the same hash/title/body with no visible acknowledgment. This includes resend/retry/status actions and stronger promises such as support, calendar, preparation, nearest visit, settings and visit assignment. | **True** |
| Escape on mobile drawer | No Escape listener exists; tested drawer remains `aria-expanded=true` and `.open`. | **True** |
| Drawer focus management | Opening re-renders the toggle itself, so focus falls to `body`; focus is not moved into the drawer and cannot be restored by Escape. | **Incomplete in reviewer #1** |
| Public Support / Documents | Header `Поддержка` opens the foreign/revoked-link PAT-01 error state, not support; `Документы` returns to the acquisition landing. The same wrong support target is reused by booking/domain recovery. | **Incomplete in reviewer #1** |
| Public invite recovery actor boundary | `Запросить новую ссылку` from expired public staff invite and `Сообщить владельцу` from a public seat-block state navigate directly to authenticated MGMT-02 team management composition. A public recipient must not appear to enter owner/admin management. | **Incomplete and security-significant** |
| Capability metadata consistency | The clinic patient-card state declares `handoffAllowed:false` but still renders `Совместная работа` leading to the allowed handoff candidate. Either the state is capability-enabled or the action must be absent; the current artifact claims both. | **Incomplete in reviewer #1** |

Thus the residual is one shared interaction/context-graph cause, not only a cosmetic set of self-target buttons. The
automated `284 action transitions` metric is mechanically correct but too weak for acceptance because it checks the
declared hash/title rather than the semantic outcome and actor boundary promised by each label.

### 9.4 What passes and must not be reopened

- F2 product-versus-diagnostics separation passes.
- F5 source-bound evidence passes; the new batch is current and complete for its stated purpose.
- Core F3 shell composition passes for neutral multi-org, one-org staff identity, active navigation, no-binding
  owner and capability-withheld list/history/pending-handoff evidence.
- Core F4 semantics pass for labelled inputs/selects, buttons/links/nav, focus-visible and post-navigation heading
  focus.
- Cross-state recovery paths, URL/history synchronization, visual direction, responsive layout and all previously
  passing security/product invariants remain valid.

### 9.5 One phase-level convergence brief

One correction owner should review the **entire visible interaction graph** as a single stage-level pass:

1. Give every resend/retry/support/calendar/preparation/object action an honest represented destination or visible
   result state; otherwise remove the false affordance. Validate label → actor → trusted context → observable outcome,
   not only label → declared hash.
2. Route public Support/Documents and public invite recovery to public-safe represented destinations. Never move an
   anonymous invite recipient directly into MGMT/CLIN/PAT authenticated composition.
3. Make capability metadata and rendered action availability agree, especially the patient-card collaboration entry.
4. Implement one shared accessible drawer contract: preserve/move focus on open, close on Escape, return focus to the
   toggle, and keep the existing semantic navigation/context.
5. Regenerate source-bound evidence after convergence and run both complete re-audits over all 73 states/actions;
   do not rework the already-passing copy, IA, branding or visual system.

## 10. Consolidated current verdict after both re-audits

Both reviewers independently withhold their seals on the same corrected source. **UX-07 remains FAIL; seal #1 and
seal #2 are not granted.** The integrated correction is materially successful and should not be discarded, but the
prototype still overstates completion of its labelled task/recovery graph and has an incomplete mobile drawer
keyboard contract. Reviewer #2 also confirms mismatched public recovery destinations and one capability-state
contradiction, so reviewer #1's residual finding was accurate but narrower than the full cause.

No owner ruling is needed. The next valid step is one interaction/context-graph convergence pass using section 9.5,
fresh evidence tied to the new source hash, then a complete two-reviewer re-audit. A spot audit of only the 18
self-targets would be insufficient because the same cause includes cross-state actor/context destinations.

## 11. Reviewer #1 final full re-audit after interaction/context convergence — 2026-07-15T21:15Z

**Artifact SHA-256:** `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`.
**Evidence:** `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T21-03-18Z/`.
**Reviewer #1 verdict:** **PASS; visual/usability seal #1 is granted for UX-07.**

### 11.1 Independent method and measured results

Reviewer #1 re-read the complete current prototype, index, findings and preceding audit against the already reviewed
UX-04 journey/state, UX-05 branding/capability and UX-06 IA/composition contracts. The artifact was served only from
a temporary static server on `127.0.0.1:8797`; application, API, DB and delivery runtimes were not used.

The final independent pass covered:

- all **9 scenarios / 73 states × desktop and mobile = 146 renders** at 1440×1000 and 430×920;
- all **142 declared state actions × both viewports = 284 action checks**: **66 represented-result checks** and
  **218 represented-navigation checks**;
- **284** label → actor → trusted context → capability → observable result/destination contracts and **284**
  browser back/forward pairs for those declared actions;
- **146** direct/external hash restorations and **146** keyboard activations;
- the public header's Support/Documents pair on every public composition: **124 checks**; the same audit also
  exercised public support and recovery actions declared inside the scenarios;
- all **42** authenticated staff/patient mobile drawer states, including stable toggle, focus moved inside, Escape
  close, `aria-expanded=false`, focus return and retained organization/navigation context;
- diagnostics closed by default, plain product copy, semantic inputs/selects/actions/navigation, active navigation,
  neutral and authorized shells, mode-switch variants, capability-withheld states, browser/page errors, failed
  requests and body/device horizontal overflow;
- all **18 source-bound PNGs** at original proportions, with every file hash matched to `run-manifest.md`.

The pass produced **0 assertion failures, 0 same-state target actions, 0 console/page errors, 0 failed requests,
0 horizontal-overflow cases, 0 interactive div/span surrogates, 0 unlabeled represented fields and 0 visible
diagnostic-term leaks**. The exact source SHA matches the evidence manifest; all 18 PNG SHA-256 values match.

### 11.2 Interaction semantics, public boundary and history restoration

The previous inert-action cause is closed as a class, not only for the examples in section 8. Every retry, resend
and status action now exposes a named result in the page and URL history. Support, account/security recovery,
calendar, preparation, nearest visit, sender check and visit assignment likewise expose content matching the label.
Result focus moves to the represented status; Back restores the same source state without the result and Forward
restores it. Navigation actions resolve to a different represented state, focus its heading and restore both ends
through Back/Forward. Direct and external hash changes rebuild the same state/result model.

Public Support and Documents remain in the current public composition and never introduce staff, clinical or patient
chrome. Expired staff invite, seat/plan block, wrong-recipient patient invite and SMS recovery expose public-safe
results: they request/describe the next action without pretending that an anonymous recipient entered management.
The only anonymous→authenticated edges are the six explicit represented continuations already named by the manifest:
workspace opening after provision, staff login, patient relationship confirmation, installed-session re-auth,
booking confirmation and global patient login. No public result or recovery action adds another edge.

### 11.3 Handoff, shell and accessibility consistency

The clinic patient card declares handoff capability exactly where `Совместная работа` is rendered and leads to the
named same-organization collaboration composition. `Открыть назначение визита` now produces a concrete visit-scoped
result. The withheld state declares no capability and contains no transfer affordance, forbidden counts or wider
history filters. Previously passing one-organization staff, enrollment-bound patient context, permission-before-
filter, domain/sender/PWA independence, first-value-before-install and SMS-without-auth-elevation contracts remain
intact.

Desktop and mobile shells retain the represented organization and active destination. Neutral patient selection
does not preselect an organization. The no-binding owner has no clinical mode switch. Forms and actions remain
keyboard-operable semantic elements. All 42 applicable mobile drawers move focus inside, close on Escape and return
focus to the unchanged menu toggle while preserving the visible organization and available navigation.

### 11.4 Residual findings and seal #1

No blocking or stage-level residual finding remains in reviewer #1's scope. The retained limitations are explicitly
prototype-level: represented rather than live auth/delivery/domain/install behavior, and deferred production
screen-reader, final contrast/copy and component acceptance. They do not contradict the UX-07 task-flow, trusted-
context, capability or visual evidence contract.

Reviewer #1 therefore grants **UX-07 visual/usability seal #1: PASS** on source
`929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657` and evidence batch
`2026-07-15T21-03-18Z`. This seal is source-bound; any prototype change requires new evidence and re-audit.

## 12. Reviewer #2 final full re-audit after interaction/context convergence — 2026-07-15T21:23Z

**Artifact SHA-256:** `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`.  
**Evidence:** `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T21-03-18Z/`.  
**Reviewer #2 verdict:** **PASS; visual/usability seal #2 is granted for UX-07.**

### 12.1 Independent method and measured results

Reviewer #2 formed the verdict before reading section 11. The source, current index/findings, preceding audit through
section 10 and evidence manifest were read first; the complete artifact was then served from temporary
`127.0.0.1:8797`. Port `:5200`, application, API, DB and delivery runtimes were not used.

The independent pass covered all **9 scenarios / 73 states × desktop and mobile = 146 renders**. It exercised all
**142 declared state actions × both viewports = 284 checks** (`66` represented results and `218` navigations), plus
the generated Support/Documents pair on all public compositions (**124 checks**): **408 visible action instances in
total**. All **408** label/actor/context/capability/outcome contracts and **408** Back/Forward pairs passed. The pass
also completed **146** external-hash restorations, **146** keyboard activations, all **42** authenticated mobile
drawer checks and **124** generated public Support/Documents boundary checks.

Observed failures were zero: no same-state navigation target, result/history mismatch, focus failure, public-shell
leak, metadata mismatch, interactive `div`/`span` surrogate, unlabeled represented field, visible diagnostic-term
leak, body/device overflow, page/console error or failed request. Direct and external hashes, Back/Forward and result
hashes restored the same visible title, context and outcome. Result actions focused the result; navigation actions
focused the destination heading.

### 12.2 Boundary, handoff and drawer findings

Public Support/Documents and the expired-invite, seat-limit, wrong-recipient and SMS recovery paths remained in
public composition. No result exposed MGMT/CLIN/PAT chrome. The only anonymous-to-authenticated edges were the six
explicit provision/login/confirmation continuations. This independently closes the former public-boundary defect.

The patient-card collaboration action appears only with `handoffAllowed:true` and
`capability=handoff-allowed`; the denied state exposes neither collaboration nor transfer. Visit assignment produces
a visible visit-scoped result. Organization identity, active navigation, neutral patient context and owner mode
availability remained consistent across desktop/mobile.

All 42 applicable mobile drawers opened through a semantic toggle, moved focus inside, closed on Escape, restored
focus to the unchanged toggle and retained organization/navigation context. The public header and every represented
form/navigation control remained keyboard-operable with diagnostics closed by default.

### 12.3 Source-bound visual evidence

All **18 PNGs** were opened together at original proportions and inspected for stale state, context substitution,
clipping and misleading result composition. Every image SHA-256 matched `run-manifest.md`; the manifest source hash
matched the audited HTML exactly. The evidence includes the previously failing public recovery/result, install/push,
calendar/preparation/nearest-visit, sender, handoff/visit-assignment and staff/patient drawer variants.

### 12.4 Reviewer #1 false-acceptance / false-rejection check

Only after the independent PASS was fixed did reviewer #2 read section 11. Reviewer #1's PASS, measured counts,
boundary analysis, handoff conclusion and residual-risk classification are reproduced by reviewer #2's pass. There
is **no false acceptance and no false rejection** in section 11. The only accounting nuance is presentational:
reviewer #1 reports `284` declared-action checks and `124` generated public-header checks separately; reviewer #2
also records their combined total of `408` visible action instances.

No stage-blocking residual remains. The retained risks are prototype boundaries rather than UX-07 contradictions:
auth, delivery, domain checks, install and push are represented rather than live; production screen-reader behavior,
final contrast/copy and component-level acceptance remain implementation gates. Seal #2 is source-bound and must be
repeated after any prototype change.

## 13. Consolidated final UX-07 verdict

Both independent reviewers grant their source-bound seals on the same artifact and current evidence batch:

- reviewer #1: **PASS; seal #1 granted**;
- reviewer #2: **PASS; seal #2 granted**;
- consolidated UX-07 verdict: **PASS; phase complete**.

The original F1–F5 causes and the later interaction/context residual class are closed across the complete artifact,
not accepted by spot check. UX-07 may hand off its audited contracts and explicitly pending OM/BD gates to UX-08.
This verdict does not approve any pending owner ruling and does not claim production runtime or accessibility
acceptance.
