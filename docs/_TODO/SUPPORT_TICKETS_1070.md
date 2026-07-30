# #1070 — обращения в поддержку платформы

**Статус:** план готов к решению владельца о сроке хранения; production-код не начат.

**Карточка:** `#1070`.

## 1. Канон и последние решения владельца

Приоритет источников:

1. [`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`](../ARCHITECTURE/OWNER_PRODUCT_RULES.md) §31–31.2;
2. [`docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md`](OWNER_PUNCHLIST_2026-07-28.md) §11 и D-11/D-12;
3. этот исполнительный план;
4. [`SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md`](SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md)
   — только для сохранившихся сведений об admin-shell и guard-прецедентах; прежняя модель одного
   бесконечного чата из его §4–§7 отменена.

Уже решено владельцем:

- поддержка помогает пользоваться платформой; вопросы о здоровье, симптомах, диагнозах и лечении направляются
  врачу в кабинете;
- первичная база, файлы, резервные копии и обработка обращений находятся в РФ;
- собственная минимальная система строится как обычный helpdesk: отдельное обращение, реплики, вложения,
  понятные статусы и экспорт;
- форма создания обращения доступна только после входа;
- глобальный администратор работает в существующей `/app/admin/**`-консоли, без второго логина;
- уведомление о новом обращении — обычное настраиваемое уведомление на почту владельца и в выбранный
  мессенджер, не аварийный operator alert;
- старые `support_conversations*` обслуживают пациентско-клиническую переписку, рассылки и реабилитационные
  комментарии: их нельзя показывать global admin или переиспользовать как helpdesk;
- после запуска системы публичная внешняя ссылка `t.me/...` и гостевой POST поддержки удаляются.

Осталось одно решение владельца:

- **срок хранения закрытых обращений и его основание.** Техническая модель хранит `resolved_at`, поддерживает
  настраиваемый срок, удаление текста/вложений и доказательство уничтожения. Автоматическое удаление и PROD
  retention gate не включаются, пока срок не выбран.

## 2. Текущее состояние и точный разрыв

- `/app/patient/support` уже содержит правильную подсказку «вопросы о здоровье — врачу», но
  `POST /api/patient/support` не создаёт обращение: он передаёт текст в `relaySupportSubmission`.
- `relaySupportSubmission` вызывает `dispatchOperatorAlert`. Это неверная семантика для обычной поддержки:
  сбой/пустая аудитория наследуют аварийный fallback, а полного журнала обращений нет.
- При полном сбое доставки сохраняются только последние 20 урезанных сообщений в `operator_job_status`;
  модуль сам указывает, что это не ticket system.
- `/app/contact-support` и `POST /api/public/support` всё ещё принимают гостевые обращения, хотя D-12
  запрещает anonymous support.
- `support_contact_url` всё ещё допускает внешний `https://t.me/...`.
- В `/app/admin/**` нет списка обращений, просмотра истории, ответа, смены статуса или экспорта.

Следствие: **сначала сохраняется тикет в своей БД, затем после commit отправляется обычное уведомление.**
Недоставка уведомления никогда не теряет обращение и не меняет результат его создания.

## 3. Минимальная продуктовая модель

### 3.1 Обращение

`support_tickets`:

- `id` — стабильный UUID;
- `number` — короткий человекочитаемый номер;
- `requester_user_id` — вошедший пользователь;
- `organization_id` — server-resolved организация, nullable для пациента без выбранной организации;
- `title`;
- `status`: `open | waiting_for_requester | resolved`;
- `created_at`, `updated_at`, `last_message_at`, `resolved_at`;
- `resolved_by_user_id`.

Новая реплика автора в `resolved`-обращение атомарно переводит его обратно в `open`. SLA, priority,
категории, назначение оператора, live presence и полнотекстовый поиск в первый срез не входят.
`title` хранится только внутри защищённого ticket storage и никогда не попадает в уведомления или логи.

### 3.2 Реплики и статусы

`support_ticket_replies`:

- `id`, `ticket_id`;
- `author_user_id`;
- `author_side`: `requester | platform`;
- plain-text `body`;
- `created_at`.

Реплики не перезаписываются. Создание, ответ, переход статуса и reopening пишут отдельное событие аудита без
текста сообщения, email и других чувствительных данных.

### 3.3 Вложения

`support_ticket_attachments` хранит только metadata и ссылку на объект в существующем российском storage:
`id`, `ticket_id`, `reply_id`, `object_key`, безопасное имя, MIME, размер, checksum, `created_at`.

Первый безопасный предел: ограниченный список MIME, количество и размер; загрузка только через существующий
media/storage port. Если проверка вложений не готова, UI запускается без upload, но пункт 11.5 и задача #1070
остаются открытыми.

### 3.4 Экспорт

С первого дня global admin получает audited, versioned JSON export:

- `tickets`;
- `replies`;
- `attachments` с metadata/object references;
- `status_events`;
- стабильные user/org references, UUID и timestamps.

Экспорт streaming/no-store, только через явную global-support capability. Он не публикуется наружу и не
синхронизируется с иностранным SaaS. Будущий Zammad разворачивается в РФ либо проходит отдельный
localization/legal gate.

## 4. Доступ и изоляция

- Пациент видит и дополняет только свои обращения.
- Любой сотрудник клиники, включая clinic owner/admin, в первом срезе видит и дополняет только собственные
  обращения. Просмотр обращений коллег не разрешён без отдельного решения владельца.
- Global admin видит все обращения только через отдельный admin port/capability. `adminMode`, подложенный
  `organizationId` и фиктивное membership не дают такого доступа.
- Каждый direct-ID endpoint повторно проверяет actor + ticket ownership.
- Таблицы регистрируются в текущей RLS descriptor/tier модели; generic raw policy не изобретается.
- Запрещены patient joins и переходы из тикета в медицинскую карточку.
- В audit/log/notification не попадают body, email, вложения или медицинский текст.
- Отдельная support-role в будущем получает tickets-only capability без clinical access.

## 5. Поверхности

### 5.1 Пользователь

- Существующая `/app/patient/support` становится созданием/списком/деталью собственных тикетов.
- Для clinic staff добавляется вход в поддержку из существующей management-поверхности; второй support engine
  не создаётся.
- На каждой форме остаётся явный текст: «Здесь помогают пользоваться платформой. Вопросы о здоровье,
  симптомах и лечении задавайте врачу в кабинете».
- Гостевой `/api/public/support` отключается; `/app/contact-support` после входа ведёт в ролевую support-
  поверхность, без публичной отправки сообщения.

### 5.2 Global admin

- `/app/admin/support` — очередь, фильтр по статусу, организация/автор, непрочитанное, последнее обновление;
- `/app/admin/support/[ticketId]` — история, ответ, `waiting_for_requester/resolved`, вложения, audit/export;
- существующий `/app/admin/clinics/[organizationId]` может ссылаться на отфильтрованные тикеты организации;
- отдельный login/runtime/helpdesk shell не создаётся.

## 6. Уведомления

- События: `new_support_ticket` и `support_ticket_reply`.
- В #1070 добавляется узкий typed `SupportNotificationPort`: он переиспользует существующие transport adapters
  и загрузку адресатов, но сам владеет двумя support-событиями и их обычной конфигурацией каналов. Несуществующий
  общий product-topic registry не предполагается и не становится скрытой зависимостью.
- Для владельца начальный выбор — его email + messenger; адресаты и разрешённые каналы берутся из
  редактируемой admin-конфигурации, а не hardcode.
- В payload только фиксированный server-side текст, номер обращения, тип события и внутренний deep link.
  Пользовательские `title`, `body`, email и имена файлов отсутствуют.
- Outbox/idempotency после commit; retry доставки не повторяет создание тикета.
- In-app badge дополняет, но не заменяет выбранные каналы.
- Текущий `dispatchOperatorAlert({ block: 'support' })` из product-support пути удаляется: emergency fallback
  к обычному тикету неприменим.

## 7. Этапы исполнения

### Блокирующий gate перед DB/RLS-частью

Новые таблицы, RLS/grants, descriptor/tier artifacts и их DB-проверки **не начинаются**, пока не завершён
отдельный аудит ролей/стен, не стабилизирована схема БД и владелец явно не дал GO. До этого разрешены только
DB-free domain/port/route design и тесты авторизации на независимых in-memory adapters; они не считаются
доказательством RLS. Этот gate следует действующему test-authoring freeze и не обходится fake/shared-DEV
проверками.

### Этап 1 — durable domain и DB ports

- [ ] Добавить Drizzle schema/migration для tickets, replies, attachments и status events с горячими индексами
      по `organization_id`, requester, status/`updated_at`, ticket/`created_at`.
- [ ] Зарегистрировать новые таблицы в существующей tier/RLS descriptor модели и сгенерировать обязательные
      артефакты штатным репозиторным способом.
- [ ] Добавить typed domain/ports/repository: create, list, direct read, reply, transition, reopen, export.
- [ ] Доказать deny-by-default и patient/staff/clinic-admin/global-admin A/B matrix узкими route/port тестами.
- [ ] Добавить typed `SupportNotificationPort`, обычную admin-конфигурацию адресатов/каналов и adapters поверх
      существующих email/messenger transports без emergency fallback.

### Этап 2 — переключить существующие формы

- [ ] Перевести `/api/patient/support` на durable ticket create.
- [ ] Добавить authenticated clinic-management entry без второго support engine.
- [ ] Удалить guest submission из `/api/public/support`; сохранить только безопасную навигацию к входу.
- [ ] После DB commit отправлять обычное `new_support_ticket`; ошибка доставки не откатывает тикет.
- [ ] Удалить bounded `operator_job_status` fallback после доказательства отсутствия callsites.

### Этап 3 — admin queue и ответы

- [ ] Добавить `/app/admin/support` и `/app/admin/support/[ticketId]` в существующий admin shell.
- [ ] Добавить reply/status/read endpoints под отдельной global-support capability.
- [ ] Добавить обычное уведомление requester о реплике и unread badge.
- [ ] Добавить audit create/reply/status/reopen/read/export без содержимого обращения.

### Этап 4 — вложения, экспорт и retirement

- [ ] Подключить ограниченные вложения через существующий media/storage port.
- [ ] Добавить versioned JSON export и тест round-trip mapping к ticket/article/attachment/status.
- [ ] Удалить/запретить внешний `t.me` в `support_contact_url` и UI; внутренние support-ссылки ведут в
      authenticated flow.
- [ ] После решения владельца добавить retention/purge job, expiry вложений/backups и evidence уничтожения.

### Этап 5 — интеграционная приёмка

- [ ] Patient: create → admin sees → admin reply → patient sees → resolved → requester reply reopens.
- [ ] Clinic A/B: requester видит только собственные обращения; нет coworker/cross-tenant
      read/count/direct-ID.
- [ ] Global admin: list/detail/reply/status/export; doctor/clinic-admin получают deny на admin routes.
- [ ] Notification failure injection: тикет сохранён один раз, retry не дублирует его.
- [ ] TEST-only live pass; PROD не затрагивается.

## 8. Проверки и merge gate

- На каждом этапе — только названные unit/route/port проверки, scoped lint и typecheck.
- После явного снятия gate из §7 DB/RLS изменения проверяются существующим generator/regression gate и
  разрешённым targeted PostgreSQL proof; до этого DB-free тесты не выдают за RLS-доказательство. Ручные
  изменения TEST/DEV не используются.
- Один независимый security/behavior audit всего пакета ищет только неработающий код, достижимую уязвимость,
  data loss/corruption или прямое нарушение этого плана.
- После завершения всех этапов — один полный `pnpm run ci` через общий test-port; затем немедленное
  merge/push в `feat/doctor-ui-rebuild`.
- TEST deploy/live acceptance — отдельным разрешённым шагом. PROD запрещён.

## 9. Не входит

- существующие `support_conversations*`, patient↔doctor messaging и рассылки;
- отдельный helpdesk runtime/login, внешний SaaS или зарубежное хранение;
- clinical/patient-card navigation для global admin;
- SLA, priority, routing/assignment engine, categories и live chat;
- финальная отдельная support-role;
- произвольный HTML/Markdown в сообщениях.

## 10. Основание модели

- Zammad API разделяет
  [tickets](https://docs.zammad.org/en/latest/api/ticket/index.html),
  [articles/replies](https://docs.zammad.org/en/latest/api/ticket/articles.html) и
  [states](https://docs.zammad.org/en/latest/api/ticket/states.html); поэтому наша переносимая схема не
  имитирует внутренности конкретного продукта, а сохраняет эти базовые сущности и стабильные identifiers.
- Официальный [Zammad migration guide](https://docs.zammad.org/en/latest/migration/index.html) имеет готовые
  импортеры только для ограниченного списка систем; для своей схемы всё равно нужен REST adapter. Версионированный
  экспорт уменьшает будущую работу лучше, чем подключение ещё одного промежуточного helpdesk.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
  требует deny-by-default и проверки разрешения на каждом запросе; поэтому list и каждый direct-ID endpoint
  имеют независимую server-side ownership проверку.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  требует аудит административного доступа/экспорта и исключение чувствительных данных из логов; body и
  вложения остаются только в защищённом ticket storage.
- Локализация и уничтожение задаются действующим 152-ФЗ и
  [приказом Роскомнадзора №179](https://publication.pravo.gov.ru/Document/View/0001202211290008);
  vendor-default не заменяет выбранный владельцем срок и доказательство удаления.
