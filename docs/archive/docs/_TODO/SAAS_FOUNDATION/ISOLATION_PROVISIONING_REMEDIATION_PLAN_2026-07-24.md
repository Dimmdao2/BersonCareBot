# Isolation / provisioning remediation plan — 2026-07-24

> **Назначение:** единый план доработки по классу «строгие слои (FORCE-RLS / role-split / app_owner / FATAL-ассерты)
> включили раньше, чем сделали совместимыми краевые пути → серия одинаковых аварий (permission denied / silent-empty)».
> Собран из: independent design-audit (drop-FORCE опровергнут, выбран шов `app_owner`), живого разбора инцидентов
> (email-login, provisioning), и карточки «Изоляция клиник» в системе здоровья. **Не менять модель** — модель верна;
> чиним дисциплину выката + полноту грантов + гейт + катовер.
>
> **Правила ведения (канон `docs/ORCHESTRATION_BINDINGS.md`):** этот файл — ЕДИНСТВЕННЫЙ источник «готово». Каждый
> пункт `- [ ]/[x]` + способ проверки + доказательство (code `path:line` | test | runtime-лог | SHA). «Готово» =
> галочка + зелёный full CI + живая проверка. «Audit/зелёный тест PASS» сам по себе — НЕ «готово».
> **Провенанс:** линкуется из `docs/CURRENT_AUTHORITY_MAP.md`; смежное — `SAAS_PROD_DEPLOY_PROCESS.md`,
> `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md`, аудит-мемори
> `force-rls-backstops-definer-seam-route-provisioning-through-app-owner`.

## Легенда статусов

`⬜ не начато` · `🟡 реализовано, НЕ верифицировано независимо` · `🔵 верифицировано, НЕ задеплоено/не принято` ·
`✅ галочка+CI+живая проверка+приёмка владельца`. Слово «готово» — только на ✅.

---

## A. Провижининг новой клиники (корневой баг)

Цель: регистрация специалиста/клиники доходит до создания организации под strict FORCE-RLS, без 42501 и без
silent-empty; изоляция не ослаблена.

- [🔵] **A1. `provision_specialist_owner` + `current_provisioned_owner_organization` → владелец `app_owner`** (шов
  NOLOGIN+BYPASSRLS, не request-reachable, актор — из подписанного принципала). **Верификатор: PASS** — цепочка
  grant-complete под FORCE, реассайн 2-й функции чинит silent-empty, регрессий нет (единственный вызов —
  `start_provisioned_organization_trial`). · Доказательство: SHA `88ca5b7cf`,`8072dc899`; overlay `deploy/postgres/specialist-owner-provisioning-rls.sql`. · Ждёт деплоя+живой регистрации (A4).
- [🔵] **A2. Табличные гранты `app_owner` под цепочку** (BYPASSRLS ≠ обход GRANT): INSERT `be_organizations`,
  SELECT+UPDATE `specialist_signup_intents`, EXECUTE `require_staff_security_self_user_id()`. **Верификатор: PASS —
  минимальны** (без избыточных; app_owner уже держал platform_users SELECT+UPDATE, be_organizations SELECT,
  be_organization_members SELECT+INSERT); никому не выдан BYPASSRLS. · Инфо-край: `platform_users` UPDATE +
  `be_organization_members` INSERT нигде не запинены → см. D3. · Доказательство: overlay-diff + live `has_table_privilege`.
- [🔵] **A3. Логаут на онбординге «Первый запуск»** (застрявший спец без org не мог выйти). **Верификатор: PASS** —
  `StaffSecuritySection.tsx:140-149` рендерит `form action=/api/auth/logout` в `!recoveryOnly`-блоке, не загейчен
  org/binding; на recovery-only отсутствует. · Ждёт живого клика на TEST после деплоя.
- [⬜] **A4. Деплой A1–A3 на TEST + живая регистрация новой клиники доходит до кабинета.** · Проверка: runtime —
  регистрация с чистого email создаёт org, `Кабинет создан ✓`; застрявший intent оживает. · Мой шаг после ✅ верификации.

## B. Полнота грантов класса «функция на `app_owner` без табличного GRANT» (сквозной)

Цель: ни одна `app_owner`-owned SECURITY DEFINER функция не падает на 42501 в рантайме; все гранты — в оверлеях
(не живые заплатки), иначе катовер их не понесёт.

- [🟡] **B1. `email_challenges` → app_owner: GRANT SELECT,UPDATE,DELETE.** Живой хотфикс применён владельцем
  (вход по коду заработал), runtime-лог 42501 устранён. · Доказательство: webapp-лог 20:04 (permission denied for
  email_challenges) → после гранта вход ок. · **Дыра: грант ЖИВОЙ, не в оверлее** → см. B2.
- [⬜] **B2. Вписать B1 в канонический оверлей** (`runtime-overlay-app-owner-handoff.sql` / d3-4) + assert. · Проверка:
  `grep` оверлея; свежий disposable-деплой даёт вход по коду зелёным. · Доказательство: overlay-diff + smoke.
- [🟡] **B3. Свип ВСЕХ `app_owner`-owned secdef функций (48 шт) — выполнен верификатором.** Найдена **одна реальная
  спящая мина того же класса:** `app.enforce_courses_snapshot_quota()` (AFTER-INSERT триггер `courses_snapshot_quota_guard`
  на `public.courses`) делает `SELECT count(*) FROM public.courses`, а у `app_owner` нет SELECT на `courses` → 42501
  сломает создание курса, как только тариф/оверрайд задаст числовую квоту `courses`. Сейчас **DORMANT** (нет числовой
  квоты, 0 строк), pre-existing (не из этих коммитов). Остальные 46 — покрыты; 1 false-positive (`operator_incidents`
  column-level UPDATE — ок). · Закрытие: `GRANT SELECT ON public.courses TO app_owner` в оверлей (воркер) → см. D3-пин.
  · Доказательство: отчёт верификатора item 8 + `has_table_privilege`.

## C. Гейт / почему CI не ловил

Цель: этот класс ловится в CI/деплой-гейте, а не владельцем живьём.

- [🟡] **C1. e2e-smoke регистрации новой клиники подключён в деплой-гейт** (`deploy-test-saas.sh`, fail-closed). · Проверка:
  `bash -n` + прогон smoke. · Доказательство: `88ca5b7cf`. · Оговорка: воркер оставил smoke **статическим** для FORCE-стены (рантайм-модель откатил) — см. C2.
- [⬜] **C2. Гейт должен RUNTIME-ловить регресс класса, не только исходник.** Решить: (а) достроить smoke на приватном
  кластере с реальной FORCE-моделью, ИЛИ (б) отдельный CI-job с `services: postgres` (сейчас **ни один workflow не
  поднимает БД** — `ci.yml`: только lint/typecheck/mock-тесты/build/статик-conformance). · Проверка: намеренно ломаем грант →
  гейт краснеет. · Доказательство: workflow-diff + провал-по-построению. · **Owner-gate:** объём (см. развилки).
- [🔵] **C3. Диагноз «почему CI слеп» зафиксирован.** `ci.yml` без `services: postgres`; route-тесты мокают
  provisioning; strict-RLS smoke живут только на хосте. · Доказательство: `ci.yml`, `specialist-signup/confirm/route.test.ts` (мок).

## D. Дисциплина выката (операционная хрупкость)

Цель: недостающий грант роняет РЕПЕТИЦИЮ, а не прод; ассерт не оставляет систему полу-настроенной.

- [🔵] **D1. Pinning-ассерт шва** `assert_specialist_owner_provisioning_seam_pinned` (app_owner NOLOGIN+BYPASSRLS,
  0 SET ROLE членов, владеет только своими; be_organizations FORCE без широкой INSERT-политики). **Верификатор: PASS —
  fail-closed** на LOGIN / лишнем члене / смене владельца / потере FORCE / широкой INSERT-политике. · Доказательство: `deploy-test-saas.sh` (коммит воркера).
- [🟡] **D3. Grant-completeness ассерт `assert_app_owner_secdef_table_grants_complete`** (крон-фикс гейта: верификатор
  показал, что scratch-smoke МАСКИРУЕТ missing-grant регресс — app_owner владеет scratch-таблицами + superuser-fallback
  обходит RLS, — а pin-ассерт прав на таблицы НЕ проверяет; поэтому баг класса email_challenges прошёл бы и smoke, и pin).
  Ассерт: `has_table_privilege('app_owner',…)` по всему требуемому набору + инфо-гранты (platform_users UPDATE,
  be_organization_members INSERT) + **анти-дрифт**: пин COUNT app_owner-secdef функций → новая функция без ревью грантов
  роняет деплой. · Проверка: намеренно снять грант → ассерт краснеет; `bash -n`. · Доказательство: closure-diff + прогон. · Воркер строит.
- [⬜] **D2. Ассерты прав — ПРЕФЛАЙТОМ до мутаций** (инцидент 24.07: лишний грант → FATAL посреди closure → TEST лёг;
  сегодняшний одночасовой всплеск role*pool_mismatch — тот же класс на операционных сервисах). Ограниченно: перенести
  критичные assert*\* в preflight/сделать closure идемпотентно-resumable. Полный рефактор движка — отдельным пунктом. · Проверка:
  инъекция битого гранта падает ДО изменений, сервисы живы. · Доказательство: closure-diff + прогон.

## E. Система здоровья — карточка «Изоляция клиник» (critical)

Разбор: `role_pool_mismatch`=42501=**fail-closed отказ, НЕ утечка** (событий `rls_denial`=0). Всплеск — одночасовой
13–14:00 MSK 24.07 на операционных сервисах = транзиент моего деплоя/closure; webapp 20:00 = баг email-login (закрыт).

- [⬜] **E1. Перезапустить coverage-пробник** (последний прогон 19.07 → `coverage_stale`) + поставить в расписание/гейт. ·
  Проверка: `saas_isolation_coverage_runs` свежий, `coverageFresh=true`, карточка уходит из critical по этой причине. · Доказательство: runtime-строка + cron/gate.
- [⬜] **E2. Разметить транзиент-события** (deploy-window role_pool_mismatch) как explained/resolved в админке; проверить,
  что после сегодняшних фиксов НЕ появляются новые. · Проверка: `saas_isolation_events` — 0 новых active unexplained за 24ч после деплоя. · Доказательство: runtime-выборка.
- [⬜] **E3. Триаж `missing_principal` (webapp, 1–3/час)** — непринципалённый bootstrap-путь под strict FORCE (класс #815):
  подтвердить, что это ожидаемые bootstrap-чтения, покрыть/объяснить. · Проверка: сопоставить операции с bootstrap-роутами. · Доказательство: код-роут + событие.

## G. DEV diagnostics contour (System Health / isolation telemetry)

Цель: на локальной `bcb_webapp_dev` curated System Health и `saasIsolation` не ложатся из-за отсутствия operator
login/overlays и не смешивают grant-дыры с product isolation.

- [x] **G1. Канонический DEV provisioning operator + overlays + migration 0371.** `render-saas-isolation-operator-
  provisioning.mjs` принимает `bcb_webapp_dev`; `deploy/host/provision-dev-saas-diagnostics.sh`; миграция
  `0371_phone_bind_billing_accounts_isolation_fix_local.sql`; канон в `LOCAL_DEV_AND_AGENT_TESTING.md` §6.6.
  Доказательство: plan `dev_diagnostics_contour_fix_3f919f34` (все todos completed); product fix `549058465`
  (role_pool_mismatch на phone-bind/billing overview); acceptance — curated SELECT от operator, unexplained=0
  после coverage CLI.

## F. Прод-катовер (чтобы всё это исполнилось на большом переезде)

Цель: split-роли + ВСЕ гранты + оверлеи применяются детерминированно, репетируются на копии прода ДО живого.

- [⬜] **F1. Каждый грант из A/B/D — в оверлее** (ноль живых заплаток), чтобы SaaS-closure нёс их. · Проверка: `grep` оверлеев + disposable-деплой зелёный. · Доказательство: overlay-diff.
- [⬜] **F2. `deploy-prod-saas.sh` (#994) — прод-аналог closure** ИЛИ задокументированный ручной прогон оверлеев по
  `SAAS_PROD_DEPLOY_PROCESS.md §3` (deploy-prod.sh остаётся code-only, гранты не раздаёт). · Проверка: репетиция на
  disposable prod-copy = зелёные assert+smoke. · Доказательство: скрипт/доки + прогон.
- [⬜] **F3. Репетиция полного катовера на одноразовой копии прод-дампа** (dump→migrate→backfills→roles/grants→finalizer→smoke)
  — недостающий грант обязан всплыть ТУТ. · Проверка: зелёная репетиция. · Доказательство: прогон-лог.

---

## НЕ СДЕЛАНО (честно, на 2026-07-24)

Всё, кроме диагностики/аудита (C3) и живого хотфикса email-login (B1), — 🟡/🔵/⬜. Независимой верификации A/D1 ещё
НЕ было (агент идёт). Деплой на TEST не делался. B3 дополняется свипом верификатора.

## Развилки владельцу (одним листом, чтобы не дёргать по одной)

1. **C2 — глубина гейта:** (реком.) достроить приватный-кластер smoke с FORCE-моделью на этот класс; safe-default —
   оставить статик-guard + полагаться на живую репетицию F3. Полноценный `services: postgres` CI-job — дороже, отдельно.
2. **D2 — рефактор порядка ассертов:** (реком.) сейчас ограниченно (критичные — в preflight); полный validate-before-mutate
   движка — отдельным этапом после выкатки A, чтобы не дестабилизировать деплой.
3. **F2 — скрипт vs инструкция:** (реком. по прагматике владельца) если авто-скрипт хрупок — задокументировать ручной
   прогон оверлеев; иначе `deploy-prod-saas.sh`.
