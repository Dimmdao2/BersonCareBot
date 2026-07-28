# ЗАДАЧА для Sol (Codex) — многотенантность: ОБЕ стены (клиника + пациент), запертые метки

> ⚠️ **НЕ АКТУАЛЬНО (2026-07-12).** «Фаза 4 — Выкат» и «Prod cutover» в этом файле построены на пути,
> отменённом owner-пивотом 2026-07-15: «The old `bersoncare` production is LEGACY and frozen. There will be
> NO prod cutover — ever» (`SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md`). Актуально:
> [`OWNER_RULINGS_2026-07-15.md`](OWNER_RULINGS_2026-07-15.md), [`SEQUENCE.md`](SEQUENCE.md),
> [`SAAS_ENFORCE_ROADMAP.md`](SAAS_ENFORCE_ROADMAP.md) (TEST-only enforcement, no prod flip).

Репозиторий `/home/dev/dev-projects/BersonCareBot`, ветка `auto/code-pg-delta`. ИСПОЛНИТЕЛЬСКАЯ задача:
код + валидация на **одноразовой копии прод-базы**, НЕ трогать prod/test, не пушить, не коммитить в main.
**Сначала Фаза 0 (дизайн-лок) → вернуть точную оценку/файлы ДО кодинга Фаз 1+.** Поиск: `node
/home/dev/brain/tools/code-search.mjs "<q>" --repo bcb -k 8`. Контекст: `taskdb get 667`, `get 670`.
Оркестрационный чек-лист Фазы 0: `PHASE0_MULTITENANT_DESIGN_LOCK.md`.

Решение владельца 2026-07-12: на старте остаются один доктор и один админ как **разные**
`platform_users`; не сводить `admin = doctor`. Трек `#670` (раздельные auth/UI/OTP и отказ от mini-apps)
не блокирует эту задачу изоляции.

## Цель (требование владельца — дословно)

2-й/3-й/4-й **независимый специалист сам регистрируется как отдельный тенант (организацию)**, входит.
Пациент в своей сессии: видит **только свою** историю и **только той клиники**, в чей кабинет вошёл
(несколько клиник = несколько изолированных кабинетов у одного пациента; выбор клиники = метка сессии,
поддомен/адресация — деталь UI). Пациент **не видит** ни другие клиники, ни других пациентов; клиника не
видит другую клинику. **Обе изоляции должна держать САМА БАЗА, а не только код приложения.** Не сломать №1.

## Архитектура (реализуй): ОБЕ стены на GUC-метках, метки ЗАПЕРТЫ

Изоляция строится на двух RLS-стенах + едином центральном чокпойнте, который ставит метки из проверенной
сессии:

- **ORG-стена (клиника↔клиника):** миграции 0160-0168, предикат по `app.org`. Уже есть, дормантна.
- **PATIENT-стена (пациент↔пациент внутри клиники):** миграции 0169-0175, предикат
  `app.is_staff() OR patient-owns-row`. Ветка уже выбрала `app.is_staff()` как DB-role-membership helper,
  а не settable GUC; НЕ возвращать staff-bypass в `app.actor`/`app.is_staff` GUC. Для patient/integrator
  identity нужны запертые метки (`app.patient_user_id`, `app.integrator_user_id`) и **dormant-симметрия**
  (третья ветка «нет staff-контекста И нет patient-GUC → permit»), чтобы применялась, но спала до флипа.
- **КРИТИЧНО — запереть метки:** `app.org` и `app.patient_user_id`/`app.integrator_user_id` должны ставиться ТОЛЬКО
  доверенным кодом (SECURITY DEFINER-сеттер / `GRANT SET ON PARAMETER` / выставление на закреплённом
  клиенте так, чтобы прикладная сессия не могла их переопределить). Иначе пациент в своей сессии подменит
  метку и увидит чужое — тогда это «изоляция на честном слове», а не базой. Это единственная реально тонкая
  часть; без неё смысла нет.
- Тенант — это метка контекста, не роль на каждый тенант. `app_staff`/`app_patient` как фиксированные
  runtime-роли уже используются в ветке для доказуемого staff-bypass; wiring этих ролей в реальные
  `DATABASE_URL`/пулы остаётся отдельным cutover-решением и требует проверки cluster-global role naming.

## Фаза 0 — ДИЗАЙН-ЛОК (сначала; вернуть оценку/файлы ДО Фаз 1+)

- Где метки ставятся сейчас: только в транзакциях (`applyCurrentDbPrincipalToTransaction`,
  `packages/db-principal/src/index.ts`; `withClient.ts` tx-хук; `prepareClientForRequest` — no-op).
- **Дыра = чистые чтения** через `getPool()`/`getDrizzle()` вне транзакций — спиши все по
  `T0_DB_ACCESS_SURFACE.md` + коду (сколько реально). Не-централизуемые точки конечны: integrator
  `DbPort.query` (`apps/integrator/src/infra/db/client.ts`), scheduler, media (org/actor per-джоб).
- Выбрать механизм ЗАПИРАНИЯ меток (SECURITY DEFINER vs GRANT SET ON PARAMETER vs pinned-client) и доказать,
  что прикладная сессия не может их сменить.
- Список файлов + оценка по фазам + срок до вехи. **Верни ДО кодинга.**

## Фаза 1 — Метки на ВСЕ scoped-обращения (клиника + пациент + staff), запертые

Перенести установку `app.org` + `app.patient_user_id` + `app.integrator_user_id` в per-checkout
(`prepareClientForRequest`), из принципала сессии (doctor/admin-гейт → staff+org; patient-гейт →
patient+org+identity; pre-auth → bootstrap); сброс при release; request-scoped клиент для plain-чтений;
провести «стрелков мимо» через чокпойнт; интеграторный/scheduler/media эквивалент. Метки запереть (Фаза 0).
**static-gate:** SCOPED-запрос без принципала в enforce-режиме падает; unset — только в legacy/shadow и
bootstrap/INFRA. **2-org + 2-patient smoke + shadow (B7):** доказать A≠B (клиника) и пациент≠пациент (внутри
орга) deny; shadow-лог непокрытых → добить 0.

## Фаза 2 — Включить ОБЕ стены (enforce) + #664

- ORG fail-closed: `app.org IS NOT NULL AND organization_id = app.org` + staff-or-own-patient слой.
- PATIENT-стена 0169-0175: GUC-версия + dormant-симметрия + запертый `app.patient_user_id`.
- **#664 (нужен, раз patient-стена включена):** узкие `WITH CHECK`/триггеры — пациент пишет только свою
  identity в forgeable-колонки (`actor_id=self`, `sender_role='patient'`, tenant/patient пиннится к
  меткам, допустимые переходы статусов/владение, обязательный `organization_id`). Прогнать реальные
  пациентские флоу под ограничением, закрыть недо-гранты точечно. Остаточные кейсы: `P0_5B_GRANTS.md`.

## Фаза 3 — Самрегистрация специалиста (структуры есть, нет write-сервиса)

`OrganizationProvisioningService` (после верификации email): login `platform_users` → `be_organizations`
(нужен `createOrganization(freshUuid,title)` — сейчас `upsertOrganization` пиннит id вызывающего,
`pgBookingEngine.ts:148`) → `be_specialists` → активный `be_organization_members` role=owner+specialist_id
(репо `pgOrganizationMembership.ts` read-only — добавить write-порт) → минимальные дефолты workspace →
signup-intent → doctor-сессия с новой орг. НЕ создавать `org_enrollments` владельцу. Отдельный specialist-
signup-intent, переиспользовать email/OTP; provisioning только после верификации; doctor-доступ из
membership; `doctor` глобальная — только compat-проекция роутинга. #670 — НЕ блокер. Мин. UI: email,
пароль, имя специалиста, название орг.

## Фаза 4 — Выкат, не ломая №1

1. Вынести `FORCE ROW LEVEL SECURITY` из dormant-точки в финальную cutover-миграцию (текущая цепочка с
   FORCE в «dormant» ослепляет владельца — НЕ катить как есть).
2. Compatibility deploy: схема/метки/central-код/#664/provisioning с ВЫКЛЮЧЕННЫМ signup; рантайм пока
   работает, missing-principal в shadow.
3. Test/staging под нагрузкой: свежая копия прод-базы; текущую клинику прогнать по всем классам (doctor,
   patient, integrator, scheduler, queue, media, pre-auth); синтетические org B + пациент B2; доказать: A
   не читает/не пишет B, пациент не видит другого пациента, unset fail-closed, signup создаёт org без SQL.
   Дополнительно: process-family smoke под реальными `app_staff`/`app_patient` ролями после B4-fanout и
   явное решение по cluster-global role naming/env-boundary для `app_staff`/`app_patient`.
4. Prod cutover: бэкап → выкл signup → maintenance → строгая политика + FORCE → role/marker-aware рантайм →
   smoke врача+пациента → трафик → включить signup после зелёных smoke. Rollback: выкл signup → NO
   FORCE/legacy → рестарт. Гейт абсолютный: 0 missing-principal, 0 permission-ошибок, зелёные 2-org и
   2-patient тесты, зелёный #664, зелёные smoke.

## Оценка (для протокола; точную даст Фаза 0)

Обе стены + регистрация + выкат: **~2-3 недели фокусной работы** (человеко-дни 12-18), первая веха раньше.
Самый первый и главный кусок — **метки на все чтения + запирание меток**, НЕ UI.

## Owner-ок (правило вставки скоупа — не срочно для Фазы 0)

(а) деплой подмножества миграций 0160-0175 vs полный #667-чейн; (б) НЕ откатывать 0175 (#662) обратно на
GUC-`is_staff`: staff-bypass остаётся role-membership через `app.is_staff()`, а cutover-решение касается
только wiring фиксированных `app_staff`/`app_patient` ролей и cluster-global naming/env-boundary.
Оба — часть выбранного пути; подтвердить перед прод-cutover.

## Правила

Только реализация; валидация на ОДНОРАЗОВОЙ копии прод-базы (не prod/test); не пушить; не ломать №1;
идемпотентно/обратимо. После Фазы 0 — оценка/файлы ДО Фаз 1+. Побочно: `DORMANT_DEPLOY_TEST_RUNBOOK.md`
§«Why safe» неверен для patient-стены — пометить.
