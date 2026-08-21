# D19 — перепроверка правила и целевой схемы ПОСЛЕ реализации (2026-08-22)

**Роль:** worker (перепись против реальности + правка документа), не аудитор.
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D19** (строки 1008–1015).
**HEAD на момент перепроверки:** `89a25f567` (branch `wt/d19-architecture-reverify-20260822`, потомок
`feat/doctor-ui-rebuild` после мержа D25 `31c01bb86`).

Чекбокс D19 в WORK_ORDER.md **не закрыт** этим отчётом — закрывает ведущий. Ниже пять пунктов из
формулировки D19, по каждому вердикт + доказательство.

---

## 1. Остался ли в интеграторе хоть один путь записи канона

**Перепроверка независимого аудита K1** (`docs/_TODO/runs/integrator-cleanup/D25_WRITER_REMOVAL_INDEPENDENT_AUDIT_2026-08-22.md`,
раздел K1) на текущем HEAD.

Команды K1 повторены без изменений:

```bash
grep -rnE "(INSERT INTO|UPDATE|DELETE FROM)[[:space:]]+(public\.)?(platform_users|user_channel_bindings|user_contacts|user_identity|user_phone_history|user_channel_preferences|notification_topics|user_notification_topics)" apps/integrator/src --include=*.ts | grep -v '\.test\.'
grep -rn "writeIdentityAndPreferencesDirect|mergeCandidateIdsViaPlatformMerge|applyMessengerPhonePublicBind|MessengerPhoneLinkError" --include=*.ts apps/ packages/
```

**Вердикт: расхождений с аудитом 22.08 нет.** Перечисление на текущем HEAD по-прежнему непустое ровно на
ту же одну запись:

- `apps/integrator/src/infra/db/repos/userChannelBotBlocked.ts:41-50` — `INSERT INTO
  public.user_channel_bindings (...) ON CONFLICT (channel_code, external_id) DO UPDATE SET ...` внутри
  `markUserChannelBotBlocked`. Достижима из delivery-пути, когда одновременно известны `platformUserId` и
  `externalId`, а строки привязки нет — тогда интегратор СОЗДАЁТ каноническую строку привязки канала.
  Файл не менялся с `8546657be` (06.06.2026) — задолго до D25 (21-22.08.2026); D25 не трогал этот путь.

Оба точных named root, которые D25 закрывал (`writeIdentityAndPreferencesDirect.ts` →
`app.integrator_upsert_channel_identity`, `bootstrapMessengerPhoneBind.ts` →
`app.integrator_bind_bootstrap_channel_phone`), на текущем HEAD by design остаются — они не являются
writer-путём мимо named root, K1 их не считает находкой (это точный named root).

**Классификация остаётся прежней — вопрос владельцу, не находка** (D25-аудит уже так классифицировал, §24.6
запрещает заводить из этого работу): считать ли `bot_blocked`-запись «синхронизацией личности» в смысле
Р-D25 (чекбокс D15b/2 называет ровно два writer-пути, и этот в него не входит), или доставочным фактом.
Своей работы из этого не завожу.

---

## 2. Ведёт ли к базе один путь

**Метод:** реконструкция census `scripts/check-no-new-raw-sql.mjs --census` вручную (сам скрипт не
запустился — `node_modules` в этом worktree не установлен, `Error [ERR_MODULE_NOT_FOUND]: typescript`;
пересборка окружения — build-действие вне границ этого хода). Список разрешённых boundary-файлов взят из
самого скрипта (`scripts/check-no-new-raw-sql.mjs:34-70`, `migrationExecutors` + `portFiles`).

```bash
grep -rlE "\.query\(" apps/integrator/src apps/webapp/src apps/media-worker/src packages/*/src \
  --include=*.ts --include=*.tsx \
  | grep -v -E "\.(test|spec)\.[cm]?tsx?$" \
  | grep -v -E "\.(devDb|rls|postgres)\.integration\.test\." \
  | grep -vE "<все 18 portFiles + migrate.ts из скрипта>"
```

Результат — три файла с текстовым совпадением `.query(`:

- `apps/webapp/src/app-layer/db/drizzle.ts:233,264` — совпадения внутри **комментариев**
  (`pg.Pool.query()`, `client.query()` упоминаются как объяснение, не вызов).
- `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:323` — совпадение внутри комментария
  (`concurrent client.query() calls`).
- `apps/webapp/src/infra/repos/pgIdentityResolution.ts:4` — совпадение в JSDoc
  (`` `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` ``).

Реальных вызовов `.query(` вне разрешённых boundary-файлов нет — census эквивалентен `production debt: 0`,
что совпадает с зафиксированным в WORK_ORDER.md измерением 21.08 (D18/D18c, `production debt: 0`,
`check-db-chokepoint.mjs → OK`).

**Вердикт: один путь к базе — подтверждено на текущем HEAD** (в пределах, что `check-db-chokepoint.mjs`
живьём не перезапущен по той же причине отсутствия `node_modules`; полагаюсь на записанный census 21.08 +
собственную ручную реконструкцию grep-census 22.08 — оба нуля).

---

## 3. Сошлось ли число вечных циклов

**Целевая модель (Р-D30, WORK_ORDER.md строки 305-309):** `worker` и `scheduler` сводятся в один резидентный
процесс — один systemd-unit, один замок, один цикл; «вечный цикл внутри вебаппа — анти-паттерн».

Проверка:

```bash
ls deploy/systemd/*.service
# bersoncarebot-api-prod.service
# bersoncarebot-media-worker-prod.service
# bersoncarebot-media-worker-test.service
# bersoncarebot-scheduler-prod.service      ← слитый scheduler+worker (D30 Ш9)
# bersoncarebot-webapp-prod.service
grep -rn "setInterval\|while (true)" apps/webapp/src --include=*.ts | grep -v test
# только клиентские React-хуки (useSupportUnreadPolling.ts, useMessagePolling.ts и т.п.) — браузерный
# polling, не серверный «вечный цикл»; ни одного backend/server-side цикла в webapp нет
```

`bersoncarebot-worker-prod.service` удалён из репозитория (`7cf580712`, D30 Ш9, 21.08.2026); merged entrypoint
— `apps/integrator/src/infra/runtime/scheduler/main.ts` (два независимых `buildDeps()`-графа внутри одного
процесса/одного лидер-замка). Счёт systemd-юнитов 6→5, задокументировано
`docs/ARCHITECTURE/SERVER CONVENTIONS.md:97,220-222,566-567` и
`docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md:97`.

**Вердикт: число вечных циклов сошлось — код-комплит, подтверждено на текущем HEAD.**

⚠️ **Оговорка (уже названная в самом коде/доках, не новая находка):** PROD этим коммитом НЕ передеплоен —
`docs/ARCHITECTURE/SERVER CONVENTIONS.md:220` прямо помечает «код-комплит, PROD ещё не редеплоен на момент
записи». Фактический переход одного unit на PROD происходит только следующим прогоном
`deploy/host/bootstrap-systemd-prod.sh` + `deploy-prod.sh`. Это состояние ожидаемое (Track D порядок §2.2
п.9 не требует PROD deploy как условие пункта), просто фиксирую факт, а не выдаю желаемое за случившееся на
PROD.

Чекбокс D30 в WORK_ORDER.md сам по себе остаётся открытым `[ ]` — Ш9 закрыт, но следующий этап
(sweep/route/registry/host cron cleanup для остальных шагов) не входит в объём D19 и не проверялся здесь.

---

## 4. Выдана ли узкая роль и совпадает ли она с тем, что ассертит деплой

⚠️ **Предмет D17, который ещё ОТКРЫТ** (`WORK_ORDER.md:996`, чекбокс `[ ]`). Ответ ниже зависит от
незакрытого D17 — фиксирую фактическое смешанное состояние по средам, не закрываю пункт.

Проверка деклараций (`deploy/postgres/privileges/declaration.ts`):

- `bcb_dev_webapp_staff` / `bcb_dev_webapp_patient` / `bcb_dev_webapp_global_admin` (строки 1838-1849,
  `port: 'webapp'`) отделены от `bcb_dev_integrator` (строка 1851, `port: 'integrator'`,
  `canonicalRole: 'app_integrator_request'`) — **разные логины, разные роли, DEV**.
- То же для TEST: `bcb_test_webapp_*` (1858-1869) vs `bcb_test_integrator` (1871, тот же
  `app_integrator_request`) — задекларировано в коде, но это ДЕКЛАРАЦИЯ генератора, не подтверждённый live
  cutover (см. ниже).

Проверка фактического состояния по средам (`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`):

- **DEV** (Ф7, строки 75-96): live-cutover подтверждён — «Новый доступ на DEV применён; четыре независимых
  DEV-login проходят `/api/me`... integrator `/health` и `/health/projection` возвращают `200`». Узкая роль
  для интегратора на DEV **живая и подтверждённая**.
- **TEST** (Ф8, строки 524-536): ВСЕ пункты чекбокса открыты `[ ]` — «OWNER-REPLACED 16.08.2026: TEST
  запрещено трогать до полного зелёного DEV-прохода». Live cutover на TEST **не выполнялся**.
- **PROD** (Ф9, строки 551-554): все пункты открыты `[ ]`, явный запрет: «Ничего на PROD не выполнять без
  нового явного разрешения владельца». `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md:17` и
  `deploy/env/README.md` (раздел `api.prod`) прямо подтверждают: **на PROD сейчас одна общая runtime-роль**
  для webapp и integrator (единый `DATABASE_URL` в `api.prod`/`webapp.prod`) — это текущий факт, не
  устаревшая запись (файл `DATABASE_UNIFIED_POSTGRES.md` не правился с апрельского cutover, и Ф9 подтверждает,
  что ничего не изменилось).

Что ассертит деплой: `deploy-test-saas.sh` (по памяти проекта `deploy-asserts-runtime-role-privileges-dont-violate`)
жёстко ассертит точный набор прав каждой роли — но это работает **против текущей TEST-декларации**, которая
для интегратора там сама ещё не прошла Ф8 cutover; т.е. деплой ассертит цель, которая пока не полностью
выдана на TEST и не выдана вовсе на PROD.

**Вердикт: узкая роль ЕСТЬ и подтверждена только на DEV; на TEST задекларирована в коде, но не переведена
live; на PROD не выдавалась вовсе (одна общая роль). Полное совпадение с тем, что ассертит деплой, наступит
только после Ф8 (TEST) и Ф9 (PROD) — то есть после закрытия D17.** Не закрываю этот пункт.

---

## 5. Не появилось ли новых прямых импортов между деревьями приложений вместо пакета

D19a (`WORK_ORDER.md:1017-1020`) закрыт — гейт `scripts/check-webapp-infra-import-boundary.mjs` жив и красит
нарушение, но **его периметр уже — модули/роуты, а не любой межпроектный импорт**:

```bash
node scripts/check-webapp-infra-import-boundary.mjs
```
не запустился по той же причине отсутствия `node_modules` в этом worktree (см. п.2). Живость гейта
подтверждена документально — независимый аудит `D19A_IMPORT_BOUNDARY_INDEPENDENT_AUDIT_2026-08-03.md`
живьём проверял все 7 форм обхода (прямой/алиас/type-only/dynamic/computed dynamic/re-export/relative) через
временный файл-приманку — все 7 упали. Гейт покрывает `apps/webapp/src/modules/**` и
`apps/webapp/src/app/api/**/route.ts`, ищет `@/infra/db/*` и `@/infra/repos/*`.

**Отдельная проверка — общий периметр «нет прямых импортов между деревьями `apps/integrator` ↔
`apps/webapp`» (сам этот пункт из D19, а не узкий D19a):**

```bash
grep -rnE "from ['\"](\.\./)*(\.\./)*webapp/|apps/webapp" apps/integrator/src --include=*.ts
grep -rnE "from ['\"](\.\./)*(\.\./)*integrator/|apps/integrator" apps/webapp/src --include=*.ts --include=*.tsx
```

**Найдена одна живая находка — реальный относительный импорт, не комментарий:**

`apps/webapp/src/shared/normalizeToUtcInstant.ts:11`:
```ts
export { normalizeToUtcInstant, tryNormalizeToUtcInstant, ... }
  from '../../../integrator/src/shared/normalizeToUtcInstant.js';
```

Это прямой импорт из дерева `apps/webapp` в дерево `apps/integrator`, ровно то, что запрещает ARCHITECTURE.md
строка 42 («Нет ПРЯМЫХ импортов между деревьями приложений»). Проверил три вещи:

1. **Не новый.** `git log` на файл: последняя правка `68bfcbeda` (29.07.2026, только prettier-формат),
   создание — `869f00fd2` (04.04.2026) — за месяц до старта Track D (30.07.2026). D19a закрывался 03.08.2026 и
   не мог его найти — не входил в его периметр (`shared/`, не `modules/`+`app/api/route.ts`, и не
   `@/infra/*`-паттерн).
2. **Мёртвый.** Ни один production-файл webapp не импортирует этот реэкспорт: `grep -rln
   "shared/normalizeToUtcInstant" apps/webapp/src` не находит ссылок кроме самого файла. Ни `no-restricted-imports`,
   ни D19a-гейт этот паттерн (голый relative cross-tree import вне modules/route.ts) не ловят и для НОВОГО кода
   тоже — периметр гейта у́же формулировки правила в ARCHITECTURE.md.

**Вердикт: новых обходов D19a-гейта не появилось (сам гейт по своему объёму жив и корректен). Но более
широкая формулировка правила из ARCHITECTURE.md — «нет прямых импортов между деревьями» без оговорки про
modules/route.ts — не полностью гейтована: найден один живой (хоть и мёртвый по достижимости, и старый, не
новый) пример, который никакой текущий гейт не поймает, появись он в новом коде.** Это не регрессия D19a
(вне его периметра по построению), но расхождение между записанным hard rule и фактическим покрытием —
задокументировано в ARCHITECTURE.md строкой ниже правила (см. следующий раздел). Правку кода (удаление
мёртвого файла или расширение гейта) не делаю — вне границ этого хода.

---

## Правки `apps/webapp/ARCHITECTURE.md`

| Строка (было) | Правка | Обоснование |
|---|---|---|
| 50 — «One PostgreSQL in production: same `DATABASE_URL` and DB **role** for both services» | Заменено на честное описание смешанного состояния: DEV — раздельные логины/узкая роль интегратора уже живьём подтверждена (Ф7); PROD — по-прежнему одна общая роль (Ф9 не начат); TEST — задекларирована в коде, но live cutover не выполнен (Ф8 открыт). Ссылки: `deploy/postgres/privileges/declaration.ts:1838-1856`, `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` (Ф7/Ф8/Ф9), `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, `deploy/env/README.md`. | Известная находка WORK_ORDER.md:1014 подтвердилась: старая строка была неверна везде и по-новому неверна была бы, если написать «узкая роль везде уже выдана» — оба крайних варианта ложны, правда посередине и привязана к D17. |
| 42 — «Нет ПРЯМЫХ импортов между деревьями приложений» | Добавлен ⚠️-абзац: гейт D19a частичный (только `@/infra/*` в `modules/**`+`app/api/**/route.ts`), найден живой (но мёртвый по достижимости, старый — 04.04.2026) пример вне периметра гейта — `apps/webapp/src/shared/normalizeToUtcInstant.ts:11`. | Пункт 5 чек-листа D19 прямо просит проверить именно это; расхождение между hard rule и фактическим покрытием гейта — годная для документа информация, а не только для отчёта. |

Больше расхождений с целевой схемой в `apps/webapp/ARCHITECTURE.md` (кроме этих двух мест) перепроверка не
нашла — остальной текст («Целевая схема: кто что делает», разделение владения интегратор/вебапп, cross-process
integration) совпадает с фактическим состоянием кода по пп. 1-3 выше.

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. **(Унаследован из D25-аудита K1, не новый).** Считать ли `bot_blocked`-INSERT в
   `apps/integrator/src/infra/db/repos/userChannelBotBlocked.ts:41-50` «синхронизацией личности» в смысле
   Р-D25 (и тогда добавить его третьим writer-путём в объём D15b/2), или это доставочный факт вне объёма
   идентичности? Классифицирую как вопрос, не завожу работу (§24.6).
2. **(Новый, из пункта 5).** `apps/webapp/src/shared/normalizeToUtcInstant.ts` — мёртвый файл (нет ни одного
   импортёра) с прямым relative-импортом в `apps/integrator`, нарушающим hard rule ARCHITECTURE.md:42, и вне
   периметра D19a-гейта. Два равноценных инженерных варианта чинки — оба тривиальны технически, выбор не мой:
   (а) удалить файл как мёртвый код; (б) расширить D19a-гейт до общего relative cross-tree паттерна
   (`apps/webapp` ↔ `apps/integrator` вне `packages/*`), раз уж формулировка hard rule шире текущего покрытия.
   Это код-правка — не делаю её в этом ходе (граница брифа), выношу отдельным пунктом.

## НЕ СДЕЛАНО

- **Живой перезапуск `scripts/check-no-new-raw-sql.mjs`, `scripts/check-db-chokepoint.mjs`,
  `scripts/check-webapp-infra-import-boundary.mjs`.** `node_modules` в этом worktree не установлен
  (`pnpm install` — build-действие, вне границ хода "перепись и документ"). Пп. 2 и 5 закрыты ручной
  реконструкцией через `grep` по тем же спискам boundary-файлов/паттернам, что зашиты в самих скриптах, плюс
  опора на уже записанные измерения WORK_ORDER.md (21.08 census) и независимые аудиты D19a/D30. Достаточно для
  вердикта, но не заменяет живой прогон скрипта — если он важен именно сейчас, нужен отдельный ход с
  установленными зависимостями.
- **Пункт 4 (узкая роль) не закрыт** — явно зависит от D17, который открыт. Смешанное состояние по средам
  зафиксировано, решение (когда считать D17 закрытым) не моё.
- **Правка кода по находке п.5** (мёртвый файл с межпроектным импортом) не сделана — вопрос владельцу выше,
  граница брифа запрещает код в этом ходе.
- **D30 остаточные шаги** (sweep/route/registry/host cron cleanup, TEST/PROD deploy для Ш9) вне объёма D19,
  не проверялись сверх факта «Ш9 код-комплит».
- **Чекбокс D19 в WORK_ORDER.md не проставлен** — по границам брифа это делает ведущий.
