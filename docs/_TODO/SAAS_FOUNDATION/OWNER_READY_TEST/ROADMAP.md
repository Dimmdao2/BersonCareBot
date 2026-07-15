# Owner-ready TEST — roadmap

Канон исполнения: `docs/ORCHESTRATION_BINDINGS.md`. Канон SaaS:
`../SEQUENCE.md`, `../SAAS_ENFORCE_ROADMAP.md`, `../HARD_MIGRATION_PROTOCOL.md`.

## ST-01 — обязательный strict/FORCE TEST finalizer

Acceptance: `audit/acceptance-ST-01.md`.

- [x] Code/scratch: оба TEST deploy/migrate-пути останавливают writers.
- [x] Code/scratch: после migrations/backfills/cleanup/roles/helpers/overlays выполняются strict policies и FORCE.
- [x] Scratch: exact post-assert подтверждает канонический inventory; временные привилегии отозваны.
- [x] Code/static: отдельный seeder запускается после finalizer в коротком TEST-only privilege window.
- [x] Code/static: сервисы запускаются только после успешного finalizer+seed; locked product smoke обязателен.
- [x] Code/static: OFF/NO FORCE не используется как TEST recovery.
- [x] Targeted checks, deep audit, fixes и независимый code/scratch re-audit закрыты.
- [ ] Live TEST closure/health/locked smoke подтверждены.

## ST-02 — богатый повторяемый TEST fixture pack

Acceptance: `audit/acceptance-ST-02.md`.

- [x] Code/static: versioned manifest и deterministic reserved IDs.
- [x] Code/static: Clinic A owner + 2 specialists; Clinic B solo owner/specialist.
- [x] Code/static: A=5, B=3; doctor/patient/shared/global-admin `.test` logins.
- [x] Code/static: услуги и прошлые/будущие записи обеих клиник.
- [x] Code/static: абонементы, остатки, резервирование/списание и история.
- [x] Code/static: программы, упражнения, action/event history и snapshots для графиков.
- [x] Code/static: все варианты метрик, включая отсутствие количественных значений.
- [x] Code/static: double-run/sentinel/collision contract и reserved-only cleanup.
- [x] Code/static: public/login/registration/booking и locked matrix имеют исполняемые contracts.
- [x] Targeted checks, deep audit, fixes и independent code re-audit закрыты.
- [ ] Live TEST double-run, public/media/slots, matrix and shared-context behavior proven.

## ST-03 — E1 SaaS isolation diagnostics в Global Admin System Health

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

Acceptance: `audit/acceptance-ST-04.md`.

- [x] Process-audit recovery documented; independent process re-audit PASS before commit/full CI.
- [x] Code/scratch contract: canonical idempotent diagnostic-login provisioning/rotation and existing worker-runtime
      least-privilege authority are proved without credential disclosure.
- [ ] Live TEST diagnostic-login provision/rotation and effective diagnostic/worker role matrix proven.
- [ ] Этапные коммиты небольшие и запушены в `feat/doctor-ui-rebuild`.
- [ ] Full CI зелёный на итоговом SHA.
- [ ] Fresh TEST deploy проходит strict finalizer, seed и locked smoke.
- [x] Code contract: smoke uses a separate global-admin profile and negative clinic-admin/doctor probes.
- [ ] Live product smoke proves those positive/negative profiles.
- [x] Code/scratch contract доказывает reversible okay/incomplete/critical и exact +1 всех шести классов.
- [ ] Live TEST execution этих diagnostics scenarios подтверждено.
- [ ] После smoke повторно подтверждены strict+FORCE, cross-tenant write denials и public/login/registration routes.
- [ ] Ролевой walkthrough выполнен по seeded данным.
- [ ] Visual reviewer #1 и независимый Chief #2 проверили каждый визуальный clause.
- [ ] Нет забытых worktree, сессий и процессов инициативы.
- [ ] Владелец получает маршруты/роли/состав данных и screenshot manifest без секретов.

## Финальный чек-лист

- [ ] ST-01—ST-04 закрыты по своим acceptance.
- [ ] #770, #797 и #798 синхронизированы с доказательствами и commit refs.
- [ ] TEST остаётся strict+FORCE и fail-closed.
- [ ] Fixture можно повторно применить после следующих миграций.
- [ ] System Health показывает SaaS-диагностику.
- [ ] TEST готов к ручной продуктовой проверке владельцем.
