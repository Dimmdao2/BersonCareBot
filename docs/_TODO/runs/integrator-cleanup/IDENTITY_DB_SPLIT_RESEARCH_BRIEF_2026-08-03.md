# Research — splitting the identity/contacts store from the PII+medical store

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §24. This is **research only**: no product code, no migration, no
schema change, no DB touch. The deliverable is one document.

Language: internal work is English; the final document is Russian (the owner reads it).

## Why this exists — the owner's own proposal, 2026-08-03

Verbatim: «надо вспомнить о том что мы хотели разделить базы. Есть предложение изучить как это делается
правильно. Я вижу такую схему — одна база (возможно на отдельном сервере вообще) с контактами для входа (ищет
юзера) и ссылками на таблицу фио и таблицу с юзером платформы с мед данными, которые лежат на другой базе. При
входе приложение делает запрос в контакты, получает оттуда UUID с фио и UUID медданных. Они разные и связываются
только этой удалённой таблицей. Таким образом получение доступа только к серверу с контактами не даёт похитителю
ФИО и медданные, а получение доступа к базе с ФИО и медданными не даёт понимания, кому какие данные принадлежат».

Related owner decisions already recorded: `IDENTITY_AND_MERGE_SCHEME.md` §2, §2a (equal-rights login by any
confirmed contact, OAuth contact resolution), §3.4; the three-bucket split he stated the same day — ФИО separate,
contacts separate, medical separate, «это же и требование безопасности».

## Measured starting point (do not re-litigate, verify only if you doubt it)

- `platform_users` today holds identity **and** contacts in one row: `first_name`, `last_name`, `patronymic`,
  `display_name`, `birth_date`, `gender`, `phone_normalized`, `email`/`email_normalized`, plus role and block flags
  (`apps/webapp/db/schema/schema.ts:105-160`).
- Additional contacts are scattered: `user_oauth_bindings.email` (per provider), `user_phone_history` (timeline),
  `user_channel_bindings` (messenger ids). There is no contacts table.
- Medical/clinical tables are already separate and already carry patient-wall RLS across the SCOPED set.
- Recorded earlier and **worth re-verifying live**: `platform_users` is the one PII table with RLS disabled.
- Stack: PostgreSQL, Drizzle, one host today; the product is a multi-tenant SaaS with a planned RU↔EU region split.

## Questions the document must answer, with sources

1. **How is this actually done in production systems that must not link identity to health data?** Name real
   patterns and where they come from — e.g. pseudonymisation with a separate key custodian (GDPR Art. 4(5), Art.
   32), trusted-third-party linkage in national health registries, HIPAA de-identification plus a re-identification
   key (§164.514), master patient index vs clinical store, token vault / tokenization used in payments (PCI DSS).
   For each: what exactly is separated, who holds the linkage, and what the failure mode is.
2. **What threat does the split really close, and what does it not?** Be explicit and honest: dump theft of one
   store, insider DBA on one store, backup leak, region/residency constraints — versus an application compromise,
   where the app holds both connections and performs the join at runtime. Name the mitigations serious systems add
   for the app-compromise case (short-lived linkage tokens, per-request derived pseudonyms, separate service with
   its own authz for linkage, audit of every re-identification, HSM/KMS-held keys).
3. **Do the identifiers need to be two different UUIDs?** The owner proposes contacts → (UUID of ФИО, UUID of
   medical). Assess it against practice: is a single opaque pseudonym enough, when are two better, and what breaks
   (foreign keys, joins, cascade deletes, GDPR erasure, audit trails) once the two stores can no longer be joined
   in SQL.
4. **What does the split cost operationally?** Cross-store consistency without distributed transactions (what
   patterns are used — outbox, sagas, eventual reconciliation), backup/restore of two stores that must stay
   consistent, latency added on the login path, migration of existing data, RLS/roles in each store, and what it
   does to our existing single-Postgres invariants (the repo has a strict DB-port and RLS model — see
   `AGENTS.md` §5, §6).
5. **RU specifics.** 152-ФЗ requirements for ИСПДн and обезличивание, data localisation, and what changes when the
   EU region appears alongside. What is legally required versus what is good practice.
6. **What would a staged path look like for us**, from today's single database to the owner's picture, where each
   stage is independently valuable and reversible? The first stage must be useful even if the rest is never built.

## Method

- Search the web for primary sources: regulation texts, standards, engineering write-ups from healthcare and
  fintech systems, Postgres-specific patterns. Prefer primary and dated sources; name each one with its URL.
- Where practice conflicts, say so and give both sides rather than picking silently.
- Distinguish clearly: **what is required by law**, **what is common practice**, **what is your recommendation**.
- Do not propose scope for our repo beyond stage descriptions — the owner decides what gets built.

## Deliverable

`docs/_TODO/runs/integrator-cleanup/IDENTITY_DB_SPLIT_RESEARCH_2026-08-03.md`, in Russian, structured by the six
questions above, ending with:

- a one-page recommendation for our case, with the honest trade-off stated in plain language;
- a short list of the decisions only the owner can make, each with a recommended default;
- an explicit «что это НЕ закрывает» section.

Commit it on your branch. No push, no merge, no code, no DB.
