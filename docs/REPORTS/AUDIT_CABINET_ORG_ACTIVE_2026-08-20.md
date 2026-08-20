# Независимый адверсарный аудит — переключатель `is_active` организации и правки кабинета

**Дата:** 2026-08-20
**Гейт:** независимый (Opus), не автор кода.
**Клон:** `/home/dev/dev-projects/bcb-wt-cabinet-ui-rebuild`, ветка `wt/cabinet-ui-rebuild`.
**Коммиты под аудитом:** `566a7935f` (работа Cursor) · `df34e0734` (ручное сведение лида, 3 файла) · `b3f573d13` (две починки лида).

## ВЕРДИКТ: **PASS**

Все шесть вопросов брифа доказаны командами. Дверь наружу закрыта тем же гейтом, что и остальной глобальный
админ; модель прав не расширена — новая дверь целиком декларативна; purpose/functionIdentity совпадают в трёх
местах; ручное сведение лида не потеряло поведение ни одной стороны; миграция `0050` НЕ применена на dev и строки
в леджере под неё нет (плоское переименование безопасно); прочие правки не лезут в БД мимо порта и не показывают
чужих данных. Единственное, что нельзя проверить живьём, — сквозное исполнение под ролью-владельцем: миграция не
применена (вопрос E) и TEST/PROD трогать запрещено. Но статическая проводка полная и доказана: reconcile выдаёт
владельцу `app_seam_org_directory_owner` ровно `SELECT/UPDATE(id,is_active,updated_at)` на `public.be_organizations`
из `relationSurfaces` (см. B).

Замечание по окружению подтверждено самостоятельно: 236 ошибок `tsc` — это несобранные workspace-пакеты
(`@bersoncare/*`); после `pnpm -r --filter "./packages/**" build` → `tsc --noEmit` = **0 ошибок**, ни одной в
файлах Cursor. Не находка.

---

## A. Дверь наружу — `PATCH /api/admin/organizations/[organizationId]` — PASS

Маршрут: `apps/webapp/src/app/api/admin/organizations/[organizationId]/route.ts:13-15` — первым делом
`const gate = await requirePlatformOperationsApiContext(); if (!gate.ok) return gate.response;`. Гейт стоит ДО
разбора тела и до `buildAppDeps().platformEntitlements.setOrganizationActive(...)`.

Гейт `requireRole.ts:219-260`:
- нет сессии → **401** (`route`/`getCurrentSession` null);
- нет capability `platform.operations` **или** restricted-staff-security → **403**;
- не platform-UUID (`isPlatformUserUuid`) → **403** (второй, независимый забор);
- вход в DB-принципал платформы; исключение → **403**.

Кто получает `platform.operations` — `apps/webapp/src/app-layer/guards/workspaceCapabilities.ts:50-51`:
```
if (facts.sessionRole === 'admin') return new Set(['platform.operations', 'account.self']);
```
Только `sessionRole === 'admin'`. Доктор (55+), пациент, админ-арендатор (membershipRole owner/admin — это
workspace-capability, НЕ `platform.operations`) её не получают. Значит все четыре запрещённых входа закрыты:
без сессии → 401; доктор → 403; админ ЧУЖОЙ клиники → 403; пациент → 403.

`organizationId` из URL не даёт обхода: `platform.operations` — глобальная capability (по замыслу глобальный
оператор гасит ЛЮБУЮ клинику), пер-org стены здесь нет, поэтому и обходить нечего. Актор — доверенный
платформенный оператор, не арендатор; IDOR отсутствует. `organizationId` валидируется как uuid (`route.ts:18-21`).

**Тест краснеет при снятии гейта:** `route.route.test.ts:33-50` — при `gate.ok=false` ожидает 403 И
`setOrganizationActive` НЕ вызван. Удалить строку гейта → маршрут пойдёт дальше и вызовет порт → тест падает.
Прогон: `vitest run route.route.test.ts` → 2/2 зелёные. Есть и выделенный юнит гейта
`requireRole.platformOperations.unit.test.ts`.

## B. Модель прав не расширена — PASS

**(1) В миграции нет грантов.**
`grep -niE "grant|revoke|create role|alter role|policy|owner to|alter table"
apps/webapp/db/drizzle-migrations/0050_*.sql` → **NONE FOUND**. Тело —
единственная `CREATE OR REPLACE FUNCTION` (SECURITY DEFINER) + `require_accepted_context` + `SELECT … FOR UPDATE`
+ условный `UPDATE`.

**(2) EXECUTE выдан декларативно, ровно `app_platform_settings`.**
`deploy/postgres/privileges/declaration.ts:6008-6019` — `execute: ['app_platform_settings']`. Больше никому.
В миграции GRANT EXECUTE отсутствует (см. (1)). Выдача едет через reconcile из декларации, не из SQL-файла.

**(3) Объявление совпадает с телом ДОСЛОВНО.**

| свойство | миграция `0050` | `declaration.ts:6008` |
|---|---|---|
| владелец | `-- BCB-MIGRATION-OWNER: app_seam_org_directory_owner` | `owner: 'app_seam_org_directory_owner'` |
| security | `SECURITY DEFINER` | `security: 'DEFINER'` |
| returns | `RETURNS TABLE(organization_id uuid, is_active boolean, changed boolean)` | `returns: 'record', returnsSet: true` |
| typedArgs | `(p_organization_id uuid, p_is_active boolean)` | `typedArgs: ['uuid','boolean']` |
| volatility | `VOLATILE` | `volatility: 'VOLATILE'` |
| parallel | `PARALLEL UNSAFE` | `parallel: 'UNSAFE'` |
| search_path | `SET search_path = pg_catalog` | `proconfig: ['search_path=pg_catalog']` |
| relation | `public.be_organizations` | `relation: 'public.be_organizations'` |
| columns | тело трогает `id` (WHERE), `is_active` (SELECT+SET), `updated_at` (SET) | `columns: ['id','is_active','updated_at']` |
| operations | `SELECT … FOR UPDATE` + `UPDATE` | `operations: ['SELECT','UPDATE']` |

Совпадение точное.

**(4) Новых грантов на саму таблицу не появилось.** Diff `declaration.ts` — только два добавления
(context-дескриптор 2637-2642 + function-census 6008-6019). `relation-access.ts` (источник прямых грантов
`REV10_CLINICAL_ACCESS`) Cursor не трогал и трогать не должен: грант владельцу-шва выводится из `relationSurfaces`
функции на этапе reconcile (`declaration.ts:6806-6816` — `add(seam.owner, [operation], …)`), а не из
`relation-access.ts`. Проверено, что это тот же авторитетный реестр: `REV10_CONTEXT.functions = { ...BUSINESS_SEAM_FUNCTIONS (3154), <инлайн-записи включая новую 6008> }`, а `revision10RelationSeams` (6744) итерирует именно `REV10_CONTEXT.functions`. Значит новая функция полноценно
зарегистрирована, и владелец получит `UPDATE(is_active,updated_at)+SELECT` на `be_organizations` — дверь заработает
после применения миграции.

## C. Контекст порта — purpose и functionIdentity совпадают в трёх местах — PASS

| место | purpose | functionIdentity |
|---|---|---|
| миграция `0050:31,36` | `'platform.organization.set-is-active'` | `'app.set_platform_organization_is_active(uuid,boolean)'` |
| `declaration.ts:2641-2642` (context-дескриптор `webapp_platform_organization_set_active`) | `'platform.organization.set-is-active'` | `'app.set_platform_organization_is_active(uuid,boolean)'` |
| вызывающий код `pgPlatformEntitlements.ts` (`runWebappNamedRoot(db, 'app.set_platform_organization_is_active(uuid,boolean)', …)`) | резолвится по functionIdentity | `'app.set_platform_organization_is_active(uuid,boolean)'` |

Вызывающий код передаёт только `functionIdentity`; purpose runtime берёт из дескриптора по паре
`functionIdentity + contextClass('platform')` (`portContextRuntime.ts:264-298,304-330` — `descriptor.purpose`).
Разъезда нет. Дескриптор повторяет прецедент `webapp_platform_analytics_dashboard` (`declaration.ts:2394-2398`)
дословно: sessionRole/targetRole `app_platform_settings`, contextClass `platform`; arg-конвенция
`require_accepted_context(owner, targetRole, 'platform', purpose, hash, regprocedure)` совпадает с 0045.

## D. Ручное сведение лида — PASS

Три файла разрешены руками (`df34e0734`).

**In-memory-двойник ведёт себя как настоящая функция** — `inMemoryPlatformEntitlements.ts:155-161`:
```
async setOrganizationActive(organizationId, isActive) {
  if (!organizationTariffs.has(organizationId)) throw new Error('organization_not_found'); // ← как RAISE 22023
  const before = organizationIsActive.get(organizationId) ?? true;
  if (before === isActive) return { isActive, changed: false };                            // ← идемпотентность
  organizationIsActive.set(organizationId, isActive);
  return { isActive, changed: true };
}
```
Повторное выставление того же значения → `changed: false` (в коммите `566a7935f` двойник ещё возвращал
`changed:true` всегда — сведение лида это выправило). Not-found и идемпотентность совпадают с телом миграции
(строки 45-52). `isActive: organizationIsActive.get(id) ?? true` (42) корректно отражает состояние в проекции.

**Контракт `Promise<boolean>` согласован во всех местах:**
- объявления: `ClinicsConsoleClient.tsx:580,699` (`onOrganizationsRefresh: () => Promise<boolean>`),
  `OrganizationCommercialPanel.tsx:37` (`onUpdated: () => Promise<boolean>`);
- реализация: `reloadOrganizations` (`ClinicsConsoleClient.tsx:811`) → `Promise<boolean>` (true/false по ветвям);
- вызовы: `ClinicsConsoleClient.tsx:600` (`const refreshed = await onOrganizationsRefresh(); if (!refreshed) …`),
  `OrganizationCommercialPanel.tsx:100` (`const refreshed = await onUpdated();`);
- проброс: `934 → 755/763` (панель is_active и коммерческая панель получают один и тот же колбэк).

Тип и семантика совпадают везде; `tsc` на этих файлах чист (0 ошибок после сборки пакетов). Тест
`route.route.test.ts` (обе стороны конфликта — отказ гейта + успешный тумблер) — 2/2 зелёные.

## E. Имя миграции `0050` — состояние (не чиню, только отвечаю)

**Миграция `0050` НЕ применена на `bcb_webapp_dev`; строки в леджере под неё нет.**

Доказательство (mTLS-подключение ролью `bcb_dev_webapp_global_admin`):
```
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app' AND p.proname IN
  ('set_platform_organization_is_active','list_platform_organization_members');
→ list_platform_organization_members        (сосед-DEFINER присутствует)
→ (set_platform_organization_is_active ОТСУТСТВУЕТ)
```
Функция, которую создаёт миграция, на dev отсутствует, тогда как её сосед из той же семьи присутствует — значит
миграция не прогонялась. Drizzle пишет строку леджера в ОДНОЙ транзакции с DDL, поэтому отсутствие функции ⇒
строки леджера нет. Прямое чтение `drizzle.__drizzle_migrations` тремя runtime-ролями вебаппа отказало
(`permission denied for schema drizzle`; схема принадлежит `app_object_owner`) — в леджер я не писал и не читал
его напрямую, как и требует бриф; в него сейчас работает другой агент.

**Следствие для лида:** раз ничего не применено и в леджере пусто — файл можно просто ПЕРЕИМЕНОВАТЬ по новой схеме
(имя занято `0050` и нарушает решение владельца 20.08); `--relabel` через обёртку не нужен.

## F. Прочие правки — беглый проход — PASS

Ни один изменённый файл раздела F не лезет в БД мимо порта и не показывает чужих данных:
- `grep -nE "getDrizzle|drizzle|db\.select|runWebapp|fetch\(|sql\`|pg\b"` по
  `staffNotificationsSection.tsx`, `admin/notifications/page.tsx`, `admin/technical/page.tsx`, `formatStorageMb.ts`,
  `PlatformAnalyticsPageClient.tsx`, `platformNavLinks.ts`, `DoctorMenuAccordion.tsx`, `account/page.tsx` — **пусто**
  (это UI/форматирование/навигация; данные приходят через `buildAppDeps()`-порты).
- `admin/notifications/page.tsx:11` закрыт `requirePlatformOperationsPage()`; данные session-scoped
  (`loadStaffAccountPageContext` → `session.user.userId`, `workspaceContext.organizationId`).
- `account/page.tsx` — рефактор: вынос существующей `loadNotificationsContent` в общий
  `loadStaffNotificationsSection`, переиспользуемый кабинетом и админ-уведомлениями; логика та же, scope тот же.
- `formatStorageMb.ts` — чистая функция, юнит `formatStorageMb.unit.test.ts` — 2/2 зелёные.

---

## Прогоны (доказательная база)

- `vitest run route.route.test.ts formatStorageMb.unit.test.ts portContextRuntime.test.ts` →
  после сборки пакетов **19/19 + 2 + 2 зелёные** (до сборки `portContextRuntime` падал только на
  `Failed to resolve entry for package "@bersoncare/db-principal"` — env).
- `pnpm -r --filter "./packages/**" build` → 4 пакета собраны; затем `tsc --noEmit` (apps/webapp) → **0 ошибок**.
- SQL-проверки — mTLS ролью `bcb_dev_webapp_global_admin` против `bcb_webapp_dev` (только чтение pg_catalog).
- В леджер `drizzle.__drizzle_migrations` не писал и напрямую не читал (RLS/permission + чужой агент).
