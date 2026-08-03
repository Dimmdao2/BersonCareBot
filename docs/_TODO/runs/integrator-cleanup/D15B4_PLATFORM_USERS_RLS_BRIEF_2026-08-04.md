# D15b/4 — RLS on `platform_users`

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §4a, §5, §6, §10/§10a/§10b, §24.
Language: internal work is English.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — **D15b/4**; census
`runs/integrator-cleanup/D15B1_IDENTITY_CENSUS_2026-08-03.md` §1.

Источник оракула: план, пункт D15b/4 — «RLS на `platform_users`. Делается ПОСЛЕ 2 и 3: пока таблицу пишут 27 мест
из двух приложений, форму политики нельзя даже определить».

## Why now, and what the census measured

D15b/2 and D15b/3 are landed: the integrator no longer writes `platform_users` itself (one shared write engine),
and the webapp's identity access is behind a single port. So the policy now has one shape to satisfy.

The census confirmed live on **DEV and TEST**: `platform_users` is the one PII table with RLS **disabled** — it
holds `first_name`, `last_name`, `patronymic`, `birth_date`, `gender`, `phone_normalized`, `email`. And the
consequence is wider than "PII unprotected": role `app_patient` without RLS reads **any** row, including patients
of another clinic — a tenant-boundary hole, not only a privacy one.

## Work

1. **Re-measure first**, do not trust the census blindly: confirm RLS is still off on DEV and TEST, and enumerate
   which roles can `SELECT` the table today and through which grant path.
2. **Derive the policy from the real readers**, not from a guess. The identity port (`modules/identity`) is now the
   single seam for webapp reads; the shared write engine (`packages/platform-merge`) is the single writer. Walk
   every principal that legitimately touches a row — the person themselves, staff of the organization the person
   belongs to, the platform role, the operational workers, the migrator/bootstrap paths — and write the policy for
   exactly those.
3. **Apply it with FORCE where the repo already does**, following the shape of the existing patient-wall policies
   across the SCOPED tables — do not invent a second idiom.
4. **Prove the hole is closed**: a patient principal must not read another clinic's patient row; the person reads
   their own; staff read their organization's; the platform role reads what it must. Prove it against a real
   PostgreSQL, the way the repo already proves wall changes — not with mocks.
5. **Check what breaks before landing.** Unprincipled reads that worked only because RLS was off will start
   returning zero rows. Find them (the identity port and the login paths are the obvious ones) and report every
   caller you had to adjust. A silent zero is worse than an error here.

## Boundaries

- Migration: temporary number in the clone; the final one is assigned at land by the lead.
- Update the deploy-time privilege expectations in `deploy/host/deploy-test-saas.sh` in the same commit if the
  registered inventory changes, or the next TEST deploy fails closed on your own change.
- **PROD (`135.106.162.170`) is untouchable.** DEV only; TEST deploy is the lead's step after land.
- No push, no merge into `feat`.

## Done means

- RLS enabled with a policy derived from the real readers, proven against a live PostgreSQL for each principal.
- The cross-tenant read is demonstrably closed.
- Every caller that depended on the missing wall is named in the report, with what you did about it.
- Typecheck, scoped ESLint, journal sync and migrator self-test pass; one commit on your branch.
