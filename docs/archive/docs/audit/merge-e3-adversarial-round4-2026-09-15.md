# Адверсарный аудит Э3, круг 4: выбор ФИО человеком

**Вердикт: FAIL.** Автоматический диалог после коррекции `f2ef7bd7e` выдержал живые сценарии и все три
обязательные инъекции. Но census write-path нашёл четвёртую дверь — ручное слияние: она по-прежнему
исключает отчество из человеческого решения и оставляет его по `COALESCE(target, duplicate)`. Это прямое
нарушение `AUTH_AND_IDENTITY_CANON.md` §18а: «порядка приоритетов больше нет ни в автоматическом слиянии,
ни в ручном» и «при конфликте просим человека выбрать».

**Кандидат:** `wt/merge-fio-dialog`, HEAD до аудита `af0d7c663`; коррекция `f2ef7bd7e`, отчёт исполнителя
`24c36d791` + `af0d7c663` прочитан как заявление. **Оракул:**
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э3; `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18а.

## Итог по пяти пунктам

| Пункт | Вердикт | Доказательство |
|---|---|---|
| 1. Потеря частей ФИО | **PASS для автоматического диалога** | Живая DEV-транзакция: раздельные фамилия/отчество дополнились; полностью пустая сторона ничего не стёрла; выбранный display-вариант сохранил отдельно подтверждённые фамилию, имя и отчество. Оба зеркала совпали. |
| 2. Подстановка чужого имени | **PASS для автоматического диалога** | Пустая найденная сторона в обеих ориентациях уступила непустому имени; обе пустые остались пустыми; при двух display-only вариантах записан выбранный. |
| 3. «Дополняем» против «спрашиваем» | **FAIL в четвёртой, ручной двери** | Автоматическая дверь: неконфликтные части дополняются без вопроса, конфликт без ответа отклоняется. Ручная дверь: конфликтующие отчества человеку выбрать невозможно; unit acceptance красный, live путь вместо вопроса падает раньше с PostgreSQL `42846`. |
| 4. Зубы набора | **PASS, 3/3 инъекции пойманы** | Таблица ниже; продуктовый код после каждой инъекции восстановлен. |
| 5. Четвёртая дверь / единый шов | **FAIL** | Автоматические двери сходятся в общий resolver; ручная ветка того же `mergePlatformUsersInTransaction` обходит его отдельным SQL и сохраняет снятый движковый приоритет отчества. |

## 1–3. Живой прогон автоматического диалога

Каждый сценарий выполнялся `BEGIN → реальные INSERT → mergePlatformUsersInTransaction → чтение
platform_users/user_identity → ROLLBACK`. Использована только именованная DEV `bcb_webapp_dev`; временной БД,
миграций и второго Next-сервера не было.

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh 'relay_dir=$(mktemp -d /tmp/e3-audit-relay.XXXXXX); chmod 0777 "$relay_dir"; sudo -n -u postgres /usr/bin/node -e '\''const net=require("node:net"); const path=process.argv[1]+"/.s.PGSQL.5432"; const server=net.createServer(client=>{const upstream=net.createConnection("/var/run/postgresql/.s.PGSQL.5432"); client.pipe(upstream).pipe(client); upstream.on("error",()=>client.destroy());}); server.listen(path);'\'' "$relay_dir" & relay_pid=$!; cleanup(){ kill "$relay_pid" 2>/dev/null || true; wait "$relay_pid" 2>/dev/null || true; rm -f "$relay_dir/.s.PGSQL.5432"; rmdir "$relay_dir" 2>/dev/null || true; }; trap cleanup EXIT; for i in $(seq 1 50); do [ -S "$relay_dir/.s.PGSQL.5432" ] && break; sleep 0.1; done; [ -S "$relay_dir/.s.PGSQL.5432" ] || { echo "relay socket not ready"; exit 1; }; sudo -n -u postgres chmod 0777 "$relay_dir/.s.PGSQL.5432"; AUDIT_PGHOST="$relay_dir" pnpm --dir apps/webapp exec tsx ../../docs/audit/evidence/merge-e3-adversarial-round4-2026-09-15/live-fio-scenarios.mts'
```

Вывод:

```text
PASS 1a surname and patronymic complement silently
PASS 1b entirely empty side does not erase structured FIO
PASS 1c display choice preserves each separately confirmed part
PASS 2a empty recognized display falls back to the named side
PASS 2b mirrored empty recognized display also falls back
PASS 2c both empty stay empty without borrowing any other identity
PASS 2d conflicting display-only names write the chosen account name
PASS 3a a real structured conflict refuses an unanswered merge
PASS 3b a missing field alone creates no question
RESIDUE {"platform_users":0,"user_identity":0}
```

Полный воспроизводимый сценарий и вывод: `evidence/merge-e3-adversarial-round4-2026-09-15/live-fio-scenarios.mts`
и `live-fio-scenarios.out`.

## 4. Инъекции

После каждой временной поломки запускалась одна и та же точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project unit src/infra/accountMergeMedicalHistory.unit.test.ts src/modules/auth/accountMergeNotification.unit.test.ts"
```

До инъекций вывод был `Test Files 2 passed (2)`, `Tests 15 passed (15)`.

| Что сломано | Результат | Покрасневшее наблюдаемое утверждение |
|---|---|---|
| Вернул оптовую перезапись частей со стороны выбранного `display_name` | **Поймано**: `1 failed, 14 passed` | `keeps the FIO parts the person kept...`: ожидались `Иванов`/`Иван`, получены `null`/`null`. |
| Убрал fallback на вторую сторону при пустом `display_name` распознанной учётки | **Поймано**: `1 failed, 14 passed` | `lets the empty display name...`: ожидалось `Иванов Иван Петрович`, получено `''`. |
| Убрал учёт `humanChoiceRequired` для одностороннего поля | **Поймано**: `2 failed, 13 passed` | Незаполненный ответ перестал останавливать merge; явное «Не указано» перестало снимать фамилию/имя. |

Полный существенный вывод: `evidence/merge-e3-adversarial-round4-2026-09-15/targeted-tests-and-injections.out`.
Временные изменения `packages/platform-merge/src/pgPlatformUserMerge.ts` полностью возвращены; постоянных
изменений product-кода аудит не оставил.

## 5. Census дверей и write-path

Команда поиска всех production-вызовов общего merge-engine:

```bash
rg -n "mergePlatformUsersInTransaction\\(" packages apps --glob '!docs/**' --glob '!**/*.test.*' --glob '!**/node_modules/**'
```

Содержательный вывод после исключения деклараций/комментариев:

```text
apps/webapp/src/infra/manualPlatformUserMerge.ts:35       manual
apps/webapp/src/infra/repos/pgEmailAuth.ts:330            automatic + HumanMergeDecision
apps/webapp/src/infra/repos/pgUserByPhone.ts:616          automatic + HumanMergeDecision
apps/webapp/src/infra/repos/pgUserByPhone.ts:739          automatic + HumanMergeDecision
```

Ещё три collision-входа не пишут ФИО: `identityProjectionWrite.ts:103`,
`messengerPhonePublicBind.ts:189`, `pgChannelLinkClaim.ts:154` останавливаются
`human_account_confirmation_required`; `pgEmailPasswordLookup.ts:99` также только фиксирует конфликт.

Команда census записей ФИО внутри общего пакета:

```bash
rg -n "INSERT INTO (public\\.)?platform_users|UPDATE (public\\.)?platform_users|INSERT INTO (public\\.)?user_identity|UPDATE (public\\.)?user_identity" packages/platform-merge/src --glob '!**/*.test.*'
```

Вывод и классификация:

```text
userIdentityFioWrite.ts:20          единое зеркало user_identity
identityProjectionWrite.ts:193     создание одной новой учётки; collision до записи остановлен
identityProjectionWrite.ts:253     обогащение одной найденной учётки; collision до записи остановлен
pgPlatformUserMerge.ts:704         РУЧНАЯ ветка — отдельный FIO SQL, обход resolver [FAIL]
pgPlatformUserMerge.ts:794         АВТОМАТИЧЕСКАЯ ветка — результат HumanMergeDecision/resolver [PASS]
pgPlatformUserMerge.ts:833         только merged_into_id/merged_at, ФИО не пишет
```

### Блокирующая находка Д-4

**Вход:** ручное слияние двух client-учёток с одинаковыми фамилией/именем и разными отчествами:
`Петрович` против `Сергеевич`.

**Неверный исход:**

- `ManualMergeResolution.fields` (`packages/platform-merge/src/manualMergeResolution.ts:15-20`) не имеет
  `patronymic`;
- preview прямо исключает конфликт (`platformUserMergePreview.ts:222-225`);
- UI говорит, что движок отчество «не арбитрирует» (`accountMergeLogic.ts:90-94`);
- merge SQL молча выбирает `COALESCE(target, duplicate)` (`pgPlatformUserMerge.ts:700-713`).

Новый acceptance-тест на публичной границе merge-engine:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project unit src/infra/accountMergeMedicalHistory.unit.test.ts src/modules/auth/accountMergeNotification.unit.test.ts"
```

Вывод на текущем продукте:

```text
FAIL refuses a manual merge when patronymics conflict but the resolution has no human choice
AssertionError: promise resolved instead of rejecting with "human choice required for patronymic"
Test Files 1 failed | 1 passed (2)
Tests 1 failed | 15 passed (16)
```

Точная команда живой попытки той же пары на DEV:

```bash
/home/dev/brain/host-orch/run-tests.sh 'relay_dir=$(mktemp -d /tmp/e3-audit-relay.XXXXXX); chmod 0777 "$relay_dir"; sudo -n -u postgres /usr/bin/node -e '\''const net=require("node:net"); const path=process.argv[1]+"/.s.PGSQL.5432"; const server=net.createServer(client=>{const upstream=net.createConnection("/var/run/postgresql/.s.PGSQL.5432"); client.pipe(upstream).pipe(client); upstream.on("error",()=>client.destroy());}); server.listen(path);'\'' "$relay_dir" & relay_pid=$!; cleanup(){ kill "$relay_pid" 2>/dev/null || true; wait "$relay_pid" 2>/dev/null || true; rm -f "$relay_dir/.s.PGSQL.5432"; rmdir "$relay_dir" 2>/dev/null || true; }; trap cleanup EXIT; for i in $(seq 1 50); do [ -S "$relay_dir/.s.PGSQL.5432" ] && break; sleep 0.1; done; [ -S "$relay_dir/.s.PGSQL.5432" ] || { echo "relay socket not ready"; exit 1; }; sudo -n -u postgres chmod 0777 "$relay_dir/.s.PGSQL.5432"; AUDIT_PGHOST="$relay_dir" pnpm --dir apps/webapp exec tsx ../../docs/audit/evidence/merge-e3-adversarial-round4-2026-09-15/live-manual-patronymic-conflict.mts'
```

Вывод:

```text
MERGE_FAILED_BEFORE_HUMAN_PATRONYMIC_CHOICE 42846 cannot cast type record to uuid[]
RESIDUE {"rows":0}
```

То есть четвёртая дверь не реализует требуемый выбор ни на уровне контракта, ни live: изолированный engine
молча проходит без ответа, а реальный DB-path падает раньше вопроса. Исправление не выполнялось.

## Не дефекты этого аудита

- Вопросы владельцу 1–6 из отчёта исполнителя не превращались в findings.
- Ошибка `42846` сама по себе не расширена в отдельную работу; здесь она записана только как фактический live-исход
  четвёртой двери.
- UI автоматически не тестировался, второй Next-сервер не запускался, миграции на DEV не применялись,
  полный CI не запускался.

## Статическая проверка audit-изменений

```text
pnpm --dir apps/webapp exec eslint src/infra/accountMergeMedicalHistory.unit.test.ts → rc=0
pnpm --dir apps/webapp exec tsc --noEmit --pretty false                              → rc=0
```
