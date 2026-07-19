# PR-00 — Scope lock

## Вход

- Активные taskdb/ветки/логи прочитаны.
- `SERVER CONVENTIONS`, deploy/backup/S3 runbooks и relevant architecture docs найдены через code-search.

## Работа

- [ ] Инвентаризировать категории ПДн и clinical data по таблицам, files/S3, messages, logs, backups и exports.
- [ ] Построить карту process → principal → DB role → schema/table → external recipient.
- [ ] Инвентаризировать auth, MFA/session, admin/break-glass, SSH, GitHub, Selectel, DB и S3 access surfaces.
- [ ] Инвентаризировать secrets по имени/owner/storage/rotation без значений.
- [ ] Выполнить read-only production preflight строго по каноническим runbooks; неизвестное оставить `unconfirmed`.
- [ ] Для каждого gap назначить `covered`, `active_dependency`, `new_stage`, `owner_question` или `not_applicable`.
- [ ] Независимый аудитор проверяет отсутствие дублей и вмешательства в active scope.

## Разрешённый scope

Только файлы этой инициативы и read-only команды. Любая правка application/deploy/active plans вне scope.
Exact file list для следующей стадии является deliverable PR-00, а не разрешением начать её автоматически.

## Checks

- code-search по каждому заявленному control и точечная ссылка на источник;
- `git diff --check` и relative-link validation;
- сверка taskdb непосредственно перед закрытием, чтобы scope не устарел.

## Выход

- Реестр полный, у каждого gap один owner/stage/status.
- Ни одна active stage не получила незапрошенный diff.
- Владелец принял baseline и список `owner_question`.
