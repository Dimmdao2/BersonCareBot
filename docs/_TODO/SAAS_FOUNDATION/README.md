# SAAS_FOUNDATION

## Current authority

- [`OWNER_RULINGS_2026-07-15.md`](OWNER_RULINGS_2026-07-15.md) — foundation/tenant/enforcement rulings §§1–17;
  Rubitime §18 сохранён только как superseded provenance и не входит в current authority.
- [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
  — latest product/UX authority for tariffs, trial, billing, libraries, clinic entitlement, analytics and current
  TEST interface. It supersedes older product assumptions but does not rewrite foundation safety gates.
- [`SEQUENCE.md`](SEQUENCE.md) — order of current work.
- [`SAAS_ENFORCE_ROADMAP.md`](SAAS_ENFORCE_ROADMAP.md) — TEST-only enforcement and acceptance plan.
- [Rubitime retirement archive](../../archive/2026-07-rubitime-retirement/README.md) — завершённый 2026-07-27
  workstream; архивные планы и CSV one-shot не являются current authority.

## Boundary

The only initiative objective is a fully working system on TEST. A fresh database dump may be obtained for a
TEST/disposable copy; no other action outside TEST belongs in an active plan. Historical documents remain in this
directory or Git history only when labelled **superseded** and linked to the ruling that replaced them.

## Active work

- P0.11.1-P0.11.4 system_settings storage/read/write/rules-docs are implemented; the executable
  contract remains in `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md`.
- Enforced multi-organization product acceptance: `SAAS_ENFORCE_ROADMAP.md`.
- UX filter «мои пациенты», without changing clinic-wide staff visibility: `SEQUENCE.md` §4.4.
- Standard SaaS engineering for organization provisioning, settings-root split and DB-role granularity:
  `OWNER_RULINGS_2026-07-15.md` §§13–16.
- Rubitime runtime отсутствует; история R1–R7 хранится только в `docs/archive/2026-07-rubitime-retirement/`.
  Ни ссылка на `OWNER_RULINGS_2026-07-15.md`, ни старые открытые боксы не могут повторно разрешить CSV/import/R1–R7.
- Product/UX execution order and current TEST corrections:
  `../SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §7.3.
