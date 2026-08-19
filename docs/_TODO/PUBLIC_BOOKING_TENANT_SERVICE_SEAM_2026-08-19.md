# Публичная запись мертва целиком: у вебаппа нет двери класса `tenant_service` (19.08.2026)

## Что человек не получает

Посетитель открывает опубликованную ссылку клиники `/book/{slug}` и видит «Каталог недоступен» —
при том, что у клиники заполнены филиалы, услуги и расписание. Дальше по воронке (слоты, поля формы,
создание и подтверждение записи) он не проходит тоже. **Записаться в клинику снаружи нельзя ни в одной
опубликованной клинике.** Ни один экран воронки не работает; это не деградация части, это ноль.

## Замер (TEST, 19.08, голова `f54a6b4522`)

```
GET https://test.bersoncare.ru/book/saas-test-clinic-a  -> 200, «Каталог недоступен»
GET https://test.bersoncare.ru/book/saas-test-clinic-b  -> 200, «Каталог недоступен»
GET /api/booking/public/slots?type=in_person&orgSlug=saas-test-clinic-a&branchId=…&serviceId=…
    -> 503 {"ok":false,"error":"Failed query: SELECT app.resolve_public_booking_organization(…)"}
```

Обе клиники опубликованы (`clinic_public_directory_entries.is_published = t`) и у обеих есть каталог
(1 филиал / 1 услуга / 1 доступность у каждой).

В логе Postgres за эти минуты — **ни одной строки**. Это не пропуск логирования в базе: отказ
происходит в Node **до** отправки statement'а, поэтому Postgres запроса не видит вообще.

## Причина — измерена, не выведена

Организационный принципал вебаппа (`withExplicitOrganizationPrincipal` → `kind: 'organization'`)
в port-context-режиме проецируется на имя способности `tenant_service`
(`apps/webapp/src/infra/db/portContextRuntime.ts`, `webappPortContextPrincipal`). Для обычного
реляционного чтения (не именованный корень) берётся способность ровно с этим именем и
`purpose: 'relation'`. **Такой способности у порта `webapp` не существует.**

Прогон настоящей функции против ТОГО САМОГО каталога, с которым запущен вебапп TEST
(`WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` из `/opt/env/bersoncarebot/webapp.test`, 195 способностей):

```
webappPortContextPrincipal({kind:'organization', organizationId:'53000000-…-a1'}, caps)
  -> Error: Missing declared webapp port capability: tenant_service
```

То же в базе — источник истины:

```sql
select port, purpose from app_ext.port_context_capabilities where context_class='tenant_service';
-- webapp: 9 строк, ВСЕ именованные корни (reminder.*, integrator.*)
-- integrator: 5 корней + ОДНА строка purpose='relation'
```

Реляционная дверь класса `tenant_service` объявлена только для порта `integrator`
(`integrator_tenant_service_relation`, `deploy/postgres/privileges/declaration.ts:2296`). Для вебаппа
объявлены реляционные двери `staff`, `patient`, `clinicBilling`, `platform`, `platform_admin`,
`worker`, `media_worker`, `maintenance`, `telemetry` — и ни одной `tenant_service`.

Права роли тут ни при чём: `bcb_test_webapp_staff` состоит в `app_tenant_service`. Не хватает не
привилегии, а **объявленной двери**, и по канону схемы (`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md`)
это и есть правильное состояние: сквозного реляционного доступа арендаторскому классу не выдают,
он ходит именованными корнями от владельца шва.

Живое воспроизведение на dev (тот же режим, `bcb_webapp_dev`, слаг `dmitryberson`) — тот же экран и,
после правки ниже, та же причина в строке лога:

```
[book/public-catalog] catalog read failed {
  category: 'repository_unavailable',
  message: 'Failed query: select … from "be_branches" where "be_branches"."organization_id" = $1',
  cause: 'Missing declared webapp port capability: tenant_service',
  source: 'app/book/[slug]:load-cities',
  organizationId: 'a0000000-0000-4000-8000-000000000001'
}
```

## С какого момента сломано

С **12.08.2026** — с переводом TEST на port-context (`fe7aa07d9 feat(db-access): make TEST the first
live cutover`, `cf621bcbc`, `cd487277f`, все 12.08). До перевода организационный принципал ставил GUC
на staff-пуле и чтение проходило. Это не сегодняшняя регрессия: публичная запись стоит неделю, и
никто этого не заметил ровно потому, что она молчала (правка ниже закрывает именно молчание).

## Полный список мест, которые сейчас мертвы по той же причине

Каждое — организационный принципал с обычным чтением/записью:

| Файл | Что не работает у человека |
| --- | --- |
| `apps/webapp/src/app/book/publicOrganizationBooking.ts` (3 загрузчика) | города, услуги города, прямой выбор филиал+услуга |
| `apps/webapp/src/app/api/booking/public/slots/route.ts` | свободные слоты |
| `apps/webapp/src/app/api/booking/public/form-fields/route.ts` | поля формы записи |
| `apps/webapp/src/app/api/booking/public/create/route.ts` | создание записи |
| `apps/webapp/src/app/api/booking/public/create/confirm/route.ts` | подтверждение записи |
| `apps/webapp/src/app/api/booking/payment-status/route.ts` | статус оплаты записи |
| `apps/webapp/src/app/api/booking/memberships/{catalog,[id],purchase,payment-status}/route.ts` | абонементы |
| `apps/webapp/src/app/api/payments/webhook/[provider]/route.ts` | вебхук эквайринга (SaaS) |
| `apps/webapp/src/app/api/payments/patient-acquiring-webhook/[provider]/route.ts` | вебхук эквайринга пациента |

Отдельно: `app.resolve_public_booking_organization(uuid,uuid)` в базе **существует** (владелец
`app_seam_public_booking_owner`), но в каталоге способностей его нет — поэтому маршрут слотов падает
ещё раньше, на самом корне. Это первая и самая дешёвая точка приложения сил.

## Что сделано в этой ветке

**Только молчание.** `publicOrganizationBooking.ts`: три голых `catch` и две ветки «порт не подключён»
теперь проходят через один локальный репортёр `reportPublicCatalogFailure` — строка уровня error с
классификацией SQLSTATE (`42501` → `capability_denied`), источником, id организации и **причиной из
цепочки `cause`** (без неё в логе оставалось бы drizzle'вское «Failed query: select …», то есть то же
молчание уровнем ниже). Обёрточного слоя не добавлено: загрузчики сохранили свои fail-closed
возвраты, они перестали быть немыми. Законная пустота (клиника ничего не опубликовала) не логируется
и по-прежнему отдаёт `ok: true` с пустым списком.

Операторский инцидент здесь не поднимается: соседние правки переписи
(`docs/_TODO/SWALLOWED_ERRORS_CENSUS_2026-08-19.md`, A-3/A-4) на запросном пути пишут строку лога, а
инциденты открывает только каденция сторожа (`app.open_or_touch_operator_critical_incident`, крон).

## Что НЕ сделано — и что надо решить

- [ ] **Дверь для публичного каталога.** Санкционированный механизм — именованный корень от
  `app_seam_public_booking_owner` (шов уже существует и уже держит `resolve_public_booking_organization`),
  шаблоны — миграции `0038`–`0041`. Нужны как минимум: чтение активных филиалов организации и чтение
  услуг филиала с уже применённой фильтрацией (`is_active`, `public_widget_visible`,
  `NOT admin_manual_only`, назначение активному специалисту), — то есть логика из
  `modules/patient-booking/inPersonServicesCatalog.ts` переезжает внутрь двери.
- [ ] **Объявить `app.resolve_public_booking_organization(uuid,uuid)`** — функция есть, способности нет.
- [ ] **Остальная воронка** (слоты, поля формы, создание, подтверждение, оплата, абонементы, вебхуки) —
  свои корни. Только каталог чинить нельзя: человек увидит услуги и снова упрётся на выборе времени.
- [ ] **OWNER QUESTION / развилка для ведущего:** это работа не на один проход. Либо (а) объявить
  вебаппу реляционную дверь `tenant_service` (быстро, но это ровно та сквозная поверхность, которую
  схема арендаторскому классу не даёт, — ослабление канона), либо (б) корни по одному на каждый шаг
  воронки (канонично, дольше). Выбор (а) требует явного решения владельца — сам по себе агент его не
  принимает.

## Третья организация — «Точка Здоровья»

`a0000000-0000-4000-8000-000000000001`, 3 филиала / 2 услуги / 12 доступностей, публичного слага нет.
Это **не дефект кода**: слаг не выдаётся автоматически никогда. Он ставится явным действием —
администратором клиники в настройках (`/api/clinic/slug` → `setOrganizationSlug`) или на регистрации
специалиста (`/api/auth/specialist-signup/slug`); механизм с резервацией, проверкой уникальности и
подтверждением необратимого переименования. Организация создана 30.05, задолго до появления
`/book/{slug}`, и её слаг просто никто не задавал. Панель управления слагом ей видна в настройках
(`app/app/settings/page.tsx`, `canManageOrganization`).

Побочное следствие, которое стоит знать: единственная организация TEST с настоящими данными не имеет
публичной страницы вовсе — поэтому неделю неработающей публичной записи никто и не заметил при обходе.
