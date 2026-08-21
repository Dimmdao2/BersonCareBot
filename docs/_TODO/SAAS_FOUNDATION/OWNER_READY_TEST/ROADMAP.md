# Owner-ready TEST — roadmap

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

Канон исполнения: `docs/ORCHESTRATION_BINDINGS.md`. Канон SaaS:
`../SEQUENCE.md`, `../SAAS_ENFORCE_ROADMAP.md`, `../HARD_MIGRATION_PROTOCOL.md`.

## ST-01 — обязательный strict/FORCE TEST finalizer

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Acceptance: `audit/acceptance-ST-01.md`.

- [x] Code/scratch: оба TEST deploy/migrate-пути останавливают writers.
- [x] Code/scratch: после migrations/backfills/cleanup/roles/helpers/overlays выполняются strict policies и FORCE.
- [x] Scratch: exact post-assert подтверждает канонический inventory; временные привилегии отозваны.
- **УСТАРЕЛО/ЗАМЕНЕНО 21.08.2026:** отдельный TEST seeder и fixture-dependent smoke удалены; deploy не создаёт
  и не требует persistent fixture-данные (см. `AGENTS.md` §1b).
- [x] Code/static: OFF/NO FORCE не используется как TEST recovery.
- [x] Targeted checks, deep audit, fixes и независимый code/scratch re-audit закрыты.
- [ ] Live TEST closure/health/locked smoke подтверждены.

## ST-03 — E1 SaaS isolation diagnostics в Global Admin System Health

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Acceptance: `audit/acceptance-ST-03.md`.

- [x] Code/scratch: отдельная true-global redacted event/aggregate модель.
- [x] Code/tests: шесть обязательных классов и reporter для всех process families.
- [x] Code/tests: redaction исключает IDs/ПДн/SQL/payload/signatures/secrets.
- [x] Code/UI tests: health-карточка отвечает OK/critical/stale/incomplete.
- [x] Code/UI tests: service/class/route-job/count/first-last/coverage.
- [x] Code/scratch: current24/previous24 и bounded 7-day trend.
- [x] Code/tests: explained/unexplained и active/resolved разделены.
- [x] Fault-injection/redaction/admin-guard/aggregation/UI tests закрыты.
- [x] Deep audit, fixes и independent code/scratch re-audit закрыты.
- [ ] Live TEST scenarios/operator roles/visual states proven.

## ST-04 — интеграция и передача владельцу

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Acceptance: `audit/acceptance-ST-04.md`.

- [x] Process-audit recovery documented; independent process re-audit PASS before commit/full CI.
- [x] Code/scratch contract: canonical idempotent diagnostic-login provisioning/rotation and existing worker-runtime
      least-privilege authority are proved without credential disclosure.
- [ ] Live TEST diagnostic-login provision/rotation and effective diagnostic/worker role matrix proven.
- [ ] Этапные коммиты небольшие и запушены в `feat/doctor-ui-rebuild`.
- [ ] Full CI зелёный на итоговом SHA.
- [ ] Fresh TEST deploy проходит security closure и health без fixture precondition.
- [x] Code contract: smoke uses a separate global-admin profile and negative clinic-admin/doctor probes.
- [ ] Live product smoke proves those positive/negative profiles.
- [x] Code/scratch contract доказывает reversible okay/incomplete/critical и exact +1 всех шести классов.
- [ ] Live TEST execution этих diagnostics scenarios подтверждено.
- [ ] После smoke повторно подтверждены strict+FORCE, cross-tenant write denials и public/login/registration routes.
- [ ] Ролевой walkthrough выполнен через уже зарегистрированные owner-учётки и клиники.
- [ ] Visual reviewer #1 и независимый Chief #2 проверили каждый визуальный clause.
- [ ] Нет забытых worktree, сессий и процессов инициативы.
- [ ] Владелец получает маршруты/роли/состав данных и screenshot manifest без секретов.

## Финальный чек-лист

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] ST-01—ST-04 закрыты по своим acceptance.
- [ ] #770, #797 и #798 синхронизированы с доказательствами и commit refs.
- [ ] TEST остаётся strict+FORCE и fail-closed.
- [-] ~~Fixture можно повторно применить после следующих миграций.~~ — **УСТАРЕЛО/ЗАМЕНЕНО 21.08.2026:**
      persistent fixture-наборы на live TEST запрещены.
- [ ] System Health показывает SaaS-диагностику.
- [ ] TEST готов к ручной продуктовой проверке владельцем.
