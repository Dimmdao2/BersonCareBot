# Фаза 7 — Backfill appointment_records (prod)

> **АРХИВ — НЕ ПЛАН К ИСПОЛНЕНИЮ.** Rubitime выведено 2026-07-27. Решение владельца 2026-07-29:
> «Rubitime у нас больше нет — убирать в архив явно». Все команды и открытые боксы ниже — историческая запись.

**Статус:** отменено retirement-решением; не является текущим backlog.<br>
**Исторический контекст:** [`LOGIN_REGISTER_NEW_LOGIC`](../../legacy-underscore/LOGIN_REGISTER_NEW_LOGIC/README.md)

## Цель

Связать исторические `appointment_records` без `platform_user_id` с find/create логикой фазы 1; **без** массовых setup-писем.

## Этапы внутри фазы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 7a — Dry-run (обязательно первым)

- [ ] Скрипт/report: строки с `phone_normalized` и `platform_user_id IS NULL`
- [ ] Счётчики: link by phone, by email, need new user, unresolvable
- [ ] 10–20 примеров строк в отчёт (без PII в git — обезличить или только на хосте)
- [ ] **Никакого** destructive SQL

### 7b — Apply (только после явного OK)

- [ ] Транзакционный или батчевый backfill по согласованному плану
- [ ] Email из payload → unverified contact **если безопасно**
- [ ] **Не** вызывать mass setup email (историческая фаза 8 из прежней инициативы)
- [ ] Запись в исторический `LOGIN_REGISTER_NEW_LOGIC/LOG.md` + runbook в `docs/REPORTS/` при необходимости

## Prod команды

Раздел отложен и не является разрешением на выполнение. PROD — только `135.106.162.170` (`adelaide`), текущий
`151.241.228.122` — DEV/RELAY/TEST. См. [`SERVER CONVENTIONS.md`](../../../ARCHITECTURE/SERVER%20CONVENTIONS.md);
`psql` с `webapp.prod` допустим только на подтверждённом 135/adelaide и после прямой команды владельца.

## Definition of Done (7a)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Dry-run отчёт согласован
- [ ] Риски (дубли, конфликт email) перечислены

## Definition of Done (7b)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Apply выполнен на prod по окну
- [ ] Выборочная проверка врачом: карточки после Rubitime-истории

## Вне scope

- Автоматическая рассылка setup всем историческим клиентам
