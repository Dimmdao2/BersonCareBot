# Bugfix #54 — OAuth dup-email · web-push reminder claim · dead telegram_users JOIN

Канонический чек-лист исполнения задачи taskdb **#54**. Ведётся оркестратором (Opus). Исходный
authority-док `/home/dev/BUG_REPORT_oauth_reminders_2026-06-24.md` УТРАЧЕН (файла нет на диске 29.07) —
поэтому проблема переписана здесь заново из кода, а не процитирована. Каждый исполнитель ПЕРВЫМ делом
проверяет, воспроизводится ли баг в текущем коде: находки 24.06 могли устареть (часть, судя по коду, уже
починена — см. Stage 2).

## Проблема (что ломается сегодня и чем стоит)

✅ **СДЕЛАНО 2026-07-29:** все три подзадачи закрыты в текущем коде; для S3 source/test landed как
`b39ca2c01` + `b4cef0ad5`, а Vitest резолвит пакет из `packages/platform-merge/src`.
⚠️ **ФАКТ УСТАРЕЛ 2026-08-23:** формулировки ниже «ломается сегодня» — снимок диагностики 24.06, не
текущий incident. В частности, после #809 claim блокирует только occurrence (`FOR UPDATE OF o SKIP LOCKED`,
`940212675`), а не все relation из старого запроса.

Диагностика прода 24.06 нашла три независимых дефекта (НЕ от переезда — тот же код/данные). Задача #54
закрывает их до конца; заголовок карточки утверждает «2 из 3 закрыты», но это НЕ проверено против текущего
HEAD — проверяем построчно.

- **S1 (ВЫСОКИЙ) — OAuth-регистрация падает на дубликате email.** При уже существующем активном
  `platform_users.email` код делает INSERT нового `platform_users` вместо link-binding + login →
  нарушение уникального индекса `uq_platform_users_email_normalized_active`. Цена: пользователь с уже
  привязанным email не может войти/зарегистрироваться через OAuth — глухая 500 вместо входа. Проверить
  ОБА провайдера — Google И Яндекс (общий путь резолва).
- **S2 (ВЫСОКИЙ) — claim web-push-напоминаний.** Диагностика 24.06: `UPDATE webapp_reminder_occurrences
  ... WHERE id = ANY((...)::uuid[])` → PG 42846/22P02, due-occurrences не клеймятся, напоминания не
  уходят. Цена: молчаливая недоставка веб-пуш-напоминаний. **NB: в текущем коде
  `apps/webapp/src/infra/repos/pgWebPushOnlyReminders.ts:220` уже стоит `id IN (${drizzleSqlUuidInList(ids)})`,
  а не `ANY((...)::uuid[])` — похоже, УЖЕ ПОЧИНЕНО.** Задача исполнителя S2 — доказать это (или опровергнуть):
  найти реальный claim-путь, показать что битого каста нет ни на одном live-пути, и что есть тест на claim.
- **S3 (НИЗКИЙ) — мёртвый JOIN на `public.telegram_users`.** Таблица снесена миграцией
  `20260306_0010_detach_telegram_users_refs`. Легаси-запрос всё ещё ссылается на неё → имя в Telegram молча
  не резолвится (тихий null вместо имени). Цена: косметика/логи, не блокер. Найти живой запрос,
  перецелить на актуальный источник (external_id/row_data) или снять мёртвую ветку.

## Стадии (три независимых потока, непересекающийся file-scope)

### Stage 1 — OAuth dup-email — ✅ ALREADY-FIXED (verify-only, no change)
Воркер `bugfix54-s1-oauth` (sol/high) + независимый аудит `audit-s1s2` (terra/high) → **CONFIRMED-FIXED**.
- [x] Проверено на HEAD: баг починен ранее коммитом `c3bfabdd`. Активный-email lookup снял старый
      verified-only фильтр, совпадает со scope уникального индекса `uq_platform_users_email_normalized_active`.
- [x] При совпадении активного email — SELECT+bind+login, INSERT недостижим. Единый путь Google и Яндекс.
- [x] Регресс-тесты на дубль-email есть для обоих провайдеров (oauthWebLoginResolve.test / oauthYandexResolve.test).
- [x] Нюанс (не баг): Google не линкует по `emailVerified:false` (защита от угона) — создаёт строку с
      `email_normalized=NULL`, индекс не нарушается. Обосновано Google OIDC + Yandex ID доками.

### Stage 2 — web-push reminder claim — ✅ ALREADY-FIXED (verify-only, no change)
Воркер `bugfix54-s2-webpush` (terra/high) + независимый аудит `audit-s1s2` (terra/high) → **CONFIRMED-FIXED** (статически).
- [x] Все claim-пути найдены (webapp `pgWebPushOnlyReminders.claimDueOccurrences`; integrator reminders repo
      трогает отдельную `user_reminder_occurrences`, не эту).
- [x] Битого `ANY((...)::uuid[])` нет ни на одном live-пути claim (0 хитов `ANY((`). Claim =
      `FOR UPDATE SKIP LOCKED` + `id IN (${drizzleSqlUuidInList(ids)})` с `::uuid` на элемент.
- [x] Тест claimDueOccurrences есть (shape-тест: IN, ::uuid, отсутствие ::uuid[], locking).
- [~] Прогон тестов live не выполнен (в audit-клоне нет node_modules) — вердикт на чтении кода + shape-тест.
      Для «ничего не менялось» приемлемо; при landing прогонится в полном CI.
- [!] Смежная находка ВНЕ #54: `pgBroadcastEmailRecipients.ts:23` использует `ANY(${userIds}::uuid[])` (путь
      рассылок, не напоминаний; не обязательно битый). Владельцу: сигнал, не задача — своей работой не веду.

### Stage 3 — dead telegram_users JOIN — ✅ FIXED (landed on feat)
Воркер `bugfix54-s3-telegram` (terra) → фикс; аудит `audit-s3` (sol) → **FAIL** (протухший dist); фиксер
`worker-fixs3` → dist; ре-аудит `reaudit-s3` (terra, auditor-live) → **PASS-WITH-CAVEAT**. Каветат вскрыл,
что dist гитигнорится → коммит dist был лишним; в feat влит ТОЛЬКО src-фикс.
- [x] Два живых пути (`pgPatientTelegramUsernameMention.ts`, `messengerBindAuditEnrichment.ts`) сняты со
      снесённой `public.telegram_users` → `integrator.identities`+`telegram_state`. Src-коммит `6f234bc98`.
- [x] Имя резолвится из канонических таблиц; при отсутствии — явный `null`, без обращения к мёртвой таблице.
- [x] Тест `messengerBindAuditEnrichment.test.ts` (asserts канонический SQL, отсутствие telegram_users).
      Найдена и починена CI-хрупкость: тест импортировал пакет (dist, собирается ПОСЛЕ `test` в ci) →
      алиас vitest на src (коммит `b4cef0ad5`). Тест зелёный при заведомо старом dist.
- [x] В feat: `b39ca2c01` (src) + `b4cef0ad5` (test-alias). Осиротевший воркером коммит спасён (parallel
      `git reset` выбил его из fmtcut) через `salvage/bugfix54-s3-telegram`.
- [x] Прод-безопасность: протухший dist был только локальным артефактом этого бокса; в CI/deploy dist
      пересобирается из src (integrator build → platform-merge build). Src-фикса достаточно.

## Итог #54

⚠️ **ФАКТ УСТАРЕЛ 2026-08-23:** фраза о параллельно идущей чистке тестов и отложенном CI — историческая;
она не является текущим гейтом или разрешением повторять работу #54. Для новых изменений применяются
актуальные §9–§10 `AGENTS.md`.
Все три подбага закрыты: S1/S2 были уже починены (подтверждено независимым аудитом), S3 починен и влит.
Остаточный гейт «готово» по канону — зелёный полный CI — отложен: параллельный агент сейчас чистит тесты
(суите нестабилен не по нашей вине), а landing в прод owner-gated и полный CI гоняется на нём. Смежная
находка broadcast `ANY(::uuid[])` — владельцу как сигнал, вне скоупа.

## Как гонять тесты (владелец 29.07 + параллельный агент чистит тесты)
- Точечные `pnpm` (typecheck / lint / конкретный vitest-файл) — напрямую в СВОЁМ клоне.
- **Полный `pnpm run ci` — ТОЛЬКО через замок** `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`
  (одновременный полный прогон только один). Оркестратор гоняет полный CI один раз в конце, не воркеры.
- Параллельно идёт агент, чистящий говнотесты — не трогать общие тест-файлы вне своего file-scope.

## Приёмка (правило «готово»)
`done` = галочка этой стадии, проставленная ОРКЕСТРАТОРОМ после НЕЗАВИСИМОГО аудита каждой стадии
(отдельный агент, read-only) + зелёный полный CI через замок + честный разбор «воспроизводился/не
воспроизводился». `worker done` и `auditor PASS` — входные сигналы, не «готово».
