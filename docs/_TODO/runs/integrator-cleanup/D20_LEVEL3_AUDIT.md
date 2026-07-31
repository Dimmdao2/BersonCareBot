# D20 · аудит уровня 3 — «двойная отправка» — независимый аудит с прогонами

Run: `auditor-live-d20-level3`. Проверяемое: коммит `73cce2a64`, отчёт `D20_TESTS_LEVEL3_REPORT.md`.
Authority: `D20_INTEGRATOR_MAP.md` §«Уровень 3», пункты 14–18; бриф `D20_TESTS_LEVEL3_BRIEF.md`.

## Вердикт: **SHIP-WITH-FIXES**

Работа сделана честно: продуктовый код действительно не менялся, +7 тестов реальны, оба скрипта подключены к
существующей CI-работе `d30-scheduler-concurrency` (`.github/workflows/ci.yml:134-143`), все шесть поломок из
отчёта я перепроверять не стал — вместо них внёс **одиннадцать собственных**. Шесть из них покраснели, **пять
прошли зелёными**, и четыре из этих пяти — реальные сценарии двойной отправки живому человеку.

Главное: **пункт 15 («захват одной строки двумя воркерами») сегодня не доказан**. Piece 4a — не гонка. Я снял
из захвата строки всю блокировку и разнёс его на два незащищённых round-trip'а — скрипт остался зелёным 3/3.
Причина структурная, и она чинится четырьмя строками (см. F2).

## Находки

| # | Находка | Файл и строка | Вывод прогона | Что чинить |
|---|---------|---------------|---------------|------------|
| **F1** | `IdempotencyPort.release()` вообще ничем не покрыт: можно снести **всю** таблицу ключей дедупа — всё зелено | `apps/integrator/src/infra/db/repos/idempotencyKeys.ts:58-60` | `DELETE FROM integrator.idempotency_keys` без `WHERE` → vitest `165 passed`, `check-d30-idempotency-key-concurrency: PASS`, typecheck чисто. Промежуточный вариант (`WHERE key LIKE 'префикс%'`) — тоже всё зелено. `grep '\.release(' --include=*.test.ts` по `apps/integrator/src` → **0 совпадений** | Добавить в `check-d30-idempotency-key-concurrency.ts` piece 3: занять два разных ключа, освободить один, проверить, что второй **ещё жив** и не переиспользуем |
| **F2** | Piece 4a — **не гонка**. Захват строки без всякой блокировки не ловится | `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts:96-108` | Захват разнесён на `SELECT id …` + `UPDATE … WHERE id IN (…)` (ноль блокировок) → **PASS 3/3**. Инструментовка: `[claim2] picked=1 …272` / `picked=0 …277` — второй воркер читает уже **после** того, как первый дописал. Снятие только `FOR UPDATE SKIP LOCKED` (`outgoingDeliveryQueue.ts:202`) → тоже **PASS 3/3** | Прогреть оба соединения пула до гонки. С этой правкой (4 строки, вставлены перед enqueue) двухфазный захват падает **3/3** (`got 2`), а снятие `SKIP LOCKED` — **2/3**. Для устойчивости лучше барьер, а не только прогрев |
| **F3** | Возврат зависших строк можно расширить на уже **отправленные** — доставленное уедет повторно | `apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts:117` | `status = 'processing'` → `status IN ('processing','sent')` → claim-скрипт `PASS` (все три piece), vitest `165 passed` | В piece 4c добавить контрольную строку `sent`, которую reclaim **не имеет права** трогать (это ровно то, что умел мёртвый opt-in тест — см. F5) |
| **F4** | Проводку `idempotencyPort` в роут можно молча снять — прод откатится на дедуп в памяти процесса | `apps/integrator/src/app/routes.ts:226`; тип `idempotencyPort?` — `bookingLifecycleRoute.ts:44` | Строка `idempotencyPort: deps.idempotencyPort,` удалена → typecheck **чисто** (поле опциональное), eslint чисто, vitest `165 passed`. Ровно тот вред, что описан в пункте 16 карты: после рестарта человек получает два напоминания | Тест на **сборку**, а не на обработчик: собрать роут через `buildAppDeps`/`registerRoutes` и проверить, что `idempotencyPort` дошёл. Либо сделать поле обязательным в `BookingLifecycleRouteDeps` |
| **F5** | Скрипт, который не проверяет **ничего**, даёт CI зелёный | `check-d30-idempotency-key-concurrency.ts:31`, тот же приём в двух соседних | Ранний `return` в начале `main()` → пустой вывод, `EXIT_CODE=0`. Шаг CI смотрит только код возврата; счётчика «сколько piece обязано пройти» нет ни в одном из трёх скриптов | В конце `main()` сверять счётчик пройденных piece с ожидаемым числом и падать при расхождении |

## Что покраснело как должно (мои поломки, не из отчёта)

| Поломка | Файл:строка | Результат |
|---------|-------------|-----------|
| Снят `ON CONFLICT … DO UPDATE … WHERE` целиком | `idempotencyKeys.ts:48-53` | КРАСНЫЙ 1/1 (`code 23505`) |
| «Прочитал → проверил → записал» вместо атомарной вставки | `idempotencyKeys.ts:37-56` | КРАСНЫЙ 3/3 (`23505`). Инструментовка доказала **настоящее** перекрытие: оба `SELECT` вернули `rows=0` до обеих вставок |
| Окно жизни ключа обнулено | `idempotencyKeys.ts:46` | КРАСНЫЙ 3/3 (2 раза piece 1 `got 2`, 1 раз piece 2) — piece 2 не дубль piece 1, он ловит то, что piece 1 пропускает |
| Повторная отправка при провале аудита (`adapter.send` ещё раз в `catch`) | `dispatchPort.ts:352-356` | КРАСНЫЙ, `dispatchPort.test.ts` тест 1 |
| Лестница отступов зациклена по модулю (нет плато) | `deliveryContract.ts:36` | КРАСНЫЙ, `deliveryContract.test.ts` тест 2 |
| Ключ освобождается и на **успехе** (`catch` → `finally`) | `bookingLifecycleRoute.ts:778-781` | КРАСНЫЙ, оба теста `bookingLifecycleRoute.dedup.test.ts` |

Итого: 11 поломок, 6 красных, 5 зелёных (F1 в двух вариантах, F2 в двух вариантах, F3, F4, F5).

## Ответы на поставленные вопросы

**2. Скрипты против vitest.** Подключены по-настоящему: работа `d30-scheduler-concurrency`
(`ci.yml:134`), шаг `- run: pnpm --dir apps/integrator run check:d30-idempotency-key-concurrency`
(`ci.yml:143`), alias в `apps/integrator/package.json`. Две оговорки. Первая — F5: молчаливый успех не
отличим от настоящего. Вторая — триггеры `on: push: branches: [main, development]` + `pull_request`
(`ci.yml:3-6`): пуш в рабочую `feat/doctor-ui-rebuild` эту работу **не запускает**, а корневой
`pnpm run ci` (локальный гейт из AGENTS.md §9 перед merge/deploy) этих скриптов **не содержит** —
`ci = lint && typecheck && test && test:webapp && test:media-worker && build && build:webapp && audit`.
То есть доказательства уровня 3 живут только в GitHub Actions на PR.

**3. Мёртвая защита — подтверждаю.** `RUN_OUTGOING_DELIVERY_RECLAIM_TEST` встречается ровно в трёх местах:
сам opt-in тест, комментарий нового скрипта и отчёт исполнителя. В `.github/` — **ноль** совпадений; файл
под `describe.skipIf(!enabled)`. Требование карты (пункт 15, «предел возврата зависших») теперь закрыто
доступным CI-путём — piece 4c. Но перенесён **один** из четырёх тестов мёртвого файла; в частности
«returns a stale processing row to pending but leaves a fresh processing row alone»
(`outgoingDeliveryQueue.reclaim.integration.test.ts:151`) остался мёртвым — и это ровно та защита, которой
не хватило против F3.

**4. Пункт 16 — утверждение исполнителя верно, но ничем не удерживается.** Проверено по коду: `di.ts:254`
`input.idempotencyPort ?? createPostgresIdempotencyPort(dbPort)`, тип `AppDeps.idempotencyPort` обязателен
(`di.ts:136`), `routes.ts:226` передаёт его, других вызовов
`registerBersoncareBookingLifecycleRoute` в репозитории нет. Fallback сегодня действительно недостижим.
Но поле в `BookingLifecycleRouteDeps` опциональное, и удаление одной строки возвращает недостижимую ветку в
прод молча — F4. Развилка №2 карты сузилась корректно; тест на это сужение отсутствует.

**5. Область не сужена.** Все пять пунктов 14–18 закрыты чем-то: 14 — новый скрипт; 15 — существующие
piece 4a/4b плюс новая 4c; 16 — 2 теста; 17 — 2 теста; 18 — 3 теста. Тихо пропущенных пунктов нет.
Заявленные числа (+7 тестов: 2+3+2) сходятся с файлами коммита. Число «161» в этом клоне не
воспроизводится — на `HEAD` (`e852fd8fe`, merge поверх проверяемого коммита) базовый прогон даёт
`165 passed | 9 skipped`; расхождение объясняется мёржем, не припиской.

**Пункт 18, фактура проверена:** обе лестницы действительно живы одновременно —
`main.ts:64 jobQueueLoop` (→ `runner.ts:56 decideRetry` → `retryPolicy.ts`) и `main.ts:133
outgoingDeliveryLoop` (→ `outgoingDeliveryWorker.ts:120,536 retryDelaySecondsAfterFailure` →
`deliveryContract.ts`). Выбор целевой лестницы опирается на закрытый пункт №11 карты, а не на догадку —
принимается.

## Вне области (в работу не превращать)

- `enqueueOutgoingDeliveryIfAbsent` дёргает retention-удаление на каждой постановке в очередь
  (`outgoingDeliveryQueue.ts:83-84`) — вопрос стоимости, не двойной отправки.
- Оба скрипта поднимают минимальный DDL и читают `outgoing_delivery_reclaim_config` с дефолтом; исполнитель
  сам это назвал в «чего не смог». Согласен, что за рамками уровня 3.

## Состояние дерева

Все одиннадцать поломок и вся инструментовка откачены; проверено
`git diff --stat -- 'apps/**/*.ts' 'apps/**/*.json' '.github/**' 'docs/**' 'packages/**'` → пусто, новых
untracked-файлов нет. Контрольный прогон после отката: vitest `165 passed | 9 skipped`, оба скрипта `PASS`,
typecheck чисто.

**Оговорка по `git status`.** Десять путей `*.env.example` показаны как `M` — это **не** мои правки. Они
подменены символьными устройствами `/dev/null` (`crw-rw-rw- root root 1, 3`, дата 29 июля), присутствовали в
дереве до начала аудита (видны в стартовом снимке `git status`) и ломают голый `git diff`
(`error: .env.example: unsupported file type`). Ничего с ними не делал — восстановление чужого артефакта
среды не входит в область аудита.
