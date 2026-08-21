# D15b/6 — repair pre-session phone-login lookup after canonical-contact cutover

## Источник оракула

> `docs/OWNER_DECISIONS.md`, Track D, 21.08.2026: «`public.user_contacts` — единственный источник phone/e-mail. Не переносить дубли: проверить полноту, перевести все чтения/записи на `public.user_contacts` через DB-порты и удалить дублирующие contact-колонки из `platform_users`.»

> `AGENTS.md` §5 «Доступ к базе — оба приложения, без исключений»: «К базе — только через порт своего приложения на drizzle: у интегратора `apps/integrator/src/infra/db/**`, у вебаппа `infra/repos/*` плюс порты модулей; из доменного, сценарного и роут-кода к базе не ходят. Сырой SQL (`pool.query(...)`, `db.query(...)`, `txDb.query(...)` с текстом запроса) для нового кода запрещён».

> `AGENTS.md` §5 «Один общий проход»: «Варианты одного действия — параметры одной точки, а не отдельные функции».

## Фактический дефект

После D15b/6 на живом TEST email/password login работает, а `POST /api/auth/phone/start` для существующего владельца отвечает 500. Санитизированный journal:

`Missing declared webapp port capability: pre_session`

Стек приходит из `deps.userByPhone.findByPhone(normalized)` в `apps/webapp/src/app/api/auth/phone/start/route.ts`. `pgUserByPhone.findByPhone` после canonical lookup собирает session identity через relation reads, но bootstrap principal не имеет безымянной relation-capability. Это реальная регрессия D15b/6: вход по подтверждённому телефону не начинается.

## Задача

1. Перед правками прочитать `AGENTS.md` по маршруту, §1 migrations/DEV safety, §5, §10/10a/10b, §24; затем проверить более поздние owner-решения D15b/6 и D15b/7 в `docs/OWNER_DECISIONS.md`, `WORK_ORDER.md` и `TRACK_D_ORCHESTRATION_HANDOFF_2026-08-21.md`. Если новое решение меняет brief — следовать ему и явно записать расхождение в отчёте.
2. Точно трассировать весь pre-session phone-start read path: phone→canonical identity, SessionUser shape, channel preference/trust reads. Не чинить только первую строку, если следующий законный вызов в том же endpoint упадёт по той же границе.
3. Починить минимально и целостно через существующий DB-port/port-context seam. Сначала ответить в отчёте: можно ли расширить/параметризовать существующую named-root точку вместо новой функции/обёртки/гейта. Не заводить второй identity store, HTTP hop, legacy-column fallback, broad relation grants или безымянную `pre_session` capability.
4. Если требуются новые/изменённые SECURITY DEFINER roots: только Drizzle migration для тела функции и только `deploy/postgres/privileges/declaration.ts` + generator для rights/context; никаких `GRANT`/`REVOKE`/`CREATE ROLE`/`CREATE POLICY` в migration. Generated DEV/TEST artifacts обновить штатным генератором. Не переписывать landed migration.
5. Тесты — только поведение. Обязательное доказательство: phone-start существующего canonical-contact пользователя проходит lookup и доходит до нейтрального delivery/channel результата без 500; отсутствующий номер сохраняет нейтральность и не раскрывает existence; capability exact function/purpose/typed args fail-closed. Не добавлять source-text/count/AST/SQL-string gates и не сторожить цифры.
6. Запустить только targeted/phase проверки по §10 и `git diff --check`. Full CI, deploy, push не запускать.
7. Если есть migration-кандидат, живую миграцию не применять. Подготовить точные команды для отдельного lead pre-landing rollback-only прогона на named DEV; никаких disposable DB, fixtures, test users, dump restore или historical replay.
8. Закоммитить все task-related изменения явными путями в `wt/d15b6-pre-session-phone-lookup-20260821`; не пушить. В финале дать SHA, список файлов, команды и результаты, плюс перечень live/rollback-only gates для независимого аудитора.

## Запреты и scope

- Не трогать PROD, TEST, общие dev-порты, systemd, deploy, cron, taskdb, Track D галочки и audit queue.
- Не создавать и не менять fixtures, seed/test accounts или одноразовые базы.
- Не начинать D15b/7a actor/subject split: он идёт после фактического TEST-закрытия D15b/6. Эта ветка только восстанавливает уже обязательный phone-login путь D15b/6.
- Не возвращать удалённые `platform_users.phone/email` и другие legacy contact mirrors.
- Не завершать ход с незакоммиченным деревом и не оставлять foreground проверки недожданными.
