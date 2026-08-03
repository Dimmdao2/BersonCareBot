# D15b/3 — one identity port in the webapp

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать» (measure first, do not multiply entities), §5
(DB only through the app's own port), §10/§10a/§10b, §24. Language: internal work is English.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2): never end while something runs in the background;
**commit before you finish**.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — **D15b/3** (owner-approved scope);
`runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` **§2b** (the identity port as target architecture) and
**§2d** (the shared package is the write engine, not the port). Census facts:
`runs/integrator-cleanup/D15B1_IDENTITY_CENSUS_2026-08-03.md`.

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md` §2b — «интегратор только отправляет и получает сообщения…
вебапп только принимает через форму контактные данные… а авторизацию и сборку сущности платформенного юзера…
делает как раз порт авторизации. Тогда всей остальной системе будет вообще невадно и даже неизвестно как именно и
из скольки таблиц и баз данных и серверов собирается личность».

## Where this starts

D15b/2 is done: the integrator no longer writes `platform_users` itself; one write engine lives in
`packages/platform-merge/src/identityProjectionWrite.ts` and both apps call it. That engine is **not** the port —
§2d says so explicitly. This slice builds the port on top of it.

Measured (census D15b/1 — use these, do not re-derive): `platform_users` is touched by ~95 files outside tests;
~53 of them sit in `apps/webapp/src/infra`; **about 12 reach the table from outside `infra`** — those are the ones
that make any later table or database split impossible.

## Work

1. **One module owns identity.** Consolidate the webapp's identity access behind a single port: who this person
   is, which contacts they have, what may authenticate them, and how the entity is assembled. The existing
   repositories become its implementation, not parallel entry points.
2. **Close the ~12 out-of-`infra` call sites.** Each one either goes through the port or is shown to be legitimately
   outside identity (say which, and why, for every one of them — a list with verdicts is part of the deliverable).
3. **Leave the seam where the future split will happen.** §2c: the next stages are RLS on the PII table, then
   separate tables, then possibly separate databases, and each must be a change **inside** the port. State in the
   report exactly which function callers depend on, so a later stage can swap the implementation without touching
   them.
4. Do not build the pseudonym, the contacts table, or anything from D15b/5–7 here. The owner's scope for this pass
   ends at the port.

## Boundaries

- No behavior change for a real person: login, registration, profile and the messenger paths must work exactly as
  they do now. This is consolidation, not redesign.
- No migration, no DB change, no deploy, no PROD.
- No push, no merge into `feat`.

## Done means

- The port exists, the repositories sit behind it, and the out-of-`infra` list is closed with a verdict per entry.
- The existing identity/auth test suites stay green — name them and their counts; add tests only where
  consolidation created a new seam worth pinning.
- Typecheck for both apps, scoped ESLint, `git diff --check` clean.
- One commit on your branch, and a report naming the single function the later stages will swap.
