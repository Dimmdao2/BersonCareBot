# Регистрация клиники падает 500: `Missing declared webapp port capability: pre_session`

**Роль:** worker. **Канон:** `AGENTS.md` — сначала карта заголовков (`grep -n "^## \|^### " AGENTS.md`),
затем §5 (Clean Architecture, единый chokepoint), §6 (PostgreSQL/роли), §1 («⛔ Миграция не выдаёт и не
отзывает права», «Перед приземлением миграции — разбор её прав»), §10a/§10b, §24.2/§24.6.
Поиск — `node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`.

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт Б2 — дословная
запись требования владельца: «просто зайти на открыто, создать самостоятельно новую клинику. так как это
сделал бы, ну, реальный человек» и «Если это не работает, надо разобраться почему».

## Замер ведущего (не повторяй, начинай с него)

`POST /api/auth/specialist-signup/slug` → **200** `{"ok":true,"available":true}`.
`POST /api/auth/specialist-signup/start` → **500**, и на TEST, и на DEV. В логе
`bersoncarebot-webapp-test`: `⨯ Error: Missing declared webapp port capability: pre_session`.

Механика ошибки установлена: `apps/webapp/src/infra/db/portContextRuntime.ts:296` бросает её, когда
`capabilities['pre_session']` отсутствует. Capability с таким **именем** нет и быть не должно — в
`WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` (212 записей на DEV) capability-класса `pre_session` живут под
своими именами (`auth_login_token_create`, `email_auth_find_email_otp_lock`, …) и резолвятся веткой по
`functionIdentity`. Обобщённое имя `pre_session` запрашивается только тогда, когда под bootstrap-принципалом
идёт обращение к базе **без именованного корня в области видимости**, то есть реляционно.

Тот же класс уже описан в коде: `apps/webapp/src/app-layer/booking/createVerifiedPublicBooking.ts:158-162` —
«it reads `platform_users` relationally through `getPool()` with no principal at all, so it fails with
«Missing declared webapp port capability: pre_session» — it has been failing since the port-context cutover
on 12.08». Значит это не регрессия этой ночи, а незакрытый хвост cutover 12.08.

## Задача

1. **Найди точное место.** Пройди путь `apps/webapp/src/app/api/auth/specialist-signup/start/route.ts` и всё,
   что он зовёт (`registerPendingSpecialistVerification`, `tryResendRegistrationChallenge`,
   `startEmailChallenge`, `createSpecialistSignupIntent`, `replacePendingSpecialistSignupChallenge`,
   резервирование слага), и назови `path:line` того обращения к базе, которое идёт под bootstrap-принципалом
   мимо именованного корня. Доказательство — воспроизведение, а не рассуждение.
2. **Почини по существующей схеме, не строя вторую.** Обращение должно идти через именованный корень
   pre-session-класса, объявленный в capability-каталоге, ровно как соседние операции того же пути. Не
   заводить обобщённую capability с именем `pre_session`, не расширять `app_pre_session` «на всякий случай»,
   не оборачивать вызов новым слоем-обёрткой. Если корня для этой операции нет — заведи ОДИН, миграцией
   timestamp-forward, с владельцем-швом, `require_accepted_context(...)` первым исполняемым оператором,
   `BCB-MIGRATION-VERIFY`, без `GRANT`/`REVOKE`/`CREATE POLICY` в миграции.
3. **Права — по §1.** Разбери, какие права нужны телу, чтобы оно **исполнилось**: отдельно `SELECT … FOR
   UPDATE`/`FOR SHARE` (нужна привилегия класса UPDATE, поколоночного `SELECT` не хватает — гейт
   `deploy/postgres/privileges/row-lock-privileges.test.mjs` уже есть). Права только через декларацию и генератор.
4. **Проверь ВЕСЬ путь регистрации до конца, а не только первый отказ.** После починки `start` пройди
   `start` → чтение кода из `email_challenges` на именованной DEV → `confirm` и убедись, что клиника
   создаётся, специалист получает doctor-сессию, слаг занят. Каждый следующий отказ того же класса чини тем же
   способом; если упрёшься в развилку — стоп и вынос ведущему, а не выдумывание требования (§24.6).
5. **Тест поведения (§10a):** красный на сломанном продукте, зелёный после. Проверяется, что регистрация
   специалиста проходит под bootstrap-принципалом; тест на текст исходника или на наличие ключа в env запрещён.

## Границы

- ⛔ Deploy на TEST/PROD, остановка сервисов, `--execute`/`--apply` на базах, push, full CI — запрещены.
  Живая проверка — только на именованной DEV (`bcb_webapp_dev`), где приложение уже запущено на :5200.
- ⛔ Фикстуры, disposable-базы, новые тестовые базы, любая новая машинерия — запрещены прямым словом владельца.
- ⛔ Не трогай путь публичной записи (`createVerifiedPublicBooking`) — там тот же класс, но своя развилка
  («пишет строку О ДРУГОМ человеке от имени анонимного посетителя»); назови её в отчёте, работы из неё не заводи.
- Галочку Б2 сам не закрывай.
