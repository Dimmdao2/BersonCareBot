# D15b/1 — live census before the identity transfer

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §5, §6, §24. **Read-only measurement: no product code, no
migration, no schema change, no data mutation.**

Language: internal work is English; the delivered document is Russian.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — item **D15b**, sub-item **D15b/1**
(owner-approved scope, 2026-08-03). Scheme: `runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §2b, §2c.

Everything measured here decides the shape of D15b/2–6. A wrong number here costs a re-split later, so measure —
never infer, never carry a number over from an earlier document without re-running its command.

## What to measure

1. **Is RLS actually disabled on `platform_users`?** Check live on **DEV and TEST separately** (`pg_class.relrowsecurity`,
   `relforcerowsecurity`, and the policies that exist). An earlier note claims it is the one PII table without RLS —
   confirm or refute it with the query and its output. Also report which roles can `SELECT` it today and by what
   grant path.
2. **Column-level reader census.** For `platform_users`, split readers into three groups and list the files:
   identity columns (`first_name`, `last_name`, `patronymic`, `birth_date`, `gender`, `display_name`), contact
   columns (`phone_normalized`, `email`, `email_normalized`, `email_verified_at`), account/state columns (`role`,
   `is_blocked`, `is_archived`, `merged_into_id`, timezone). Mark which readers sit **outside** `apps/webapp/src/infra`
   — those are the ones that break any later move.
3. **Classify the 46 foreign keys** that reference `platform_users.id`: which belong to login/account plumbing
   (passwords, PINs, passkeys, channel bindings, OAuth bindings, phone history, OTP locks, login tokens, email
   challenges, web push, notification topics …) and which are clinical/patient data. Name every table in each
   group. Also find columns that reference the patient **without** a declared FK (`platform_user_id`,
   `patient_user_id`, and any other spelling) — they matter as much as the declared ones.
4. **Integrator writers.** For each of the 11 integrator files that write `platform_users`, state exactly which
   columns it writes, on which trigger, and whether a webapp path already exists that could do the same write.
   This is the input for D15b/2 — be precise, it decides whether each write moves or dies.
5. **The first-webhook path.** Trace what happens today when a brand-new person writes to the bot for the first
   time: what gets created, by whom, in what order. D15a says the integrator creates the person, binds the channel,
   decides the merge and sets phone trust — verify that against the current code and say what is still true.

## Method and boundaries

- You run as `dev-lead` with full host access: use `sudo -u postgres psql` for the DB facts rather than guessing.
  DEV and TEST only — **PROD (`135.106.162.170`) is untouchable**.
- Read-only everywhere: no `INSERT/UPDATE/DELETE`, no DDL, no migration, no deploy.
- Every number in the document comes with the exact command that produced it. A number without its command is not
  a number (owner's standing rule).
- If a measurement contradicts an existing document, say so explicitly and name the stale record — do not silently
  correct it elsewhere.

## Deliverable

`docs/_TODO/runs/integrator-cleanup/D15B1_IDENTITY_CENSUS_2026-08-03.md` in Russian, one section per question
above, each with commands and outputs, ending with:

- a short list of facts that **change** the planned shape of D15b/2–6, if any;
- anything that turned out riskier than the plan assumes.

Commit it on your branch. No push, no merge.
