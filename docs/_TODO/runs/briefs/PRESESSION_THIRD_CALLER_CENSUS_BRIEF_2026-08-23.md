# Вход по телефону всё ещё 500: третий по счёту реляционный читатель под pre-session

Два круга правок закрыли две двери, и оба раза следующий вызывающий обнаруживался ЖИВЫМ прогоном.
Третий круг обязан закончиться не заплаткой, а **переписью**: сколько ещё таких мест на путях входа.

**Источник оракула:** `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md` — «Войти по номеру телефона»

Канон — `AGENTS.md` (`grep -n "^## \|^### " AGENTS.md`), §1, §5, §10a.

## Измерено на живом TEST 23.08 ПОСЛЕ выкатки `b1bcc7684`

Человек жмёт «Войти по номеру телефона», вводит номер → экран «Не удалось запросить код»,
`500 /api/auth/phone/start`. В журнале вебаппа:

```
⨯ Error: Failed query: SELECT confirming_channel FROM user_phone_history
  [cause]: Error: Missing declared webapp port capability: pre_session
```

Место: `apps/webapp/src/infra/repos/pgChannelPreferences.ts:236` — `getDefaultAuthOtpChannel` делает
**три** сырых реляционных чтения через `runWebappPgText` (`user_phone_history`, затем
`user_channel_bindings` ∪ `user_contacts`). Под pre-session-принципалом реляционной способности нет,
поэтому падает первое же.

## Что сделать

1. **Сначала перепись, потом правка.** Пройди пути входа (маршруты `apps/webapp/src/app/api/auth/**`
   и всё, что они зовут транзитивно) и выпиши ВСЕ места, которые под pre-session-принципалом делают
   реляционное чтение или запись вместо именованного корня. Таблица: файл:строка, отношение, из какого
   маршрута достижимо. Метод переписи назови явно, чтобы я его повторил. Это главный результат круга —
   даже если мест окажется больше, чем ты успеешь починить.
2. Почини найденное **именованными корнями**, по образцу уже сделанных
   `app.pre_session_load_email_auth_state(text)` и `app_ext.read_preferred_auth_channel_code(uuid)`
   (см. `runs/integrator-cleanup/PRESESSION_LOGIN_DOORS_2026-08-23.md`).
   - Гейт — ПЕРВЫЙ оператор после `BEGIN`, до него ни одного `DECLARE`-инициализатора.
   - Если у корня два принципала (pre-session и пациент/персонал) — **две двери, один внутренний
     помощник**, как уже сделано у канала предпочтения. Не делай одну дверь на двух принципалов.
   - Пометку `crossesTenantWall` на эти двери НЕ ставить: у них арендного вызывающего нет, и проверка
     `definer-tenant-predicate` это ловит (уже наступали 23.08).
3. Права — только через `declaration.ts` + генерация (`--all`, `--all --port-context-only`,
   `--all --check` побайтово). В миграции нет `GRANT`/`REVOKE`/`CREATE POLICY`/`CREATE ROLE`.
4. `bash deploy/host/migrate-dev.sh --preflight`. `--execute` НЕ запускать.

## Доказательство

- Поведенческий тест: каждая новая дверь вызывается под своим принципалом (проходит) и под чужим
  (отказывает `42501`). Fault injection на каждый независимый класс, с показанным красным и зелёным.
- Отдельно: весь путь `POST /api/auth/phone/start` доходит до постановки кода, а не только один вызов.
- `typecheck`, `lint`, затронутые тесты — зелёные. `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs` тоже.

## Границы

`--execute`, TEST, PROD, push — запрещены. Галочки в планах не ставить.
Отчёт: `docs/_TODO/runs/integrator-cleanup/PRESESSION_THIRD_CALLER_CENSUS_2026-08-23.md`.
