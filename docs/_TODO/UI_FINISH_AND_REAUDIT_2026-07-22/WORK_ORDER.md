# WORK ORDER — Finish Doctor/SaaS UI to real PASS + re-audit "done" stages

**Owner:** Dmitry Berson · **Created:** 2026-07-22 · **Runs on:** THIS box = DEV + TEST only.
**Authority for "done":** the linked *detailed* plan file of each stage — NEVER the roadmap one-line summary.

---

## 0. Hard boundaries (read first, do not violate)

- **Production is a DIFFERENT server (IP 135.x). It is NOT on this box and is OUT OF SCOPE.**
  This box has only the DEV server and the TEST server. TEST is not production.
- On TEST you MUST cut, break, observe what falls, and fix. That is the point of TEST.
- Do NOT deploy to prod, do NOT run prod migrations, do NOT push to `main`/`test` branches. Prod cutover is a
  separate, later, owner-driven step — explicitly NOT part of this work. Here we only make TEST fully working so
  the prod move becomes possible later.
- Before any work read: `AGENTS.md`, `.cursor/rules/*.mdc` (relevant scopes), `docs/ORCHESTRATION_BINDINGS.md`
  (esp. «Универсальный режим исполнения многоэтапного плана» and «Урок 2026-07-22»).

## 1. Root cause this work order fixes

The previous orchestrator closed ~30 "done" stages off **short roadmap descriptions** — it did not open the linked
detailed plans, did not hand workers the full detailed checklist, did not verify each checkbox against reality.
Net result: of ~30 accepted stages, ~2 are actually done. Symptoms already seen: DNA background replaced with
near-white; Clients screen "client card in right pane" (a rejected idea) silently reintroduced; workers inventing
their own UI instead of following detailed plans.

## 2. Scope of THIS push (priority order)

### Track A — UI finish to real PASS with PNG acceptance  (PRIMARY)
- **A1. DNA background regression.** Doctor page background is `#faf9f4` (near-white) via
  `--doctor-page-gap-background` in `apps/webapp/src/app/styles/bersoncare-tweakcn-theme.css:91,95`; DNA canvas is
  `#f6f4ef` (greige, `--bc-canvas:15`). Verify the correct page background against the DNA spec
  (`docs/_TODO/DOCTOR_DNA_MIGRATION/PLAN.md` + Design DNA v1) and restore it. Do not guess a color.
- **A2. Clients screen.** Remove the reintroduced "client card in the right pane" pattern. Follow the detailed
  Clients-screen plan, not the orchestrator's invention.
- **A3. Re-verify every UI stage marked done/accepted** against its linked detailed plan:
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, `docs/_TODO/DOCTOR_DNA_MIGRATION/PLAN.md`,
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` (19 contracts). Produce the true state matrix
  (§3), then finish everything that is not really done.
- **Acceptance:** PNG of the LIVE page (port-shot on :5200 / TEST), batched per page — after a page's edits are
  complete, screenshot the whole page and check ALL its checkboxes against what the owner specified. NOT a
  screenshot per micro-tweak.

### Track B — Global-admin login for the owner on TEST  (small, do early — unblocks owner review)
- Enable email-OTP sign-in for `dimmdao@gmail.com` on TEST and make that email resolve to **global admin**
  (email-OTP already exists via `AuthFlowV2`; admin role currently resolves by phone/telegram/max allowlists only —
  email is not wired). Owner logs in with an emailed code.
- Set up **PWA + web-push** for the global-admin account on TEST.
- Deliverable: exact login steps sent to the owner.

### Track C — Rubitime retirement on TEST  (finish the existing plan)
- Master plan: `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md` + rounds R1–R5 + DB_CLEANUP_SEQUENCE.
- Current state: NOT done — Rubitime code/tables still present on TEST (patient cabinet, booking, DoctorToday KPI,
  `(global-admin)/doctor/admin/booking/integrations`). Finish R1–R5 **on TEST**: stop the exchange, remove
  `branchServiceId` legacy links, archive, drop rubitime tables on TEST, observe breakage, fix it.
- Note: this changes booking-related screens — coordinate with Track A.

## 3. Required output of the re-audit (per stage)

A row-by-row matrix, one row per atomic checkbox of the **linked detailed plan** (quoted verbatim):

| checkbox (quoted) | code evidence (path:line) | test evidence | live PNG | verdict: real-done / partial / fake-done / owner-deferred |

A checkbox may NOT be marked done without cited reality evidence or an explicit owner defer with a link.
Report ends with: `closed X/N against <owner plan path>` + a mandatory `NOT DONE:` section (even if empty).

## 4. Owner rulings captured in this session (2026-07-22)

- **Support/tech chat:** for both specialists and their clients → routes to the **global admin**; delivery =
  **push + email to the sender**; technical requests, ticket model, show "do not share patient data" notice.
- **Message & broadcast history:** NOT deleted (permanent product history). Only technical copies in logs/queues are purged.
- **Settings-log secrets:** delete old plaintext values; encrypt new ones.
- **Rubitime:** cut now on TEST (Track C).
- **Legacy integrator↔webapp HTTP event ports:** retire (direct SQL via the single DB port); table-cleanup
  (Phase 3) deferred until UI works. This is queued AFTER this UI push, not inside it.
