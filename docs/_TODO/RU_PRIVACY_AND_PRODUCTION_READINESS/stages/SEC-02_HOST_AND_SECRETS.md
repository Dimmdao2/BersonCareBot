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

## Slice A — perimeter and SSH

- [ ] Сверить Selectel SG, listening sockets, nginx upstreams, SSH users/keys и whitelist sudo.
- [ ] Сформировать default-deny matrix: public 80/443; SSH только утверждённые sources; DB/app ports не public.
- [ ] Реализовать один `nftables` ruleset и rollback timer; доказать persistence после reboot на TEST/disposable.
- [ ] Настроить fail2ban для SSH с безопасными thresholds; проверить ban/unban и отсутствие deploy lockout.

## Slice B — processes and files

- [ ] Разделить service users и write paths; deploy не должен иметь путь к root через изменяемый unit/script.
- [ ] Зафиксировать `User/Group`, `NoNewPrivileges`, `PrivateTmp`, filesystem capabilities и необходимые исключения.
- [ ] Проверить ownership/mode env, units, backups, logs и release paths; секретные файлы не читаются app-непотребителями.
- [ ] Добавить `systemd-analyze security` baseline и smoke каждого процесса после sandboxing.

## Slice C — secret lifecycle

- [ ] Реестр secret names: purpose, owner, producer/consumer, storage, created/last-rotated, rotation/revoke path.
- [ ] Удалить дубли после S5 migration только по доказанному usage census; значения в лог/git не выводить.
- [ ] Выполнить TEST rotation drill для session/M2M/integration/DB credentials с rollback и session-impact report.
- [ ] Описать emergency revoke после компрометации и проверку отсутствия старого секрета.

## Checks и выход

- preflight/dry-run/idempotency/rollback; shell lint для scripts;
- TEST reboot + service smoke + external port scan из разрешённой точки;
- negative proof: app/service/deploy user не читает чужие credentials и не меняет root-owned unit;
- owner-approved production window закрывается repeatable evidence, не ручной последовательностью из чата.
