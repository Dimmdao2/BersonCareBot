# YooKassa Idempotence-Key limit — worker brief

## Authority and oracle

Bounded provider-contract fix inside billing card #1057. Read `AGENTS.md` §5/§10b/§24, current
`modules/payments/providerPort.ts`, `modules/saas-billing/service.ts`, the YooKassa adapter and its tests before
editing.

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` Phase 4 «Проверка» — «state-machine +
idempotency тесты».

Official provider contract: <https://yookassa.ru/developers/using-api/interaction-format> — the outgoing
`Idempotence-Key` is limited to 64 characters. Current exact representative lengths measured by the lead are
`manual=84`, `renewal=84`, `auto=86`, `refund=85`; YooKassa may reject these before a payment/refund exists.

## Human consequence

A clinic can press pay or an automatic renewal/refund can run, but YooKassa rejects the request because our HTTP
header violates its length limit. The invoice then cannot progress through the real provider path.

## Exact scope and required design

- Branch/worktree: `wt/yookassa-idempotence-key-limit` / `bcb-wt-yookassa-idempotence-key-limit`.
- Change only `apps/webapp/src/infra/payments/yookassaPaymentProvider.ts` and directly related existing provider
  unit tests (plus one bounded report if repo convention requires it).
- Normalize at the YooKassa HTTP boundary, once, for every POST that sets this header: payment, invoice and refund.
- Preserve an already-valid non-empty key unchanged. Convert an over-64 key to a deterministic SHA-256 hex digest
  of the original key (exactly 64 characters). Same original must always produce the same header; distinct
  representative originals must not collapse.
- Keep the repository/DB key and provider metadata unchanged. They are the existing internal idempotency identity;
  rewriting persisted keys would make a retry of a pre-deploy invoice appear new and can create a duplicate.
- Do not add a new cross-provider abstraction: the limit is a YooKassa wire contract.

## Acceptance / fault set

- Existing short key remains byte-for-byte identical in the outgoing header.
- Long keys for ordinary payment, provider invoice and refund each produce a 64-character header.
- Repeating the same request yields the same normalized header and same request body; changing the original yields a
  different normalized header.
- Removing normalization independently from any one of the three POST paths must make an acceptance assertion fail.
- No HTTP request is added, and credentials/body/metadata are not logged.

## Prohibited and delivery

No schema, migration, journal, SaaS service/repository, settings, DEV/TEST/PROD action, deploy, new dependency or
push. Run the exact focused provider tests, scoped ESLint/typecheck as applicable and `git diff --check`. Commit only
explicit task files with B0.3/#1057, and report exact commands/counts, SHA and limits.

