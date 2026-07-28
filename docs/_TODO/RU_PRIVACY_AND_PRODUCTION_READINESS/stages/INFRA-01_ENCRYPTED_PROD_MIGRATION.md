# INFRA-01 — New encrypted PROD build, rehearsal and cutover

## Цель и основной выбор

Построить новый production-хост параллельно текущему и перенести сервис без in-place LUKS-конвертации живого
root-диска. Провайдер остаётся Selectel, все primary/service/backup copies — в РФ. Новый VPS не получает реальную
доставку или production traffic до cutover gate.

Зависимости `I0-I4`: `PR-00/PR-01`, Selectel response `O-02`, crypto ADR `CRYPTO-01/C0`, `SEC-02`, `DR-01/02`,
stable SaaS release SHA, external decision `G-06` и owner resources `O-07`. Только production slice `I5` требует
green full CI, `PR-04A`, `O-10` и `G-11`; planning/disposable/dark-target work не ждёт production window.

## File scope gate

До `doing` в `LOG.md` фиксируются отдельный taskdb ID, target topology, exact `deploy/host`, `deploy/systemd`,
`deploy/postgres`, nginx/firewall/backup/runbook docs, release SHA, rehearsal host и аудиторы. Active SaaS/Product UX
plans не редактируются. Production mutations выполняет только отдельный cutover task; worker не получает
неограниченный root/Selectel доступ.

## I0 — owner/provider gates (`Owner + external`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Закрыты `O-02`, `O-05…O-09`; подтверждены РФ-регионы всех copies и договорная роль Selectel.
- [ ] Выбрана одна disk layout:
  - `A`: LUKS2 root с проверенным console/remote unlock; либо
  - `B`: минимальный root + LUKS2 data volume, охватывающий PostgreSQL/WAL/temp, env, logs, backup staging и swap.
- [ ] Для варианта B агентский checker доказывает отсутствие ПДн/секретов на открытом root; иначе gate FAIL.
- [ ] Утверждены boot/unlock/recovery owner, RPO/RTO, downtime budget, DNS TTL plan и abort criteria.

## I1 — repository implementation (`AI development`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Расширить существующие deploy scripts до idempotent `preflight/apply/verify/rollback`; не создавать ручной
      альтернативный deploy path.
- [ ] Добавить machine-readable host baseline checker: mounts/LUKS/swap, PG checksums/listen/HBA, users/ownership,
      sudoers, unit sandbox, sockets, SG/firewall evidence, env/backups modes, audit/fail2ban.
- [ ] Перевести API/worker/scheduler/media-worker/webapp на отдельные non-root service users с минимальными read/write
      paths; release artifacts, units и privileged scripts — root-owned и immutable для deploy/runtime users.
- [ ] Добавить systemd controls с exception manifest: `NoNewPrivileges`, `PrivateTmp`, filesystem protection,
      capability/device/address-family restrictions и controlled writable directories.
- [ ] Добавить canonical nftables ruleset под Selectel SG: public 80/443; SSH только approved sources/VPN;
      PostgreSQL/app ports loopback; rollback timer и reboot persistence.
- [ ] Подготовить PostgreSQL bootstrap с checksums, least-privilege roles, loopback/Unix socket и repeatable grants;
      миграции остаются каноническими repo scripts.
- [ ] Подготовить encrypted backup/restore, key presence preflight без вывода ключа, monitoring и protected audit.
- [ ] Обновить `SERVER CONVENTIONS`/deploy runbook только подтверждёнными non-secret facts после проверки.

**Проверки:** shell/static checks, disposable VM, reboot/unlock, systemd-analyze delta, negative file access, external
port scan, service health, synthetic DB restore. Изменения deploy/root scripts получают независимый security audit.

## I2 — disposable rehearsal (`AI executes; owner observes recovery`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Поднять временный VPS/volume без production credentials и реальных каналов.
- [ ] Проверить install → encrypt/unlock → reboot → recovery console → rebuild from zero.
- [ ] Восстановить synthetic TEST backup и encrypted media fixture; выполнить schema/tenant/integrity smoke.
- [ ] Преднамеренно проверить: потеря primary key path, повреждённый backup, firewall lockout, failed deploy,
      interrupted restore, service crash и disk-full.
- [ ] Измерить build/restore/reboot RTO и подтвердить rollback/cleanup.

**Выход:** обезличенный rehearsal report в `EVIDENCE`, owner реально использовал recovery copy хотя бы один раз.

## I3 — new PROD staging (`AI prepares; owner supplies gated resources`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Создать target network/SG/VPS/volumes по принятой спецификации; проверить IP reachability из РФ до переезда.
- [ ] Установить ОС/packages/config из reviewed scripts. Новый host не принимает public app traffic.
- [ ] Применить verdict `G-06B`: установить и подключить принятый EDR/HIDS agent к отдельному RU manager/sink либо
      доказать утверждённый набор compensating controls; неизвестное решение блокирует target acceptance.
- [ ] Создать encrypted volumes/swap, PG cluster checksums, service users, firewall/audit и root-owned release path.
- [ ] Передать secrets только через утверждённый защищённый channel/key store; выполнить inventory без значений.
- [ ] Восстановить согласованную encrypted copy в isolated maintenance/send-disabled mode; выполнить counts/checksums,
      tenant negatives и read-only application smoke.
- [ ] Запретить production delivery/ticks/webhooks до отдельного enable step cutover runbook.

## I4 — final rehearsal and change packet (`AI + owner`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Зафиксировать exact source/target host IDs, release SHA, DB migration state, storage manifests, DNS records,
      TTL, certificates, Telegram relay/VPN dependencies и health checks.
- [ ] Сгенерировать copy-paste-free runbook: роль на каждом шаге, команда/script, expected result, abort threshold,
      rollback action и evidence location.
- [ ] Репетиция проходит от начала до rollback на disposable/TEST с теми же scripts и порядком.
- [ ] Владелец назначает GO/rollback authority, окно и канал связи (`O-10`, `G-11`).

## I5 — production cutover (`Owner GO; AI/operator executes runbook`)

1. Preflight: full CI/release SHA, provider health, target unlock, backups/restores, secrets, DNS, channels, disk space.
2. Объявить maintenance и остановить/freeze все writers, schedulers, webhooks и delivery queues на source.
3. Создать финальную encrypted backup/copy; проверить checksum и restore-readability до продолжения.
4. Восстановить delta/final DB и media manifests на target; применить только канонические migrations.
5. Выполнить schema/count/invariant/tenant-negative smoke; clinical values в evidence не выводить.
6. Переключить DNS/reverse proxy/webhooks; включать writers и delivery по одному, с наблюдением queue/health.
7. Наблюдать agreed soak window. При любом abort criterion остановить target writers и выполнить documented rollback.
8. Владелец фиксирует GO либо ROLLBACK с timestamp; агент не принимает решение самостоятельно.

### Обязательная фазовая модель rollback

1. До write freeze target можно удалить, source продолжает работать.
2. После freeze, но **до первой записи на target**, допустимо вернуть DNS/source writers после проверки, что source
   остаётся канонически актуальным.
3. После первой записи на target **запрещено** просто возвращать DNS на stale source DB. Нужно снова остановить target
   writers, создать и проверить новый encrypted backup/delta из target, восстановить его на подготовленный
   rollback host/source, выполнить schema/count/invariant/tenant-negative checks и только затем переключать traffic.
4. Ошибка application release в первую очередь откатывается предыдущим root-owned release на новом encrypted host;
   это безопаснее инфраструктурного возврата.
5. После удаления source rollback заменяется обычным DR restore. Каждый phase transition и canonical-writer state
   явно записывается в cutover evidence.

## I6 — post-cutover and decommission (`AI prepares; owner authorizes destructive actions`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Ротировать DB/session/M2M/integration/S3/SSH secrets и доказать, что старые credentials отозваны.
- [ ] Сохранить source host выключенным/изолированным только на утверждённое rollback window; не использовать как
      второй живой PROD.
- [ ] После owner approval удалить старые volumes/images/snapshots/plain backups и получить provider deletion
      confirmation. Удаление необратимо и требует точного target audit.
- [ ] Обновить non-secret topology/runbooks/evidence/access registry; закрыть лишние Selectel/GitHub/SSH grants.
- [ ] Выполнить post-cutover restore drill из независимой российской encrypted copy.

## Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Реальный PROD работает только на принятой encrypted topology; открытый source не является active fallback.
- [ ] Reboot/unlock/recovery, DB/media restore и secret rotation доказаны, а не описаны теоретически.
- [ ] External scan показывает только утверждённые public ports; runtime/deploy users не получают root path.
- [ ] RPO/RTO уложились в утверждённые значения либо residual risk принят через `G-12`.
- [ ] Old resources/copies удалены по owner gate и provider evidence; docs отражают точный новый state.
