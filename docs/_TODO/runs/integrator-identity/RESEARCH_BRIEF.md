# MISSION: identity in the integrator — what it decides, what it may break, how to take it out (read-only research)

Owner ruling 30.07: «Решения об идентичности — надо вырезать к ебеням на корню» and, immediately after, «идентичность —
надо запустить сначала сильное исследование командой». So: research first, no code. You are one of several independent
researchers; assume nothing about what the others cover.

## Why this is the dangerous one

The integrator today creates and merges people: it resolves an external messenger id into a canonical patient, creates
`platform_users` rows, decides phone trust, sets enrollments and default preferences. A wrong merge mixes two humans and
their medical records — an error that is expensive to detect and hard to reverse. This is also the main blocker for
giving the integrator narrow database privileges.

## Authority and starting facts (verify, do not trust)

- Research that produced this task: `docs/_TODO/runs/integrator-role/SYNTHESIS.md` and the three reports beside it.
- Known code entry points: `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`,
  `mergeCandidatesDirect.ts`, `apps/integrator/src/infra/db/repos/canonicalUserId.ts`, `repos/channelUsers.ts`,
  the phone-bind contracts in `apps/webapp/INTEGRATOR_CONTRACT.md`, and the webapp side in
  `apps/webapp/src/modules/auth/**` (channel link, phone bind, merge).
- Architecture: one PostgreSQL, `public` holds canon; `apps/webapp/ARCHITECTURE.md:40-44`.
- Owner's target for the integrator: a channel adapter — ingress, identification of the person, delivery. Note the
  tension: identification is arguably the adapter's job, but *creating and merging people* is not.

## Questions

1. **Exact inventory of identity decisions made in the integrator.** Every place it creates a person, links a channel,
   trusts a phone, picks an organization, sets defaults, or merges. File, function, trigger path, and what data it writes.
2. **Where is the real boundary?** Which of those are legitimately «recognise the sender» (must stay in an adapter) and
   which are «decide who this human is and unify records» (must not). Argue from consequences, not taste.
3. **What breaks if it stops deciding.** For each item: what flow depends on it today — first contact from a messenger,
   phone binding, deep-link login, a person writing from two channels, a returning patient of another clinic. Name the
   failure mode if the decision simply moved to the webapp with a narrow command.
4. **Duplication and drift.** The webapp has its own identity code (channel link, phone bind, merge). Compare: do the two
   sides already disagree anywhere — different trust rules, different merge conditions, different organization choice?
   Quote both sides. Existing disagreements are the strongest argument for the cut and the most dangerous part of it.
5. **World practice.** How mature products separate «channel identity» (external id ↔ account link) from «person
   identity» (the canonical record and merges): who owns each, what is idempotent, how merges are made reversible or
   at least auditable. Cite sources; where practice is silent, say «практика молчит».
6. **The safe order of extraction.** Not a full plan — a sequence with the risk of each step, what must be migrated
   (data, idempotency keys, FKs), and what is impossible without a migration. Say plainly which step you would refuse to
   do without a rehearsal on real data.

## Constraints

Read-only: change no files, no migrations, no deploys, never the full CI. Read-only DEV queries are allowed if a fact
cannot be established otherwise — say so when you use them. Do not propose a rewrite; produce findings.

## Output

1. `КОРОТКИЙ ОТВЕТ` — 3-5 строк: сколько решений об идентичности живёт в интеграторе, какие из них опасны, и можно ли их
   вынести без миграции данных.
2. Inventory table.
3. Boundary verdict per item: adapter / must move.
4. Breakage analysis.
5. Drift between the two sides, with quotes.
6. Practice with sources.
7. Extraction order with risks.
8. «Чего не смог установить» с причинами.
