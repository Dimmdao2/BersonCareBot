# UX-07 — Executor usability findings

**Статус:** historical pre-ruling executor findings; superseded for current normative acceptance by
[`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md).
**Artifact:** [`ux07-prototype/index.html`](./ux07-prototype/index.html).  
**Boundary:** this is the correction owner's observation log, not an audit verdict or visual seal.

## 1. What remains structurally valid

1. The 57-screen UX-06 registry represents all required journeys without a second route tree; the prototype keeps
   9 scenarios and 73 state variants.
2. Staff remains one-organization; patient multi-org remains enrollment-bound and visibly changes context.
3. First useful value precedes install. Browser access stays complete; push is a later explicit choice.
4. SMS is an extra delivery attempt for the same invite and never replaces recipient proof.
5. Hostname base, individual surface bindings, sender identity and per-origin PWA remain separate readiness axes.
6. The clinic card keeps own-history safe by default and does not expose all-patient/history/cross-org controls before
   capability or ruling.
7. Synthetic data and local static assets keep this discovery artifact outside application/DB/delivery runtime.

## 2. Reconciliation of the two pre-correction reviews

| Audit finding | Integrated correction in the existing artifact | Current evidence |
|---|---|---|
| F1 linear deck and detached history | Each CTA has an explicit destination or represented result; URL is the navigation source; pushState, popstate/hashchange and direct links restore both state and result; no inert same-state target remains | 284 action checks, 284 back/forward pairs, 146 external hash changes |
| F2 product copy mixed with diagnostics | User task/outcome/recovery copy is plain language; IDs, exact contract states, authorization order and OM/BD gates moved to the optional closed reviewer disclosure | all 73 states rendered with diagnostics closed; representative screenshots inspected |
| F3 fixed context/capability shell | Shell derives org identity, neutral/authorized context, active destination, dual-mode link and available controls from state; neutral chooser has no org selection; withheld controls are absent | neutral chooser, mobile staff, no-binding owner and capability-withheld evidence variants |
| F4 simulated accessibility | Form fields are labelled inputs/selects; actions/navigation are buttons/links/nav; heading/result focus is explicit; the stable shared drawer moves focus inside, closes on Escape and restores the toggle | 146 keyboard and 42 mobile-drawer checks; no interactive div/span controls |
| F5 stale evidence | A fresh batch records current source SHA-256, image hashes and complete interaction totals; both earlier batches are superseded | `2026-07-15T21-03-18Z/run-manifest.md` |
| Re-audit §§8–10 interaction/context residual | All resend/retry/status/support/calendar/preparation/nearest-visit/settings/visit-assignment controls now navigate or show a truthful result; public help/recovery remains public-safe; handoff metadata matches the visible action | 66 represented-result + 218 navigation checks; 124 public help checks; 284 actor/context/capability contracts |

## 3. Full interaction/context convergence after re-audit §§8–10

- The complete 142-action graph was reviewed as one class, not as an 18-button patch. Inert self-targets were removed;
  idempotent operations expose status, while support/recovery/object actions expose a named result or safe destination.
- Public Support/Documents and anonymous expired-invite/seat/wrong-recipient recovery stay in public composition.
  None opens management, clinical or patient authenticated chrome.
- Public-to-authenticated edges are limited to six represented provision/login/confirmation continuations. The SMS
  recovery branch requests a fresh clinic invitation instead of opening the clinician invite form.
- The clinic patient card now declares `handoffAllowed:true` exactly where `Совместная работа` is rendered; the denied
  state remains capability-withheld and exposes no transfer action.
- The shared drawer no longer re-renders its focused toggle. It moves focus to navigation (or the drawer itself),
  closes on Escape, restores focus and preserves the trusted organization and available navigation.
- Current source gate: 9 scenarios / 73 states × 2 viewports, 284 actions, 284 history pairs, 146 external hashes,
  146 keyboard activations, 42 drawers and 124 public-help checks, with zero failures/errors/overflow.

## 4. Current usability hypotheses for re-audit

These are observations to challenge, not accepted decisions:

- the reviewer map/footer remains visually obvious but is explicitly labelled as prototype navigation; reviewers
  should confirm it cannot be mistaken for product workflow;
- mobile staff drawer now retains organization and mode, but dense management lists still need final production
  prioritization later;
- the neutral patient chooser deliberately removes primary organization navigation until a choice is made;
- secondary patient destinations appear outside the five-item bottom navigation, matching UX-06;
- domain readiness now uses progressive plain-language rows, while exact protocol/readiness facts remain available
  in reviewer diagnostics and the UX-05 contract;
- collaboration shows named same-organization concepts only where allowed; the pending state offers no generic or
  cross-org action.

## 5. Pending gates preserved

The correction does not decide OM-1…8 or BD-1…6. In particular it does not approve shared clinic history, a generic
handoff, cross-organization transfer, assistant clinical permissions, a silent patient default organization, custom
sender policy or per-origin patient PWA. These remain UX-08 inputs. Safe defaults are represented as absence,
platform fallback or explicit recovery, never as owner rulings.

## 6. Known prototype limits

- Static states represent, but do not execute, auth, invite mutation, delivery, domain checks, install prompts or
  push subscription.
- Keyboard/semantic checks are low-fidelity gates; production screen-reader announcements, final copy, contrast and
  component-level focus restoration remain implementation acceptance work.
- The prototype tests key flows and representative CRUD composition, not every target screen.
- Only the two independent re-reviewers may decide whether the integrated correction earns UX-07 acceptance.
