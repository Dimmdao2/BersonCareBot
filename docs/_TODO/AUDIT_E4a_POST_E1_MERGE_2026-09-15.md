# Независимый адверсарный аудит Э4a после слияния с Э1

Кандидат: `wt/merge-conflict-doctor`, исходный `HEAD`
`c50fa21ab34421632ea638c61a89b4bd35cd326f`.

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э4a и явное решение
«столкновение версий разрешает ведущий при приземлении, побеждает типизированная версия Э1»;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18 и §18б; `AGENTS.md` §1, §5, §10a,
§10b, §24.4–§24.7.

Статус документа: промежуточное сохранение до временных инъекций. Итоговый вердикт будет записан
после живой проверки обхода сверки открытых попыток и fault injection. В очередь `feat` строку
вердикта не вносить: это делает ведущий.

## Классификация до чтения тестов

| Проверка | Тип | Почему |
|---|---|---|
| Сохранность обеих сторон merge и точная форма гейта Э1 | **ВЗГЛЯД** | Итоговое состояние и происхождение строк доказываются diff/сравнением committed-версий. |
| Гейт Э1 на 21 сценарии | **ПОВЕДЕНИЕ** | Нужен живой вызов движка против PostgreSQL, чтения кода недостаточно. |
| Дверь врача и честные исходы | **ПОВЕДЕНИЕ** | Нужен вызов под настоящей runtime-ролью врача. |
| Минимальность `SELECT` на `system_settings` и tenant-wall | **ПОВЕДЕНИЕ** + **ВЗГЛЯД** | Необходимость колонок доказывается PostgreSQL; адресат и отсутствие расширения `app_staff` — декларацией и catalog introspection. |
| Обход `reconcileOpenTestAttemptsForMerge` | **ПОВЕДЕНИЕ** | Нужно увидеть фактическое перемещение попытки definer-функцией и отсутствие строки дубликата. |
| Два открытых черновика одного пункта | **ВОПРОС ВЛАДЕЛЬЦУ** | Требования в Э4a/каноне нет; даже воспроизведённый `23505` не даёт authority на fix. |

## Слепой kill-set

Составлен по authority до чтения тестов:

1. NULL-организация перестаёт совпадать с произвольной известной организацией.
2. UUID-массивы/`ANY(...::uuid[])` или разделение блокирующих и переносимых записей теряются при merge.
3. Дверь врача не вызывает `app.transfer_staff_approved_platform_user_merge_data` либо скрывает её
   честный исход.
4. За дверью повторно выполняется обычный перенос зависимых строк либо не переводятся контакты.
5. Триггер создания клиники не работает без минимального `SELECT` арбитра или грант расширяет
   `app_staff`/значения настроек.
6. Definer-функция оставляет `test_attempts.patient_user_id = duplicateId`, а обход сверки молча
   пропускает незавершённый перенос.

## Уже полученные доказательства

### 1. Обе стороны слияния сохранены — **ВЗГЛЯД**, PASS

- `git show --no-patch --pretty=raw d9d68368b` подтвердил родителей merge:
  Э4a `8bc6b263d77fa1fde9d9bee6102ae308791fb779` и `feat`
  `0398e2495678a422a3b9396e1f9be53cfc0b17a8`.
- Команда сравнения блока от `type MergeTransferRecord` до
  `assertAutomaticMergeHasNoMedicalHistory` дала одинаковый SHA-256 для `0398e2495` и `HEAD`:
  `4aababc97cb08bdbfcb284617dc55620ade1afb254b2762ccb9922bde3f9f808`.
- Та же команда насчитала по `10` `automaticProbe` в обоих состояниях. Условие соединения в обоих:
  `duplicate.organization_id IS NULL OR target.organization_id IS NULL OR
  duplicate.organization_id = target.organization_id`; в текущей версии поверх него только
  фильтр одобренной врачом организации Э4a.
- `git diff 0398e2495..HEAD -- packages/platform-merge/src/pgPlatformUserMerge.ts` показывает
  добавления Э4a поверх Э1: `MergePlatformUsersOutcome`, опции двери, честный возврат
  `awaiting_other_organization`/`conflict_not_found`, вызов definer-двери, отдельный перенос
  контактов и обход обычного переноса.
- `git diff 8bc6b263d..HEAD` и поиск E4a-символов в обеих версиях подтвердили, что все перечисленные
  входы/исходы Э4a сохранились; изменения относительно `8bc6b263d` — типизированный гейт и
  collision-reconciliation Э1 плюс исправление `f9bb0a32c`.

### 2. Постоянная проба Э1 — **ПОВЕДЕНИЕ**, PASS

Команда (заголовок пробы, текущий клон, обязательный host lock):

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-conflict && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"
```

Дословная итоговая строка:

```text
# proof_status=PASS scenarios=21 rollback=complete residual_rows=0
```

Итог TAP: `# tests 2`, `# pass 2`, `# fail 0`.

### 3. `system_settings` — **ПОВЕДЕНИЕ** + **ВЗГЛЯД**, PASS на текущем объёме

Живая транзакционная матрица через host lock дала:

```text
NOTICE:  no_select=BLOCKED sqlstate=42501
NOTICE:  key_scope=BLOCKED sqlstate=42501
NOTICE:  key_organization=BLOCKED sqlstate=42501
NOTICE:  scope_organization=BLOCKED sqlstate=42501
full_three=PASS seeded_rows=1
residual_orgs=0
residual_settings=0
```

То есть нужны именно все три колонки арбитра `key`, `scope`, `organization_id`; любая пара
недостаточна. Candidate-style reconcile (`REVOKE ALL PRIVILEGES ON TABLE`, затем колоночный grant)
оставляет `SELECT` только на этих трёх колонках; отдельный `SELECT value_json` после него отвечает
`ERROR: permission denied for table system_settings`.

Catalog introspection: `app_seam_specialist_provision_owner` и `app_staff` — `NOLOGIN`,
`NOSUPERUSER`, `NOBYPASSRLS`, взаимного membership нет; `system_settings` имеет `RLS=true`,
`FORCE=true`; обе seed-функции — `SECURITY DEFINER` и принадлежат seam-owner; `app_staff` не имеет
`EXECUTE` на них и не имеет `INSERT` в `be_organizations`. Diff `f9bb0a32c^..f9bb0a32c` меняет только
grant seam-owner; строки `app_staff` до/после идентичны (`SELECT, DELETE`, колоночные
`INSERT`/`UPDATE`).

## Оставшиеся действия

- Живой прогон двери врача на этом SHA.
- Живая фикстура одной открытой попытки только у дубликата: definer-перенос → `duplicate=0`,
  `target=1`, результат сохранён.
- Fault injection по независимым классам и побайтовое восстановление дерева.
- Финальный вердикт и окончательный коммит audit-artifact.
