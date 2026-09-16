# Разобрано 60 маршрутов (`rg --files apps/webapp/src/app/api/admin | rg '/route\.ts$' | wc -l` → `60`); MUST FIX: 0 (`awk 'BEGIN{n=0} /^\| MUST FIX \|/{n++} END{print n}' docs/_TODO/AUDIT_ADMIN_DOORS_A1_2026-09-16.md` → `0`)

## Вердикт

А1 проходит независимый аудит: платформенные операции закрыты канонической платформенной дверью, а маршруты с
клиничной дверью работают только в контексте одной разрешённой организации. Обычный врач не дотягивается ни до
одной платформенной операции. Продуктовый код и тесты не менялись.

Строка для ведущего: `A1 PASS — 60/60 admin-маршрутов и 80/80 HTTP-обработчиков разобраны; MUST FIX 0; 18 withDoctorWorkspacePrincipal-файлов объяснены как clinic-scoped (11 clinic-management, 7 clinical media).`

## Authority и способ проверки

Authority: `docs/_TODO/API_DOORS_BY_AREA_2026-09-16.md` §§ «Чего этот замер НЕ доказывает», «А1» и «Границы»;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §1 (разные двери глобального администратора и клиники) и §21
(жёсткая стена между клиниками); `AGENTS.md` §1, §5, §10a, §10b и §24.

Классификация по §24.4:

- дверь маршрута, полнота дерева, соседние методы и порядок — **ВЗГЛЯД/ПЕРЕПИСЬ**;
- достижимое ослабление — **ТЕСТ/инъекция** только после его обнаружения;
- ослаблений не найдено, поэтому новый тест «на всякий случай» не создавался: он дублировал бы текущую форму
  дерева вопреки §10a.

До чтения существующих route-тестов использован kill-set из authority:

1. doctor/clinic session достигает platform-wide read или mutation;
2. clinic route принимает организацию снаружи либо исполняется без доказанного principal своей организации;
3. один HTTP-метод файла закрыт, соседний остаётся без двери;
4. до применимой двери происходит чтение продукта, mutation или различимый бизнес-ответ.

Замеры выполнены своими командами:

```text
rg --files apps/webapp/src/app/api/admin | rg '/route\.ts$' | wc -l
→ 60

rg -n "export async function (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)" apps/webapp/src/app/api/admin --glob 'route.ts' | wc -l
→ 80

rg -l "withDoctorWorkspacePrincipal" apps/webapp/src/app/api/admin --glob 'route.ts' | wc -l
→ 18

rg -l "withDoctorWorkspacePrincipal" apps/webapp/src/app/api/admin/booking-engine --glob 'route.ts' | wc -l
→ 11

rg -l "withDoctorWorkspacePrincipal" apps/webapp/src/app/api/admin/media --glob 'route.ts' | wc -l
→ 7
```

Перепись методов и первого вызова каждого handler дополнительно построена одноразовым read-only TypeScript AST
проходом (`node --input-type=module`, `typescript.createSourceFile`); постоянный скрипт/тест не сохранялся.

## Каноническая платформенная дверь

Каноническая дверь — `requirePlatformOperationsApiContext` в
`apps/webapp/src/app-layer/guards/requireRole.ts:232`.

Она гарантирует:

- существует действующая сессия, иначе одинаковый `401 unauthorized`;
- сессия имеет capability `platform.operations`; сегодня
  `resolveLaunchCapabilities` выдаёт её только `session.user.role === 'admin'`
  (`workspaceCapabilities.ts:47-52`);
- сессия не находится в незавершённом обязательном recovery/verification состояния staff-security;
- `session.user.userId` имеет допустимую форму platform-user UUID;
- в request-local контекст установлен DB principal `{ kind: 'platform', platformUserId, source:
  'platform.operations:authenticated' }`; port-context направляет его только в `globalAdmin` pool, а DB
  chokepoint применяет роль `app_platform_settings`.

Она намеренно **не** гарантирует:

- организацию, membership или specialist: platform principal принципиально не содержит `organizationId`;
- доступ к клиническому workspace — глобальный администратор не наследует clinic capability;
- entitlement конкретного тарифа, валидность payload и допустимость конкретной бизнес-операции — это обязанности
  маршрута/сервиса после двери;
- более узкий подвид платформенного оператора: в текущей capability-модели `platform.operations` соответствует
  единственной session-role `admin`;
- немедленно выполненный SQL `SET ROLE` прямо внутри guard: guard ставит request-local principal, а роль и нужный
  physical pool применяются DB chokepoint при обращении к базе.

`requireAdminApiContext` канонической дверью не является: он проверяет только literal-role `admin`, не проверяет
staff-security restriction и не ставит platform principal (`requireRole.ts:276-298`).

## Перепись всех 60 маршрутов

В колонке «область» `platform` означает platform-only, `clinic` — одну организацию из membership/principal,
`mixed` — явное разветвление платформенного и клиничного режима.

| Адрес | Методы | Фактическая дверь | Область |
|---|---|---|---|
| `/api/admin/account-merge/:userId/candidates` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/account-merge/apply` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/account-merge/preview` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/audit-log/resolve` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/audit-log` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/auth-registration-events` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/booking-engine/availability` | `GET`, `POST` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/branches/:id` | `PATCH`, `DELETE` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/branches` | `GET`, `POST` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/form-fields` | `GET`, `POST`, `DELETE` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/online-location` | `PUT` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/overview` | `GET` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/policies` | `GET`, `POST` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/prepayment-policies` | `GET`, `PUT` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/public-appointments` | `GET` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/services/:id` | `PATCH`, `DELETE` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/services` | `GET`, `POST` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/specialists/:id` | `PATCH`, `DELETE` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/booking-engine/specialists` | `GET`, `POST` | `requireClinicManagementBookingEngine` → `requireClinicManagementApiContext` | clinic |
| `/api/admin/clinic-delivery-test` | `POST` | `requireClinicManagementApiContext` | clinic |
| `/api/admin/commercial` | `GET`, `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/commercial/tariff-policy-history` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/doctor-analytics-appointments` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/doctor-analytics-metric-accounts` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/google-calendar/calendars` | `GET` | `requireClinicManagementApiContext` | clinic |
| `/api/admin/google-calendar/callback` | `GET` | `requireClinicManagementApiContext` | clinic |
| `/api/admin/google-calendar/start` | `POST` | `requireClinicManagementApiContext` | clinic |
| `/api/admin/health-failure-archive/clear` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/health-failure-archive` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/login-history` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/media/:id` | `GET`, `DELETE`, `PATCH` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/media/:id/usage-summary` | `GET` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/media/delete-errors` | `GET` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/media/exercise-usage` | `POST` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/media/folders/:id` | `PATCH`, `DELETE` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/media/folders` | `GET`, `POST` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/media` | `GET` | `requireDoctorWorkspaceApiContext` | clinic |
| `/api/admin/notification-templates` | `GET`, `PUT`, `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/operator-incidents/acknowledge-all` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/operator-incidents/resolve-all` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/organizations/:organizationId/billing` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/organizations/:organizationId/members` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/organizations/:organizationId` | `PATCH` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/organizations` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/platform-analytics` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/platform-user-registration-stats` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/platform-user-subscriber-stats` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/product-analytics` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/reminder-stats` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/saas-billing/payments/:invoiceId/cancel` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/saas-billing/payments/export` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/saas-billing/payments/manual` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/saas-billing/payments/reconcile` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/saas-billing/payments` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/saas-billing/payments/summary` | `GET` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/settings` | `GET`, `PATCH`, `DELETE` | `requireSettingsApiContext` → platform: `requirePlatformOperationsApiContext`; clinic: `requireClinicManagementApiContext` | mixed |
| `/api/admin/smtp-test` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/system-health` | `GET` | `requireAdminApiContext` → `requirePlatformOperationsApiContext` | platform |
| `/api/admin/telegram-bot-identity` | `POST` | `requirePlatformOperationsApiContext` | platform |
| `/api/admin/users/:userId/archive` | `PATCH` | `requireAdminWorkspaceApiContext` | clinic |

## Отдельный разбор 18 файлов с `withDoctorWorkspacePrincipal`

Сам `withDoctorWorkspacePrincipal` — не дверь. Он требует уже установленный `staff` principal и запускает callback
с теми же `organizationId` и `platformUserId` (`withOrganizationPrincipal.ts:85-102`). Поэтому классификация ниже
основана на предшествующем auth guard каждого handler, а не на названии wrapper.

| Маршрут | Достижим обычному врачу | Классификация и доказательство |
|---|---:|---|
| `/api/admin/booking-engine/availability` | нет | Своя клиника: `requireClinicManagementBookingEngine` первым вызывает `requireClinicManagementApiContext`; только `organization.management`, все ids сверяются с `gate.ctx.organizationId`. |
| `/api/admin/booking-engine/branches/:id` | нет | Своя клиника: clinic-management door; существующая локация сверяется с `gate.ctx.organizationId`. |
| `/api/admin/booking-engine/branches` | нет | Своя клиника: clinic-management door; новая локация получает `gate.ctx.organizationId`. |
| `/api/admin/booking-engine/form-fields` | нет | Своя клиника: clinic-management door; чтение/запись получают только `gate.ctx.organizationId`. |
| `/api/admin/booking-engine/online-location` | нет | Своя клиника: clinic-management door; mutation выполняется под principal организации. |
| `/api/admin/booking-engine/policies` | нет | Своя клиника: clinic-management door; policy читается/пишется в организации из context. |
| `/api/admin/booking-engine/prepayment-policies` | нет | Своя клиника: clinic-management door; service/policy проверяются внутри `gate.ctx.organizationId`. |
| `/api/admin/booking-engine/services/:id` | нет | Своя клиника: clinic-management door; найденная услуга сверяется с организацией context. |
| `/api/admin/booking-engine/services` | нет | Своя клиника: clinic-management door; list/create используют организацию context. |
| `/api/admin/booking-engine/specialists/:id` | нет | Своя клиника: clinic-management door; специалист сверяется с организацией context. |
| `/api/admin/booking-engine/specialists` | нет | Своя клиника: clinic-management door; list/create используют организацию context. |
| `/api/admin/media/:id` | да, при `clinical.workspace` | Клиничный медиакаталог, не platform route: `requireDoctorWorkspaceApiContext` ставит staff principal организации; get/delete/update в repo фильтруют `media_files.organization_id` по current principal. |
| `/api/admin/media/:id/usage-summary` | да, при `clinical.workspace` | Клиничный медиакаталог: до usage сначала `getById` под principal своей организации; чужой id становится `not_found`. |
| `/api/admin/media/delete-errors` | да, при `clinical.workspace` | Клиничная очередь медиа: оба запроса `listMediaDeleteErrors` содержат `WHERE organization_id = currentPrincipalOrganizationId()` (`s3MediaStorage.ts:1093-1115`). |
| `/api/admin/media/exercise-usage` | да, при `clinical.workspace` | Клиничное использование медиа: каждый id сначала проходит org-scoped `deps.media.getById`; callback остаётся под staff principal. |
| `/api/admin/media/folders/:id` | да, при `clinical.workspace` | Клиничные папки: folder repo требует organization principal и сверяет target/fallback organization (`mediaFoldersRepo.ts:26-45`). |
| `/api/admin/media/folders` | да, при `clinical.workspace` | Клиничные папки: list/create берут организацию только из current principal (`mediaFoldersRepo.ts:48-108`). |
| `/api/admin/media` | да, при `clinical.workspace` | Клиничный медиакаталог: list добавляет `m.organization_id = currentPrincipalOrganizationId()` (`s3MediaStorage.ts:293-299`). |

Итог по восемнадцати: 11 booking-файлов доступны только owner/admin клиники; 7 media-файлов доступны клиническому
врачу, но не несут ни platform principal, ни выбора произвольной организации, ни platform-wide данных. Это
управление/работа внутри своей клиники, случайно сохранившая исторический URL `/api/admin/**`, а не ослабление
платформенной двери.

## Метод-за-методом и порядок двери

- Переписаны 80 HTTP handler (`rg -n ... | wc -l` выше). В каждом handler первым содержательным вызовом является
  применимая дверь либо helper, который немедленно вызывает её. Файла, где один экспортированный HTTP-метод закрыт,
  а соседний нет, в admin-дереве нет. Утверждение ведущего для А1 подтверждено.
- В перечисленных platform-файлах (`doctor-analytics-appointments`, `doctor-analytics-metric-accounts`,
  `platform-user-registration-stats`, `platform-user-subscriber-stats`, `product-analytics`, `reminder-stats`,
  `system-health`) перед канонической дверью стоит более слабый `requireAdminApiContext`. Между ними нет parse,
  product read, mutation или ответа успеха. Предварительная дверь возвращает те же `401 unauthorized` для отсутствия
  сессии и `403 forbidden` для не-admin, после чего каноническая дверь всё равно проверяет security restriction,
  UUID и ставит platform principal. Ослабления и дополнительного oracle наружу нет.
- В `/api/admin/settings` helper сначала читает только сессию, чтобы выбрать один из двух законных режимов, затем
  вызывает `requirePlatformOperationsApiContext` для global settings либо `requireClinicManagementApiContext` для
  per-organization settings. До выбранной двери продуктовые данные не читаются и mutation/различимый бизнес-ответ
  не выполняется. `DELETE` после helper дополнительно отказывает clinic-ветке.
- В остальных handler дверь/helper стоит до URL/body parsing, product read, mutation и бизнес-ответов.

## Findings

| Уровень | Результат |
|---|---|
| объяснено и чисто | Все platform-wide маршруты проходят через `requirePlatformOperationsApiContext`; перечисленные legacy preliminary role-check не заменяют каноническую дверь. |
| объяснено и чисто | Все clinic-маршруты получают organization только из resolved membership/principal. URL `/api/admin/**` сам по себе не делает их платформенными. |
| объяснено и чисто | Все 18 `withDoctorWorkspacePrincipal` файлов разобраны по фактической auth door; ни один не даёт обычному врачу platform operation. |

MUST FIX отсутствуют. Вопросов владельцу по authority А1 не возникло. Инъекция/живая проба не запускалась: нет
конкретного найденного ослабления, которое требовало бы поведенческого доказательства; постоянный census-тест
дублировал бы дерево и нарушал §10a.
