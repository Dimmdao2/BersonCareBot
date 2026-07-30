# MISSION: stage 2 — the access lifecycle mechanism the owner asked for (code)

This is the core of the rewrite. The owner forbade the agent from deciding what is limited and for how long; he
configures it. You build the mechanism, not the policy.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — stage 2 items **2.1–2.7, 2.6a, 2.6b** and
  stage 3 items **3.1a, 3.1b** (they belong together: the resolver is useless while the guard still allows every read).
  Scope §1, verification policy §2. **Item 2.6c is NOT yours** — it is an open question to the owner.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a (the ladder), §1 (owner quotes
  verbatim), §3 (classes), §5 (what each step means).

## What to build

**The ladder:** `полный доступ` → `терпение` (full access, N days) → `только чтение` (M days) → `выключено`.

1. **Fields on two levels** — the system as a whole and each mechanic separately: duration of grace, duration of
   read-only, number of warnings, and the terminal state. Zero days means that step does not exist. **Supply no
   defaults of your own**: an unconfigured level means «не настроено», and the resolver falls back to the system level;
   an unconfigured system level is a question for the owner, not a number you invent.
2. **Mechanic level beats system level**; unset falls back to system. Prove both by behaviour.
3. **One resolver** answers «what state is this mechanic in for this organization right now», from: the tariff, the
   organization's personal exception, and the organization's existing commercial state
   (`pgPlatformEntitlements.ts:235-268` already exposes `compatibility | no_trial | trial_pending | active` and
   `active | grace | read_only | blocked`). Invent no local flag.
4. **Meaning of the steps in code:** `терпение` works exactly like enabled plus a warning carrying the date;
   `только чтение` — existing data visible and exportable, creating and changing refused; `выключено` — the section is
   absent for the specialist and for his patients, data preserved and returning unchanged when switched back on.
5. **Critical mechanics never enter the ladder** — patient card, patient app, reminders and notifications, two-factor
   authentication, the operations log, export, emergency help: always `полный доступ`, with a test.
6. **Remove the constants that decide for the owner** (plan 2.6a): the 80% warning threshold
   (`org-entitlements/service.ts:226`), the seat baseline `1` (`types.ts:137`), the literal `MECHANIC_DEFAULT_ENABLED`
   list (`types.ts:119-129`), `access.source === 'no_trial' ? false` (`service.ts:172`), the `graceDays 7 /
   chargeAttempts 3 / readOnlyDays 21` seed (`0259_saas_billing_foundation.sql:238-242`), and the hard `start_event`
   CHECK (`saasEntitlements.ts:150-153`). Each becomes a field or an explicit «не настроено».
7. **`TariffQuotaMap`** currently allows a number only for files (`types.ts:110`) — extend it to the `запас` class so the
   owner can set numbers for patients and branches, without opening numbers where the class forbids them (plan 2.6b).
8. **The guard must stop allowing every read** (plan 3.1a): `app-layer/guards/requireEntitlement.ts:42-49` returns
   `{ ok: true }` for any read, so the read guards can never refuse — and seven registry rows use them, including the
   patient course list (`protectedActionRegistry.ts:89-98`). Remove the early return and its comment, and let the ladder
   decide. This is the owner's requirement «ни он не видит раздела, ни его клиенты не увидят».
9. **One visibility adapter** (plan 3.1b): specialist navigation, patient navigation and the direct URL. Today nothing
   implements hiding.
10. **Constructor** shows the ladder in human words, no «квота»: «Терпение: … дней», «Предупреждений: …», «Только
    чтение: … дней», «Затем: …». The owner fills the numbers.

## Acceptance

Behaviour, per item: a test that goes red when the fix is removed. Mandatory proofs, run them and report what you saw:
the ladder resolving differently per level; a critical mechanic staying full-access even with a stored `false`; a read
being refused in `выключено` and allowed in `только чтение`; the section disappearing from both navigations; and no
remaining agent-chosen duration or terminal state (say how you checked).

## Constraints

- Do not touch billing itself (`SAAS_BILLING_PLAN.md` owns it) beyond reading the commercial state, and do not touch the
  mock-payment routes — they are that plan's item B0.1.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, affected tests via exact `vitest run <file>`. **No full
  CI.** Never `git add -A`. Commit increments in this clone as you go — a previous pass lost 49 uncommitted files. No
  push, no merge. Do not edit the plan or the canon.
- Where a proof needs a live DEV database, say so; the lead runs those in the canonical tree.

## Report

Per item: `what you built (file:line) → what the owner now configures → the test → what you saw when you removed it`.
Then a section «что осталось не настраиваемым и почему» — any place where a value still has to be a constant, with the
reason. Do not soften that section: it is the whole point of this stage.
