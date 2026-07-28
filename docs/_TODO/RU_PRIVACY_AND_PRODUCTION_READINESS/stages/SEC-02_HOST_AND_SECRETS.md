# SEC-02 — Host hardening and secret lifecycle

## Зависимости

- PR-00 host/access inventory.
- Для S5-related secrets: S5-7 закрыт на stable SHA.
- Для TEST mutations: rehearsal task и rollback reviewer.
- Для production: TEST proof + fresh backup/restore proof + `G-11`.

## File scope gate

Allowed сейчас: эта инициатива и read-only host commands по runbook. Перед TEST `doing` в LOG фиксируется exact list
существующих `deploy/host/*`, unit/config templates и test scripts. Out of scope: active SaaS/Product UX files,
application domain code и любые production mutations до отдельного `G-11` task.

## Slice 0 — urgent current-PROD containment

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Агенты сейчас могут подготовить repository patch, tests, preflight и rollback; применять на PROD можно только в
короткое окно `G-11`. Новый encrypted host не является причиной оставлять критические текущие gaps открытыми.

> ⛔ **РЕШЕНИЕ ВЛАДЕЛЬЦА 27.07 — НЕ ТРОГАТЬ, ЭТО НЕ ЗОНА АГЕНТОВ.** Дословно про SSH-root/пароли и службы от
> root на текущем проде: «не трогать. Не твое». Slice 0 НЕ исполнять: ни патча, ни preflight, ни предложений,
> ни задач в трекере под это. Вопрос закрыт владельцем, повторно не поднимать. Находки снимка 19.07 остаются
> ниже как запись факта, а не как наряд на работу.
>
> **⚠️ Историческая заметка (2026-07-27, до решения выше).** Владелец сказал про эти находки: «это только на
> тесте... На проде не будет». Снимок `CURRENT_PROD_BASELINE_2026-07-19.md` снят с хоста
> `adelaide`, а `docs/ARCHITECTURE/SERVER CONVENTIONS.md:43` определяет `adelaide` как `135.106.162.170` —
> текущий боевой PROD. То есть находки Slice 0 относятся к живому проду, а не к тесту. Возможное прочтение:
> владелец имел в виду, что этого не будет на НОВОМ хосте после `INFRA-01` — там непривилегированные service
> users и файрвол закладываются с нуля. Расхождение не разрешено агентом и вынесено на его прямое
> подтверждение; до подтверждения Slice 0 остаётся в силе как containment для текущего PROD.
>
> Существенно для приоритета: не-root службы и разграничение SSH — это меры групп ИАФ/УПД базового набора
> УЗ-3, то есть **обязательные**, в отличие от шифрования хранения, которое в обязательный набор не входит
> (приказ ФСТЭК № 21 п. 1). Их починка не требует ждать переезда.

- [ ] Исправить canonical backup path: `umask 077`, directories `0700`, files `0600`, encrypted output before
      offsite и safe disposition для существующих plaintext dumps. Детали — `DR-01`.
- [ ] После проверенного owner/recovery key path запретить SSH password и direct root login; SSH ограничить approved
      sources/VPN через SG + host rules.
- [ ] Сузить root-equivalent deploy sudo; deploy/runtime user не меняет root-owned unit, privileged script и release.
- [ ] Убрать raw SQL params/clinical payload из production error logs.
- [ ] Каждый change — отдельный reversible slice; firewall/SSH change имеет rollback timer и вторую живую recovery
      session. Никаких пакетных команд «сделать всё» без промежуточного health proof.

## Slice A — perimeter and SSH

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Сверить Selectel SG, listening sockets, nginx upstreams, SSH users/keys и whitelist sudo.
- [ ] Сформировать default-deny matrix: public 80/443; SSH только утверждённые sources; DB/app ports не public.
- [ ] Реализовать один `nftables` ruleset и rollback timer; доказать persistence после reboot на TEST/disposable.
- [ ] Настроить fail2ban для SSH с безопасными thresholds; проверить ban/unban и отсутствие deploy lockout.

## Slice B — processes and files

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Разделить service users и write paths; deploy не должен иметь путь к root через изменяемый unit/script.
- [ ] Зафиксировать `User/Group`, `NoNewPrivileges`, `PrivateTmp`, filesystem capabilities и необходимые исключения.
- [ ] Проверить ownership/mode env, units, backups, logs и release paths; секретные файлы не читаются app-непотребителями.
- [ ] Добавить `systemd-analyze security` baseline и smoke каждого процесса после sandboxing.
- [ ] Зафиксировать root-owned immutable release activation: root-сервис не исполняет deploy-writable artifact.

## Slice C — secret lifecycle

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Реестр secret names: purpose, owner, producer/consumer, storage, created/last-rotated, rotation/revoke path.
- [ ] Удалить дубли после S5 migration только по доказанному usage census; значения в лог/git не выводить.
- [ ] Выполнить TEST rotation drill для session/M2M/integration/DB credentials с rollback и session-impact report.
- [ ] Описать emergency revoke после компрометации и проверку отсутствия старого секрета.

## Slice D — runtime detection / EDR-HIDS decision

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] От модели угроз построить detection coverage: что видят `auditd`, AppArmor, systemd/journal, network/SSH
      alerts и external monitoring; какие host/process/file/network техники остаются невидимыми.
- [ ] Сравнить `Wazuh`/эквивалент, `osquery` и вариант без дополнительного agent по coverage, root privileges,
      supply-chain/update path, CPU/RAM/disk/network budget, PII/log redaction, RU storage и операционной нагрузке.
- [ ] Если кандидат нужен — проверить только на disposable/new VPS: install/enrollment/TLS, reboot, application load,
      alert delivery, simulated detection, update и полный removal/rollback без остаточного root access.
- [ ] Зафиксировать `G-06B` как `adopt` либо `not required with compensating controls`; имя продукта не заменяет
      threat coverage и человека, который разбирает alerts.
- [ ] EDR/HIDS manager/index не размещать на том же единственном PROD-хосте: его потеря не должна уничтожать
      security evidence вместе с приложением.

## Checks и выход

- preflight/dry-run/idempotency/rollback; shell lint для scripts;
- TEST reboot + service smoke + external port scan из разрешённой точки;
- negative proof: app/service/deploy user не читает чужие credentials и не меняет root-owned unit;
- `G-06B` закрыт evidence: adopted agent работает в resource budget и шлёт alert в отдельный RU sink либо
  compensating controls перечислены и проверены;
- owner-approved production window закрывается repeatable evidence, не ручной последовательностью из чата.
