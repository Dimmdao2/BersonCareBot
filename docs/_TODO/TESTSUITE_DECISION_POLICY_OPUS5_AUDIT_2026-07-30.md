# Полный аудит decision-policy — Claude Opus 5 — 2026-07-30

Источник: `/home/dev/brain/runs/agent-port/claude-auditor-adhoc-2026-07-29T22-46-49-169Z.json`

Ниже сохранён полный текст результата read-only аудита без сокращений. Канонические решения и исполняемые пункты
остаются в `TEST_SUITE_AUDIT_2026-07-29.md`; этот файл хранит доказательную базу аудита.

Независимая проверка инфраструктуры вернулась. Она подтвердила C3 и C8 живыми уликами, добавила один новый MUST FIX и **опровергла одно моё утверждение** — исправляю его первым.

---

## Поправка к моему собственному выводу

В C8 я привёл `apps/webapp/vitest.config.ts:34` (`scripts/check-s4-entitlement-coverage.test.ts`) как живой пример «механический гейт живёт как тест». **Это неверно:** файла больше нет, остался только `apps/webapp/scripts/check-s4-entitlement-coverage.ts`, а строка в конфиге — висячий include. Класс «механический гейт» в схеме нужен по-прежнему (аргументы C8-B и C8-C стоят), но живого примера внутри vitest **нет ни одного**. Действующий пример этого класса — негативный самотест gitleaks в `.github/workflows/security.yml:109-113`: гейт намеренно ломают и требуют, чтобы он заметил. Его и надо указывать в каноне вместо удалённого `pagePrincipalCensus`.

---

## C3 — больше не гипотеза: конфиг раннера уже врёт, и один job CI прогоняет ноль файлов

Всё, что я описывал как риск, уже произошло:

- `apps/webapp/vitest.config.ts:33,46` указывают на `e2e/`, которого **больше нет** → проект `inprocess` матчит **ноль файлов**, а job `ci.yml:83` (под условием `ci.yml:66`, только push в `main`) зелёный, прогоняя ничто.
- `apps/webapp/vitest.config.ts:34` — висячий include (см. поправку выше).
- `apps/webapp/package.json:22` (`test:with-db`) перечисляет три-четыре удалённых файла и упадёт при вызове.
- `*.postgres.integration.test.ts` действительно попадает в проект `fast` (`vitest.config.ts:31`) → в PR-шарды `ci.yml:58`, где **нет сервиса Postgres и не выставлен `USE_REAL_DATABASE`**, а `vitest.setup.ts:35-37` обнуляет `DATABASE_URL`.
- `*.ui.test.tsx` матчится (`vitest.config.ts:32`), но оба проекта — `environment: 'node'` (`:29`, `:45`); нужен per-file `/** @vitest-environment jsdom */`, и ни одного живого носителя этой конвенции в репозитории не осталось.

**Вывод для правила не меняется, а становится обязательнее:** категория доступна автору только после доказанного отбора раннером. Плюс к моей формулировке добавить: **висячий include — это красный гейт, а не мелочь**; правило должно требовать, чтобы `include` конфигурации не ссылался на несуществующие пути (проверяется одной командой, класс — механический гейт с самотестом).

---

## C9 — усилен: класс конкурентности в репозитории есть, но целиком тёмный в CI

Я писал, что конкурентности нет в MUST TEST. Факт хуже и точнее: настоящие двухсоединённые race-тесты **существуют** — `pgEmailChallengeAtomicAttempts.devDb.integration.test.ts:80,133`, `pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts:78,131`, `pgOtpDecayingLockoutAtomicEscalation.devDb.integration.test.ts:103,151,165`, `pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts:99,141` (явный `SELECT … FOR UPDATE`), `pgBookingScheduling.readChokepoint.devDb.integration.test.ts:109-114`. Все — за `skipIf` (92 вхождения `skipIf`/`USE_REAL_DATABASE`/`RUN_*_DEV_DB` в 26 из 33 файлов), а CI ни одну переменную не ставит и Postgres не поднимает. То есть **самое ценное, что уцелело, в merge-гейте не исполняется ни одним утверждением.**

Это делает C1 и C3 не «предупреждением на будущее», а описанием текущего состояния: агент, которому велено «изоляция клиник», сегодня физически не имеет исполняемой в CI среды для этого класса.

---

## C11 — НОВЫЙ MUST FIX: «уже энфорсится другим механизмом» легализует дыру, если механизм не в гейте

Я сам предложил добавить в DO NOT TEST причину «инвариант уже энфорсится не-тестовым механизмом». Проверка показала, что в этом репозитории **большая часть таких механизмов не запускается**, и без оговорки моя же поправка стала бы самой опасной строкой правила.

**Сценарий.** Агент хочет проверить, что новый ключ настроек отвергается, если он не в `ALLOWED_KEYS`. Находит энфорсмент (`apps/webapp/src/modules/system-settings/service.ts:168`, `[redacted-token].ts:56`) и скрипт `check:saas-s5-2-settings-security` (`package.json:40`). По правилу — теста не пишет. Скрипт при этом недостижим ни из `pnpm lint`, ни из `pnpm run audit` (`package.json:72`), то есть в CI не запускается никогда. Инвариант не охраняется вообще, но формально «покрыт механизмом».

Тот же класс:
- `check:saas-a0-greenfield-baseline` (`package.json:35`) — **отсутствует** в `.github/workflows/ci.yml` (полный набор гейтов: `:19`, `:28`, `:37`, `:58`, `:83`, `:94`, `:110`, `:119`, `:129`, `:139`), хотя `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md:30,34,42` называет его гейтом;
- `check:new-table-rls-coverage` (`package.json:43`) — не в CI;
- скрипты гонок `apps/webapp/scripts/check-c5a-courses-quota-race.mjs`, `check-cms-pages-quota-race.mjs`, `check-b1-payment-capture-replay.mjs`, `scripts/verify-b3-booking-concurrency.mjs:253` — сироты без вызывающего; `check-c4a-843-clinic-invite-concurrency.mjs` имеет алиас (`apps/webapp/package.json:12`), но не в CI;
- `.github/workflows/zap.yml:42,123` — отключён по умолчанию, `TODO(owner)` на `:78,109`;
- `packages/db-principal/test/*.test.mjs` — есть скрипт (`packages/db-principal/package.json:18`), но корневой `test` гонит только integrator, `pnpm -r run test` отсутствует → не исполняются.

**Fix.** Причина «энфорсится другим механизмом» действительна только при **доказанном подключении механизма к гейту, который реально запускается**: назвать файл workflow и строку. Не назвал — причина недействительна, инвариант возвращается в MUST TEST. И симметрично: скрипт-сирота не является покрытием, ссылаться на него как на основание не тестировать запрещено.

**Что при этом действительно энфорсится и остаётся законным DO NOT TEST:** append-only и целостность журнала миграций — `apps/webapp/scripts/check-legacy-migrations-frozen.sh:19` и `check-drizzle-journal-sync.sh:27,32,36,43,56`, подключены через `apps/webapp/package.json:11` → корневой `package.json:29` → `ci.yml:19`. Это уточняет мой C8: **append-only миграций закрыт, дрейф baseline — нет.** Также законны chokepoint-правила (`apps/webapp/eslint.config.mjs:51,58,68` + `scripts/check-db-chokepoint.mjs` через `ci.yml:19`), деплой-ассерты (`deploy/host/deploy-test-saas.sh:1346-1357`), A1 (`ci.yml:129`), `smoke:u6b` (`ci.yml:139`) и security-сканы (`security.yml:52,126-140,156-166,176`).

---

## C8 — расширенное подтверждение: jobs/queues/cron — не пробел в правиле, а полный вакуум

- `[redacted-token]/*` и `runtime/scheduler/*` — **ни одного теста**; во всём `apps/integrator` остался 1 тест-файл, т.е. `ci.yml:37 pnpm test` — суита из одного файла.
- `apps/media-worker` — **ноль тестов**; `test:media-worker` (`package.json:27`) вообще не упомянут в `ci.yml`.
- Observability: единственный audit-log тест `apps/webapp/src/infra/adminAuditLog.devDb.integration.test.ts:19-24` — тёмный; `errorTracking.ts`, `httpCorrelation.ts` — без тестов.
- Security guards: в `apps/webapp/src/app-layer/guards/` **ни одного** `*.test.ts` — включая `requireEntitlement.ts`, чьи семь названных выживших мутантов и есть причина перестройки.
- Config/env: `apps/webapp/src/config/env.ts:27,212,286`, `apps/media-worker/src/env.ts:19-21`, `apps/integrator/src/config/loadEnv.ts` — схемы есть, тестов нет.

Строки таблицы D по этим поверхностям остаются как были, но перестают быть «на будущее»: это очередь с нулём.

---

## Новое по legacy: «членство в keep-set» не является гарантией соответствия

`docs/_TODO/testsuite-rewrite-list.md` существует (78 строк), правило port-then-retire на `:3-6`, §A на `:8` перечисляет **31** файл. Фактов три, и все меняют формулировку legacy-пункта схемы:

1. Живых тест-файлов под `apps/` — **33**, а не 31: §A не включает `sessionCookie.unit.test.ts` и `testing.unit.test.ts` (единственные два уже соответствующих канону имён).
2. §C (`:47-51`) предписывает переписать `pgBroadcastEmailRecipients.test.ts` — **этого файла в дереве нет**, то есть §C фактически «написать с нуля», а не «переписать».
3. Внутри keep-set сохранился текстовый пиннинг: `[redacted-token].pg.test.ts:71` — `expect(selectSql).toContain('FOR UPDATE SKIP LOCKED')`. Это ровно приговорённый владельцем класс, уцелевший по членству в списке.

**Fix к legacy-пункту:** вход в legacy даёт план, но **членство в keep-set не освобождает от фильтра формы** — файл из keep-set проходит те же ворота (названная поломка, независимый oracle, наблюдаемая граница), и текстовые утверждения внутри keep-set снимаются, а не наследуются. Отдельно: §D (`:53-71`) — четыре сайта соседских фиксов с названными коммитами (`14c4e8a69`, `48d34aa79`, `163851aec`, `474686b6a`) — это законный и **независимый** oracle для C7: источник ожидания там зафиксированный дефект и старый сломанный код, а не текущая реализация.

---

## Добавления к D, F, G

**D — новые/уточнённые строки**

| Поверхность | Вердикт | Уточнение |
|---|---|---|
| Обработчики worker/scheduler/queue (integrator, media-worker) | **MUST TEST**, очередь пуста с нуля | среда: unit + Postgres для эффектов |
| Валидация env/config-схем и отказ на небезопасном секрете | **MUST TEST** | unit; oracle — `env.ts:286` правило |
| `ALLOWED_KEYS`-энфорсмент на записи настроек | **MUST TEST**, пока `check:saas-s5-2-settings-security` не в CI | unit/route |
| Append-only и журнал миграций | **DO NOT TEST** — энфорсится `ci.yml:19` | назвать строку гейта |
| Дрейф `a0-greenfield` baseline | **OWNER QUESTION** — гейт есть, в CI не подключён | — |
| Инвариант, «покрытый» скриптом-сиротой или отключённым workflow | **MUST TEST** (причина DO-NOT недействительна) | — |
| Висячий `include` в конфиге раннера | **механический гейт** | самотест обязателен |
| Текстовое утверждение внутри keep-set-файла | **DO NOT TEST** — снять, членство не оправдывает | — |

**F — добавить один запрет:** не ссылаться на скрипт, алиас в `package.json` или отключённый workflow как на действующий гейт. Основание не тестировать — только строка запускаемого workflow.

**G — новые улики:** `apps/webapp/vitest.config.ts:31-34,45-47`; `apps/webapp/vitest.setup.ts:35-37`; `.github/workflows/ci.yml:19,28,37,58,66,83,94,110,119,129,139`; `.github/workflows/security.yml:109-113` (образец самотеста), `zap.yml:42,78,109,123`; `apps/webapp/package.json:11,12,18,19,22`; `package.json:29,35,40,43,72`; `apps/webapp/scripts/check-legacy-migrations-frozen.sh:19`; `apps/webapp/scripts/check-drizzle-journal-sync.sh:27,32,36,43,56`; `apps/webapp/src/modules/system-settings/service.ts:168`, `.../api/doctor/settings/route.ts:56`, `registry.ts:508`; `apps/webapp/src/config/env.ts:27,212,286`; `docs/_TODO/testsuite-rewrite-list.md:3-6,8,47-51,53-71,76-77`; `[redacted-token].pg.test.ts:71`; race-тесты — `pgEmailChallengeAtomicAttempts…:80,133`, `pgPhoneChallengeAtomicAttempts…:78,131`, `pgOtpDecayingLockoutAtomicEscalation…:103,151,165`, `pgEmailOtpPublicAtomicConsume…:99,141`, `pgBookingScheduling.readChokepoint…:109-114`; `apps/webapp/src/infra/adminAuditLog.devDb.integration.test.ts:19-24`; `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md:30,34,42`.

---

## Итог по вердикту

**PASS WITH MUST FIX сохраняется, MUST FIX теперь одиннадцать** (добавлен C11, поправлена улика внутри C8, C3 и C9 подтверждены живыми фактами вместо гипотез). Ядро схемы по-прежнему верно и владельцем уже частично утверждено; опасность концентрируется не в списках «что тестировать», а в трёх местах, где правило молчит: среда, реально работающий гейт и раннер.

**Дополнительные OWNER QUESTION (в работу не заводил):** проект `inprocess` и job `ci.yml:83` матчат ноль файлов; `test:with-db` и два `include` ссылаются на удалённые пути; `check:saas-a0-greenfield-baseline`, `check:saas-s5-2-settings-security`, `check:new-table-rls-coverage`, `test:media-worker` и `packages/db-principal` тесты не подключены к CI; пять скриптов гонок — сироты; `zap.yml` отключён; в keep-set остался текстовый пиннинг `pgWebPushOnlyReminders.pg.test.ts:71`; §A rewrite-list расходится с деревом (31 против 33), §C ссылается на удалённый файл.

