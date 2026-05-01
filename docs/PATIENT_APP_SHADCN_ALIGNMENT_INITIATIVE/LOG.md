# LOG — Patient App Shadcn Alignment

## 2026-05-01 — Audit review corrections

- Agent/model: GPT-5.5 (Cursor).
- Scope: docs-only review of initial shadcn alignment audit/plan after checking local UI primitive APIs.
- Corrections: clarified that the project UI primitives are based on `@base-ui/react`; local `Button` is `@base-ui/react/button` + `buttonVariants` and currently has no `asChild`; updated plan/tasks to avoid assuming that API and to route link-like buttons through `Link` + `buttonVariants(...)` / patient action classes or a future adapter.
- App-code changes: none.
- Checks: docs-only; `ReadLints` for touched docs.

## 2026-05-01 — Initiative docs created

- Agent/model: GPT-5.5 (Cursor).
- Scope: docs-only setup for a follow-up shadcn alignment initiative after `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.
- Source context: Style Transfer `GLOBAL_AUDIT.md`, Style Transfer `LOG.md`, and follow-up discussion about shadcn usage, deferred routes, new patient home, cabinet, sections, profile, notifications, diary/support/intake forms.
- Key conclusion recorded: broad removal of shadcn primitives did **not** happen in Style Transfer; remaining work is a set of optional/targeted alignment passes.
- Files created:
  - `README.md`
  - `MASTER_PLAN.md`
  - `AUDIT_RESULTS.md`
  - `TASKS.md`
  - `LOG.md`
- App-code changes: none.
- Checks: docs-only; no code checks required.

