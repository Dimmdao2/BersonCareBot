> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# NTF-01 — App push and messenger auth-only boundary

> **ВЫТЕСНЕНО ТОЛЬКО: push-only топология каналов. Остальное действует.** Читать перед §3.
>
> **SUPERSEDED AS TARGET — 2026-07-27:** владелец отменил не только три клетки, но и саму жёсткую форму channel matrix и push-only target ниже; полный заменяющий канон — §21–§25. Точка входа: строка **«Уведомления»** в [`CURRENT_AUTHORITY_MAP.md`](../../../CURRENT_AUTHORITY_MAP.md).
>
> Владелец дал прямые указания, которые ОТМЕНЯЮТ три клетки матрицы §3. Источник и дословные цитаты —
> [`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §15](../../../ARCHITECTURE/OWNER_PRODUCT_RULES.md)
> (сообщение `#2817`, с пометкой «повторяю уже много раз, прекрати переспрашивать, просто делай»).
>
> | Клетка §3                                                     | Было в NTF-01 | СТАЛО по указанию владельца 27.07                                                                            |
> | ------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
> | `broadcast_event` → Telegram/MAX                              | нет           | **да, с полным открытым текстом.** «Текст в рассылке НЕ прячем и НЕ маскируем — это не медицинские данные.»  |
> | `broadcast_event` → Email/SMS                                 | нет           | **да, с полным открытым текстом**, по той же причине                                                         |
> | `conversation_event` / `routine_product` → Telegram **врача** | нет           | **да, но ТОЛЬКО два уведомления**: «сообщение от пациента» и «новая запись». Текст переписки туда не уходит. |
>
> **Что НЕ отменено и продолжает действовать полностью:** default-deny для всего неперечисленного;
> запрет на generic relay как лазейку (§«Generic email or messenger relay never becomes a template escape
> hatch»); привязка каждого потока к КОНКРЕТНОМУ template/class, а не выдача разрешения классу целиком;
> вся матрица §4 (что можно показывать в тексте); запрет на raw chat preview.
>
> **Почему различие такое, словами владельца:** прячем СОДЕРЖАНИЕ ПЕРЕПИСКИ О ЗДОРОВЬЕ, а не всё подряд.
> Рассылка — это объявление клиники, а не переписка о здоровье пациента.
>
> **Живое следствие, обнаружено 2026-07-27:** N1 (default-deny) приземлился 2026-07-21 коммитом `671ac2127`,
> а N3 (выдача каждому потоку его метки) НЕ НАЧИНАЛСЯ. Поэтому сегодня привратник отправки пропускает наружу
> только web push, коды подтверждения и операторские алерты, а **15 из 19 продуктовых потоков отправки
> недоставляемы**: рассылки врача, подтверждения записи, приглашения сотрудников, уведомления врачу,
> ответы врача пациенту. Доказано живьём: приглашение сотрудника получило `403` в
> `2026-07-27T16:41:58+03`. Это ровно тот незакрытый пункт, что стоит ниже строкой
> «Ни один product runtime path не отправляет Telegram/MAX/email/SMS».

> ## 🔴 ПРАВКА 2026-07-27 (вторая) — все 38 открытых пунктов размечены, ни один не оставлен пустым
>
> **Было:** после отмены push-only/messenger-auth-only target'а (см. блок выше) 38 боксов ниже (N1B1, N2, N3-slice,
> N4, N5, N6, N7, Definition of Done) остались открытыми `- [ ]` без разбора — часть из них прямо противоречит
> новому решению владельца, часть переживает его без изменений, ни одна из них сегодняшними коммитами
> (`fcd956395`, `d99c72d9d`, `e1c6f62a1`, `298c025d7`) целиком не закрыта.
>
> **Стало:** каждый из 38 пунктов размечен инлайн одним из трёх исходов — `ВЫТЕСНЕНО` (противоречит §15/§21–§28,
> вычёркивается с сохранением дословного текста), `ПЕРЕЖИВАЕТ` (остаётся `- [ ]`, с однострочной причиной почему
> требование живо), либо `[x]` с доказательством, если найдено. Разметка — канон
> `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3.
>
> **Почему:** владелец, 27.07, дословно — «Открытые пункты NTF-01 - значит пометить что решения изменены, не
> оставлять пустыми.»

> ## ✅ OWNER-GATE ЗАКРЫТ 04.08.2026 — статус больше НЕ `owner_gated`
>
> Владелец 04.08, дословно: «мед данные не отправляем - но уведомляем, коды отправляем, сообщения о записи на
> прием и рассылки - полным видом». И отдельно, о том, что этап числился ждущим его ответа: «чего блять ждет
> уже сто раз все ответил».
>
> **Правило, по которому строим:**
>
> | что отправляем наружу (push, Telegram, MAX, SMS, почта) | как |
> | --- | --- |
> | медицинские данные | **не отправляем вообще** |
> | уведомление о том, что что-то есть | отправляем |
> | коды входа | отправляем |
> | сообщения о записи на приём | **полным видом** |
> | рассылки | **полным видом** |
>
> То есть граница проходит не по «всё наружу урезаем до сигнала», а по **типу содержимого**: медицинское —
> никогда; запись на приём, коды и рассылки — целиком, без урезания. Уведомить о наличии медицинских данных
> можно, но сами данные остаются в приложении.
>
> ⛔ Прежняя формулировка этапа («provisional class/tier matrix ждёт пакета `MOB-O9` acceptance») **снята**:
> решение владельца получено и оно выше любой промежуточной матрицы. Матрицы §3/§4 привести в соответствие с
> этой таблицей; расхождение матрицы с ней — дефект матрицы, а не повод переспрашивать.

Статус: `owner_gated`; N0, N1, N1A и N1B0 repository slices закрыты 2026-07-21. N1B1 выполняется позже внутри
соответствующих N3 family children после единого owner field-matrix gate `#913`; editor foundation не означает adoption/send cutover.
Текущий runtime всё ещё многоканальный до N3/N4/N6 cutover.

## Цель

> **SUPERSEDED AS TARGET — 2026-07-27.** Цель auth-only/push-only ниже — исторический stage scope; актуальная topology/content policy дана строкой **«Уведомления»** в карте authority (§21–§25).

Отделить аутентификацию от продуктовых коммуникаций:

- Telegram/MAX: только login/bind code и минимальный auth handshake;
- product reminders/notifications: in-app source of truth + push;
- browser/PWA transport: существующий Web Push до отдельного retirement decision;
- native transport: APNs/FCM через [`NATIVE_MOBILE_APP_INITIATIVE`](../../NATIVE_MOBILE_APP_INITIATIVE/README.md);
- отсутствие push target не включает скрытый fallback в messenger/email/SMS.

Этап не требует делать каждый push бессодержательным. Он вводит контролируемую матрицу: полезные routine details
разрешены, произвольный clinical/free-text payload остаётся внутри авторизованного приложения.

## 1. Зафиксированное owner ruling (`G-15`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **SUPERSEDED AS TARGET — 2026-07-27.** Ruling ниже заменён последующими §21–§25; не исполнять его как закрывающую policy.

- Telegram/MAX не являются notification/inbox/support surface.
- Разрешены только: запрос/получение одноразового кода, contact step для привязки, отмена auth flow и короткая
  ссылка «открыть приложение» без token/clinical context.
- Mini Apps, свободная переписка, bot menu, reminder/booking/program callbacks, admin replies и рассылки выводятся.
- Все продуктовые reminders/notifications идут через push приложения. Пока native app не готов, существующий Web
  Push является migration transport, но не повод сохранять messenger fallback.
- Полностью обезличивать каждый push не требуется: пользователь должен видеть разумный полезный контекст.

Engineering safe default до exact `MOB-O9`: Email/SMS не используются как fallback product reminders; invitation,
access recovery, receipt/fiscal, contract/legal/export/deletion и operator/security monitoring классифицируются
отдельно. Точные allowlists и field-level preview rules агент приносит владельцу одним пакетом после `N0` census.

## 2. Current-state baseline

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Read-only audit 2026-07-19 подтвердил:

- `notifyPatientDoctorReply.ts`: doctor reply fan-out в Web Push, Telegram, MAX и email; messenger preview до 500,
  email до 2000, push до 120 символов;
- `notifyDoctorPatientMessageToStaff.ts`: staff default `web_push + telegram + max`; сообщение/комментарий содержит
  patient label и preview;
- integrator reminders/booking lifecycle всё ещё создают Telegram/MAX sends; часть booking push связана с успешным
  messenger job и не создаётся при отсутствии messenger target;
- broadcasts, specialist tasks, online intake и public/patient support имеют messenger/email/SMS paths;
- bot support relay, reply callbacks, menus, booking/reminder scripts и mini-app auth/product surfaces активны;
- Web Push subscriptions/VAPID/topic preferences/in-app chat+notification inbox и delivery attempts уже существуют;
- native APNs/FCM targets, mobile sessions и Capacitor package отсутствуют.

Текущий runtime-канон до cutover:
[`docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`](../../../ARCHITECTURE/NOTIFICATION_CHANNELS.md). Он описывает факт,
а этот stage — целевую миграцию; документы синхронизируются с runtime только в `N7`.

## 3. Матрица message classes и каналов

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **SUPERSEDED AS TARGET — 2026-07-27.** Заменена не только отдельная клетка, но и жёсткая shape этой матрицы: каналы вычисляются по §21, content — §2/§15/§22, DEV/TEST filter — §23. См. строку **«Уведомления»** в карте authority.

| Class                | Примеры                                                       |           In-app |             App push | Telegram/MAX |                                                                                    Email/SMS |
| -------------------- | ------------------------------------------------------------- | ---------------: | -------------------: | -----------: | -------------------------------------------------------------------------------------------: |
| `auth_code`          | login/bind OTP, contact handshake                             |               да |                  нет |       **да** |                                              существующие email auth/recovery flows отдельно |
| `routine_product`    | запись, перенос, отмена, обычный reminder, quota/trial status |           **да** |               **да** |          нет | Email только для exact appointment-reminder template; exercise reminder — push only; SMS нет |
| `conversation_event` | новое сообщение, program note, intake reply                   |           **да** |               **да** |          нет |                    Email только как neutral event notice без body/ФИО/clinical text; SMS нет |
| `broadcast_event`    | врачебная рассылка                                            |           **да** |               **да** |          нет |                                                                                          нет |
| `account_service`    | invite, reset, receipt, договор, export/deletion notices      |       по событию |            по policy |          нет |                                                                          **да по allowlist** |
| `operator_security`  | provider outage, security incident, health alert              | admin/monitoring | по принятому contour |          нет |                                                               отдельный monitoring allowlist |

> **SUPERSEDED AS TARGET — 2026-07-27.** Этот default-deny для messenger/email/SMS заменён §21–§23; historical guard не является целевым разрешением или запретом.

Новый/неизвестный class = default deny для messenger/email/SMS. Allowlist хранится централизованно в typed policy,
а не размножается по feature modules.

Owner ruling 2026-07-21: разрешённые email rows выше являются event/template-level allowlist, а не общим
разрешением class или generic relay. Appointment email может содержать дату/время, специалиста и место/`Онлайн`;
exercise push остаётся общим; message/comment email и push сообщают только факт нового события. Реализация этих
builders относится к соответствующим N3 children; N1 вводит typed vocabulary и default-deny boundary, но не
изобретает до N3 новый generic sender/template API.

## 4. Матрица текста push — engineering safe default до `MOB-O9/G-04B`

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Tier                     | Что можно показать                                                                            | Что нельзя автоматически подставлять                                                               | Default copy                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `T0 public/general`      | общий news/product text                                                                       | secrets/tokens/PII in URL                                                                          | полезный полный короткий текст                                     |
| `T1 transactional`       | дата/время записи, отмена/перенос, payment/subscription/trial status, сумма при необходимости | payment credentials, телефон, email, token                                                         | конкретный статус и действие                                       |
| `T2 controlled product`  | generic training/warmup copy, notification-safe broadcast/reminder title                      | диагноз, symptom/test value, internal clinical field                                               | полезный title + короткий context                                  |
| `T3 arbitrary sensitive` | факт события, sender role/безопасный short label                                              | raw chat, complaint, intake summary, diagnosis, note, task free text, filename, attachment preview | «Новое сообщение от специалиста» / «Новый комментарий к программе» |

Правила:

- существующие appointment date/time и generic warmup/training copies допустимы;
- broadcast title допустим, если author UI явно маркирует его как notification preview;
- raw chat preview по умолчанию выключен. Будущая настройка `show_notification_previews` может включить короткий
  preview только после `G-04B`/privacy review; отсутствие настройки не блокирует полезные `T0–T2` details;
- push payload — не canonical data store; tap делает authenticated fetch;
- route/deep link allowlisted и не содержит ФИО, телефон, диагноз, message text, presigned URL или auth token.

Эта матрица является рекомендуемым безопасным baseline агента, а не приписанным владельцу дословным решением.
После `N0` census владелец одним пакетом принимает/корректирует exact event/field rows; общий принцип «полезный
push без blanket masking» повторно не открывается.

## 5. Этапы исполнения

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### N0 — census, contracts and exact manifests (`AI`, executable now docs/read-only)

- [x] Построить source-backed producer → resolver → queue → dispatch → provider → canonical in-app map ниже. (✓ census map §N0 below; cited sources exist e.g. apps/webapp/src/modules/messaging/relayOutbound.ts)
- [x] Для каждого path записать current channels, copied fields, queue/log/attempt facts, tests и replacement source. (✓ required-family census table below; e.g. apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts)
- [x] Зафиксировать provisional class/tier matrix: она является engineering safe default и ждёт одного пакета
      `MOB-O9` acceptance; `G-15` не переоткрывается, `G-04B` остаётся правовым gate. (✓ §3/§4 matrices in-doc)
- [x] Выявить pending legacy row kinds и direct-provider surfaces для отдельного controlled cutover. (✓ direct-provider/pending-row inventory below; apps/integrator/src/infra/db/repos/jobQueue.ts)
- [x] Описать exact non-overlapping N1/N3 child manifests. Это предложения для orchestrator triage, не новые
      taskdb items и не расширение `#751/#844/#845`. (✓ child-manifest table §N0 in-doc)

#### N0 method, scope and status vocabulary

This is a repository-only audit at `c610c11ed`. `codeq` was attempted first but its semantic backend reported
`no DSN (secrets/storage.env)`; lexical `code-search` plus scoped exact searches and targeted reads supplied the
repository evidence below. No provider, DB, host, environment, queue, live log or send was read. A referenced
adapter is a repository fact, **not** evidence that it is enabled or active in PROD.

`covered` means the present repository path was traced; `active_dependency` means a traced current path still has a
cutover dependency; `executable_now` applies only to the proposed docs/code child after triage; `owner_or_legal_gate`
means no agent decision or send; `prod_host_later` means a later approved drain/rollout only. No required family is
`unclassified`.

#### Current egress spine and retained-copy facts

- **Inline relay spine:** product code commonly calls
  `apps/webapp/src/modules/messaging/relayOutbound.ts`, which retries M2M submission at `0s/10s/60s/5m` and uses its
  organization/message/channel/recipient idempotency key. Integrator `relayOutboundRoute.ts` and
  `apps/integrator/src/infra/adapters/dispatchPort.ts` select a channel adapter. The dispatch layer logs
  `delivery.attempt.log`; except for the OTP redaction branch it currently passes the intent payload to that log.
  Provider adapter evidence is in `apps/integrator/src/integrations/telegram/deliveryAdapter.ts`,
  `apps/integrator/src/integrations/max/deliveryAdapter.ts` and
  `apps/integrator/src/integrations/web-push/deliveryAdapter.ts`;
  email/SMS are also accepted channel vocabulary in `sendUnified.ts`. Retention/cleanup policy is **not established
  by this census** and remains `LOG-01/N6` work.
- **Durable queue spine:** `public.outgoing_delivery_queue` is written through
  `apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts` (`event_id` unique; `pending → processing → sent |
failed_retryable | dead`). `outgoingDeliveryWorker.ts` claims due rows, dispatches their intent and records
  messenger attempts in `notification_delivery_attempts`; retry delay is `60/300/900/3600` seconds, stale processing
  resets after about ten minutes. Source-backed queue kinds are `reminder_dispatch`, `doctor_broadcast_intent` and
  `operator_alert`; the worker also accepts legacy payloads. Its tests and the repo tests named in the family rows
  prove code behaviour, not a live queue count or retention period.
- **Legacy booking retry spine:** booking 24h/2h reminders separately write `message.deliver` rows to
  `integrator.message_retry_jobs` through `jobQueue.ts`. A row retains normalized recipient reference,
  rendered message text, next-run time, attempt counters/limit, status (`pending → processing → done | dead`), last
  error and the payload containing intent, Telegram/MAX targets, booking reference and optional Web Push follow-up.
  `jobQueuePort.ts` claims/maps rows and `jobExecutor.ts` selects the target for the current attempt, calls the same
  dispatch chokepoint and only then calls the Web Push follow-up; the booking producer configures two attempts and a
  60-second retry. This is repository behaviour only: this census did not query whether any such row exists.
- **Existing canonical in-app sources:** `support_conversation_messages` is canonical for 1:1 chat, program replies,
  broadcasts and appointment lifecycle (`docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md`); reminder occurrences and
  specialist task records are their respective canonical objects. There is no evidence in this audit of a canonical
  in-app object for public support, intake-to-staff alert, account service, or operator/security alert.

#### Required-family census — current repository fact versus target policy

Each row names current copied fields only at a category level, never values. `Class/tier` is the target safe-default
classification for N1/N3, not proof that current code enforces it.

| Family                                                                | Current producer → resolver/queue → dispatch/provider; canonical in-app source                                                                                                                                                                                                                                                                                                                                                                                                            | Current copied content / route; target class and tier                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Attempts, tests, cutover hazard; status and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient ↔ specialist chat (doctor → patient)                          | `doctorSupportMessagingService.sendAdminReply` persists the reply, then `notifyPatientDoctorReply.ts` resolves patient preferences and sends inline relay legs (`web_push`, Telegram, MAX, email). Canonical: `support_conversation_messages` / `/app/patient/messages`.                                                                                                                                                                                                                  | Current messenger preview is normalized reply text (500 chars), email body up to 2000, Web Push body from the message; route is messages. Target `conversation_event`, `T3`: neutral sender/event copy, authenticated fetch after tap.                                                                                                                                                                                                                                                                             | Relay retry/idempotency above; tests: `notifyPatientDoctorReply.test.ts`, `resolveNotificationChannels.test.ts`. Hazard: no queue drain protects already accepted inline relay requests; current raw-text copies are messenger-coupled. `covered`; `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`, `apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts`, `apps/webapp/src/modules/messaging/relayOutbound.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Patient → specialist chat                                             | Patient-message write triggers `notifyDoctorPatientMessage.ts` → `notifyDoctorPatientMessageToStaff.ts` → staff topic resolver and inline relay. Canonical incoming message is `support_conversation_messages`.                                                                                                                                                                                                                                                                           | Current staff payload includes patient label, message preview, title/body, route and optional reply markup; channels default to Web Push + Telegram + MAX. Target `conversation_event`, `T3`; route only to staff inbox/client conversation.                                                                                                                                                                                                                                                                       | Tests: `notifyDoctorPatientMessageToStaff.test.ts`, `resolveDoctorNotificationChannels.test.ts`; relay retry/idempotency applies. Hazard: reply markup and message text survive to bots. `covered`; `apps/webapp/src/modules/messaging/notifyDoctorPatientMessage.ts`, `apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Program notes/comments (both directions)                              | Patient note uses `notifyDoctorPatientProgramNote.ts` → same staff fanout; clinician reply uses `sendProgramNoteReply.ts` / `notifyPatientDoctorReply.ts`. Canonical thread/message is the support conversation; program item remains linked domain data.                                                                                                                                                                                                                                 | Current staff/patient payload can include item label, patient label and free-text note/reply; chat route. Target `conversation_event`, `T3`, neutral “new program comment/reply”.                                                                                                                                                                                                                                                                                                                                  | Tests: `notifyDoctorPatientProgramNote.test.ts`, `notifyPatientDoctorReply.test.ts`. Hazard: legacy bot callback `program_reply:*` and raw preview must be drained/disabled only after in-app replacement. `covered`; `apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts`, `apps/webapp/src/modules/messaging/sendProgramNoteReply.ts`, `apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Patient reminders / warmups                                           | Legacy integrator scheduler `handlers/reminders.ts` creates `reminder_dispatch` Telegram/MAX queue rows. Separately `webPushOnlyScheduler.ts` claims reminder occurrences and `platformUserReminderWebPushNotify.ts` relays Web Push. Canonical: reminder rule/occurrence and linked treatment object.                                                                                                                                                                                    | Current legacy queue has occurrence id, channel, target, log text and messenger keyboard/deep link; Web Push uses generated warmup/training/custom copy and allowlisted route. Target `routine_product`, `T2` (generic warmup/training); arbitrary custom clinical text is `T3` neutral.                                                                                                                                                                                                                           | Queue retries/attempts above; Web Push skipped attempts include muted/no subscription; tests: `handlers/reminders*.test.ts`, `webPushOnlyScheduler.test.ts`, `platformUserReminderWebPushNotify.test.ts`. Hazard: pending `reminder_dispatch` Telegram/MAX rows and callbacks cannot be blindly replayed; schedule has two delivery paths. `active_dependency`; `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`, `apps/webapp/src/modules/reminders/webPushOnlyScheduler.ts`, `apps/webapp/src/modules/reminders/platformUserReminderWebPushNotify.ts`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Specialist tasks/reminders                                            | Task scheduler calls `notifySpecialistTaskReminder.ts`; resolver reads doctor setting/topic prefs and emits Telegram, MAX, email and Web Push relay. Canonical: specialist task record; no separate in-app notification row was found.                                                                                                                                                                                                                                                    | Current text includes task title, optional patient label and due date; deep link is task/client task section. Target `routine_product`, `T3` for title/free text and patient label; neutral task reminder plus route.                                                                                                                                                                                                                                                                                              | Inline relay retry/idempotency; tests: `notifySpecialistTaskReminder.test.ts`, `resolveSpecialistTaskReminderChannels.test.ts`. Hazard: `sent` can mean any legacy channel and no-target does not yet establish canonical unread state. `covered`; `apps/webapp/src/modules/specialist-tasks/notifySpecialistTaskReminder.ts`, `apps/webapp/src/modules/doctor-notifications/resolveSpecialistTaskReminderChannels.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Booking create/cancel/reschedule / 24h/2h / payment lifecycle         | Integrator `bookingLifecycleRoute.ts` creates lifecycle intents and separately enqueues each 24h/2h `message.deliver` job in `integrator.message_retry_jobs`; `jobQueuePort.ts` claims it and `jobExecutor.ts` dispatches Telegram/MAX before its Web Push follow-up. Webapp `patientWebPushNotify.ts` appends lifecycle notification records and relays Web Push. Canonical lifecycle is `support_conversation_messages` (`source=appointment_lifecycle`); appointment is linked object. | Current lifecycle/reminder copy includes patient label and date/time. The legacy row also retains normalized phone, rendered message, Telegram/MAX targets, booking/reminder code and Web Push follow-up fields. Booking confirmation email includes service/location and `.ics`; payment-captured is declared in `bookingLifecycleNotifications.ts`. Target `routine_product`, `T1` for date/time/status/payment amount only after exact matrix; no credentials; route `/app/patient?notifications=1` or booking. | Legacy job state is `pending/processing/done/dead`, with next-run time, last error, two attempts and 60-second retry; queue/executor tests plus `bookingLifecycleRoute`, `patientWebPushNotify` and booking-email tests cover code behaviour. Hazard: 24h/2h push is coupled to messenger target/job success; pending `message.deliver` booking rows and `reminder_dispatch` rows must not replay to messenger; email receipt/confirmation is service allowlist, never fallback. `active_dependency`; `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`, `apps/integrator/src/infra/db/repos/jobQueue.ts`, `apps/integrator/src/infra/adapters/jobQueuePort.ts`, `apps/integrator/src/infra/runtime/worker/jobExecutor.ts`, `apps/webapp/src/modules/patient-notifications/patientWebPushNotify.ts`, `apps/webapp/src/modules/patient-booking/sendBookingConfirmationEmail.ts`, `apps/webapp/src/modules/patient-booking/bookingLifecycleNotifications.ts`. |
| Broadcasts                                                            | `doctor-broadcasts/service.ts` first appends per-recipient canonical notification messages, builds `doctor_broadcast_intent` queue jobs for Telegram/MAX/SMS, and independently runs `fanOutBroadcastWebPush.ts`.                                                                                                                                                                                                                                                                         | Current queue payload contains broadcast text/image/menu/recipient refs; Web Push uses broadcast title and notification route. Target `broadcast_event`, `T2` only for author-marked preview title; body/free text is `T3` neutral.                                                                                                                                                                                                                                                                                | Queue retry/dedup/attempt facts above; tests: `doctor-broadcasts/service.test.ts`, `doctor-broadcasts/deliveryJobs.test.ts`. Hazard: pending `doctor_broadcast_intent` rows (including SMS) and bot menu must be cancel/archive metadata-only during cutover. `covered`; `apps/webapp/src/modules/doctor-broadcasts/service.ts`, `apps/webapp/src/modules/doctor-broadcasts/deliveryJobs.ts`, `apps/webapp/src/modules/doctor-broadcasts/fanOutBroadcastWebPush.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Online intake                                                         | `online-intake/service.ts` writes the request then calls `intakeNotificationRelay.ts`, which resolves configured admin/doctor Telegram/MAX ids and relays inline. A reply can use the existing support conversation service.                                                                                                                                                                                                                                                              | Current alert copies patient name, summary and intake-card deep link. Target `conversation_event`, `T3`, neutral “new intake request”; canonical request exists but no canonical staff notification/inbox record was evidenced.                                                                                                                                                                                                                                                                                    | Relay retry/idempotency applies; tests: `online-intake/service.test.ts`, `online-intake/intakeNotificationRelay.test.ts`. Hazard: current notification targets are global configured messenger ids and source text is sensitive. `covered`; `apps/webapp/src/modules/online-intake/service.ts`, `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Public and patient support                                            | `app/api/public/support/route.ts` and `app/api/patient/support/route.ts` construct a detailed Telegram body and relay it inline. Patient support has a session but this route does not establish a canonical support conversation before egress.                                                                                                                                                                                                                                          | Current payload includes contact/identity/context/device metadata and raw support text; no safe product deep link. Target `conversation_event`, `T3`; first create/reuse the existing admin/support inbox (`#808/U9`), then neutral alert.                                                                                                                                                                                                                                                                         | In-memory rate limit + relay retry; tests: `public/support/route.test.ts`, `patient/support/route.test.ts` where present. Hazard: direct Telegram surface leaks the widest field set and has no queue drain. `active_dependency`; `apps/webapp/src/app/api/public/support/route.ts`, `apps/webapp/src/app/api/patient/support/route.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Account invites / recovery / receipts / contracts / export / deletion | Invite/auth code producers use `patient-invites/service.ts`, `auth/emailAuth.ts` and `auth/emailSendPort.ts`; booking receipt/confirmation uses the email path above. Scoped read found no implemented outbound producer for contract, export or deletion notices.                                                                                                                                                                                                                        | OTP/code is `auth_code` (T3 secret, never preview/URL). Invite/recovery/receipt/contract/export/deletion are `account_service`; exact email/SMS allowlist and fields are open. Receipt may be `T1`; all token/file/link/contract/export/deletion content remains `T3` until `MOB-O9`.                                                                                                                                                                                                                              | Tests: `patient-invites/service.test.ts`, `auth/emailAuth.test.ts`, `auth/emailOtpPublic.test.ts`, booking email tests. Hazard: do not misclassify email service notices as product fallback; absent producers must not be invented in N1. `owner_or_legal_gate` for the service matrix; evidence `apps/webapp/src/modules/patient-invites/service.ts`, `apps/webapp/src/modules/auth/emailAuth.ts`, `apps/webapp/src/modules/auth/emailSendPort.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Operator/security alerts                                              | `operator-alerts/dispatchOperatorAlert.ts` deduplicates for 24 hours, relays Telegram/MAX and, with org scope/runtime deps, uses staff Web Push. Integrator operator incidents can enqueue `operator_alert`. No end-user canonical in-app source was found.                                                                                                                                                                                                                               | Current lines are clipped but can contain operational detail; title/body/technical route supplied to push. Target `operator_security`, `T3` unless an approved non-sensitive operational class; replacement contour is owner-selected monitoring/admin inbox.                                                                                                                                                                                                                                                      | Queue retry/dedup/attempt facts where queued; tests: `operator-alerts/dispatchOperatorAlert.test.ts`, `infra/operatorIncident/reportOperatorFailure.test.ts`. Hazard: global alerts have no synthetic tenant and messenger relay remains current. `active_dependency`; `apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.ts`, `apps/integrator/src/infra/operatorIncident/reportOperatorFailure.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Auth/login/bind handshake                                             | Auth routes/modules (`phoneAuth.ts`, `phoneMessengerBind.ts`, email auth and channel-link flows) create purpose-bound OTP/contact/bind interactions; dispatch ultimately uses the same relay/adapter spine or email port. Canonical state is auth challenge/session/binding, not a product inbox.                                                                                                                                                                                         | Code/contact step/cancel/open-app only; no token in URL. Target `auth_code`, `T3` secret; permitted messenger exception under `G-15`.                                                                                                                                                                                                                                                                                                                                                                              | OTP-specific log sanitisation in `dispatchPort.ts`; tests include `phoneAuth.test.ts`, `phoneMessengerBind.test.ts`, `authFlow.integration.test.ts`, `preferredAuthChannelPolicy.test.ts`. Hazard: mini-app/product callbacks must not be retained under the auth exception. `covered`; `apps/webapp/src/modules/auth/phoneAuth.ts`, `apps/webapp/src/modules/auth/phoneMessengerBind.ts`, `apps/webapp/src/modules/auth/emailAuth.ts`, `apps/integrator/src/infra/adapters/dispatchPort.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

#### Direct-provider and pending-row cutover inventory (read-only)

- **Dispatch choke points:** `apps/integrator/src/infra/adapters/dispatchPort.ts` and
  `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`. Product-facing direct call surfaces are
  `relayOutbound.ts`, `intakeNotificationRelay.ts`, `dispatchOperatorAlert.ts`, public/patient support routes,
  `notifyPatientDoctorReply.ts`, `notifyDoctorPatientMessageToStaff.ts`, and `notifySpecialistTaskReminder.ts`.
  Existing `apps/webapp/src/modules/web-push/sendWebPushToSubscriptions.ts` is a direct Web Push sender surface;
  N1 must prohibit new product-provider bypasses without replacing the established Web Push infrastructure.
- **Rows for later controlled cutover:** `public.outgoing_delivery_queue` kinds `reminder_dispatch`,
  `doctor_broadcast_intent`, `operator_alert`, plus any legacy rows whose
  `payload_json.intent.payload.delivery.channels` selects Telegram/MAX/SMS/email; and
  `integrator.message_retry_jobs` booking-reminder rows with `kind=message.deliver` and
  `payload_json.booking`. This census does not query their presence or count. The later change window must classify
  them as auth allowlist / cancel / archive metadata-only / already-sent; it must never replay product rows to
  messenger. The existing booking-id cancellation path proves a scoped state transition exists, not that a cutover
  has already run.
- **Messenger-coupled push:** booking 24h/2h target construction is messenger-binding dependent; task success is
  channel-aggregated; chat/program note staff fanout carries bot reply markup. These are N3 acceptance failures until
  push is independently resolved from canonical in-app state.

#### Exact child manifests for orchestrator triage (not taskdb creation)

All manifests depend on this census SHA `c610c11ed` and on the N1 integration SHA recorded by its owner. They are
file ownership boundaries, not permission to touch active SaaS/Product UX/billing/FIO/Doctor DNA scope. Each child
must first re-check worktrees, dependency SHA and owner gates; an absent/changed source invalidates the manifest.

| Proposed child                  | Owned files/directories (only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Dependencies and gates                                                                                                                    | Acceptance / risk / PR-00 status                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NTF-N1-egress-policy`          | `apps/integrator/src/infra/adapters/dispatchPort.ts`, `apps/integrator/src/infra/adapters/sendUnified.ts`, `apps/integrator/src/infra/adapters/channelRouting.ts`, `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`, `apps/integrator/src/infra/runtime/worker/doctorBroadcastIntentMenu.ts`, `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts`, and co-located tests                                                                                                                                                                                                             | `c610c11ed`; `G-15 decided`; service allowlists and field matrix remain `MOB-O9`; provider legality `G-04B` does not block topology guard | Typed class/capability reaches both inline and queue dispatch; unknown/product messenger/email/SMS is denied; auth regression and direct-call checker pass; no feature route/UI change. High security risk; `executable_now` after triage.                                                                  |
| `NTF-N3-chat-program`           | `apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts`, `apps/webapp/src/modules/messaging/notifyDoctorPatientMessage.ts`, `apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts`, `apps/webapp/src/modules/messaging/sendProgramNoteReply.ts`, `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`, `apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts`, `apps/webapp/src/modules/doctor-notifications/resolveDoctorNotificationChannels.ts`, `apps/webapp/src/modules/doctor-notifications/doctorTopicChannelDefaults.ts`, and their tests   | accepted N1 SHA; `MOB-O9` exact T3 rows; stable support conversation contract                                                             | Canonical message precedes intent, no bot/email fallback or callback, no-target retains unread state, tenant/dedup/deep-link negative tests. High clinical-content risk; `owner_or_legal_gate` until field acceptance.                                                                                      |
| `NTF-N3-reminders-tasks`        | `apps/webapp/src/modules/reminders/**`, `apps/webapp/src/modules/patient-reminders/**`, `apps/webapp/src/modules/specialist-tasks/**`, `apps/webapp/src/modules/doctor-notifications/resolveSpecialistTaskReminderChannels.ts`, `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`, their tests                                                                                                                                                                                                                                                                                                         | accepted N1 SHA; exact generic warmup/training T2 and task T3 rows; stable org reminders contract                                         | No legacy messenger queue/callback; push no-target is observable and canonical occurrence/task remains; retry/dedup/tenant tests. High data/clinical risk; `owner_or_legal_gate` for task fields.                                                                                                           |
| `NTF-N3-booking-payment`        | `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`, `apps/integrator/src/infra/db/repos/jobQueue.ts`, `apps/integrator/src/infra/adapters/jobQueuePort.ts`, `apps/integrator/src/infra/runtime/worker/jobExecutor.ts`, `apps/integrator/src/infra/runtime/worker/runner.ts`, `apps/webapp/src/modules/patient-notifications/patientWebPushNotify.ts`, `apps/webapp/src/modules/patient-booking/bookingLifecycleNotifications.ts`, `apps/webapp/src/modules/patient-booking/sendBookingConfirmationEmail.ts`, `apps/webapp/src/modules/web-push/pushNotificationCopy.ts`, and their co-located tests | accepted N1 SHA; `MOB-O9` T1 booking/payment matrix; payment/billing owner; later queue drain window                                      | Lifecycle in-app source first; 24h/2h push independent from messenger binding/job success; service email explicitly allowlisted; pending `message.deliver` and outgoing-delivery rows classified/cancelled or archived metadata-only without replay. High financial/scheduling risk; `owner_or_legal_gate`. |
| `NTF-N3-broadcasts`             | `apps/webapp/src/modules/doctor-broadcasts/**` and its tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | accepted N1 SHA; `MOB-O9` broadcast-preview decision; controlled queue drain                                                              | One canonical inbox record per intended recipient, T2 labelled title or T3 neutral copy, no messenger/SMS job/menu; audience/dedup/no-target tests. High fanout risk; `owner_or_legal_gate`.                                                                                                                |
| `NTF-N3-intake-support`         | `apps/webapp/src/modules/online-intake/**`, `apps/webapp/src/app/api/public/support/route.ts`, `apps/webapp/src/app/api/patient/support/route.ts`, their tests                                                                                                                                                                                                                                                                                                                                                                                                                                                          | accepted N1 SHA; reuse `#808/U9` admin/support inbox; `MOB-O9` T3 decision                                                                | Persist/reuse the existing support/inbox source before alert, no global messenger target, no raw intake/support preview, tenant/rate-limit/no-target tests. High sensitive-data risk; `active_dependency`.                                                                                                  |
| `NTF-N3-operator-security`      | `apps/webapp/src/modules/operator-alerts/**`, `apps/webapp/src/modules/admin-incidents/sendAdminIncidentStaffWebPush.ts`, `apps/webapp/src/modules/admin-incidents/adminIncidentAlertConfig.ts`, `apps/integrator/src/infra/operatorIncident/**`, and their tests                                                                                                                                                                                                                                                                                                                                                       | accepted N1 SHA; owner-approved monitoring/admin-inbox contour; `G-04` service-recipient review                                           | No messenger product relay; global-vs-org handling explicit, dedup preserved, payload/log marker-negative tests. High operational/security risk; `owner_or_legal_gate`.                                                                                                                                     |
| `NTF-N3-account-service-matrix` | Docs-only extension of this stage and privacy `LOG.md`; no runtime files until owner acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `MOB-O9`, `G-04`, `G-03` for deletion/export, billing/legal owner for receipt/contract                                                    | One dated allowlist for invite/recovery/receipt/contract/export/deletion; no invented producer and no product fallback. Medium legal risk; `owner_or_legal_gate`.                                                                                                                                           |

Auth/login/bind remains a separately serialized `N4` manifest, owning `apps/webapp/src/modules/auth/**` and the
integrator Telegram/MAX content/auth routes after the N1 SHA. Its acceptance is the minimal `auth_code` allowlist,
no product menu/callback/mini-app surface, OTP redaction and auth regression; it is high identity risk and
`executable_now` only after N1, not an N3 child.

Checks completed for this docs-only N0: every required family is classified; every row has source path, status,
class and tier; no PII/secret values or runtime claims were added. Relative link and path verification plus
`git diff --check` are recorded in the execution log. No test, lint, build, CI, DB/server/network/deploy/send was
run.

### N1 — central egress policy guard (`AI`, after exact dispatch scope)

- [x] Ввести strict typed `OutboundMessageClass/Capability`; product module не передаёт произвольную строку. (✓ apps/integrator/src/kernel/contracts/events.ts:5-24)
- [x] В нижнем integrator dispatch chokepoint Telegram/MAX допускают только `auth_code` и минимальный auth
      handshake allowlist. Ошибка resolver/legacy setting не обходит guard. (✓ apps/integrator/src/infra/adapters/outboundMessagePolicy.ts:66-71; enforced first at dispatchPort.ts:220)
- [x] Email/SMS product delivery default-deny; разрешённые service classes имеют отдельные tests/templates. (✓ outboundMessagePolicy.ts:72-75; sendEmailRoute.test.ts, sendSmsRoute.test.ts)
- [x] Static/runtime checker запрещает product notification → Telegram/MAX/email/SMS и direct provider calls. (✓ apps/integrator/src/infra/adapters/outboundMessagePolicy.static.test.ts)
- [x] Существующий OTP/login/bind regression остаётся зелёным; code/token не логируется и не попадает в URL. (✓ dispatchPort.ts:26-39,63 OTP redaction; phoneAuth.test.ts)

Scope boundary: не менять feature UI/routes в этом slice. Checks: dispatch policy tests, fake legacy config, replay,
unknown class, direct-call checker, auth regression, independent security audit.

Messenger topology guard не ждёт `MOB-O9`. Конкретные content builders из `N3/N6` используют safe default только в
DEV fixtures и не получают production release до exact matrix acceptance.

#### N1 launch checkpoint — 2026-07-21

- **Base/task/dependency:** `8d693b5d4`, taskdb `#913`; N0 terminal audit PASS and integrated. The retained C5A
  evidence branch has no changed-file overlap with this manifest.
- **Business boundary:** fail closed at the one integrator dispatch contour: Telegram/MAX only for typed
  `auth_code` or minimal `auth_handshake`; email/SMS only for the same existing authentication purpose until the
  owner accepts the later account-service allowlist; Web Push remains the migration product transport. No feature
  route/UI, content-builder migration, bot retirement, provider/config, DB/schema or queue drain belongs here.
- **Exact writable implementation scope:**
  `apps/integrator/src/kernel/contracts/events.ts`, `index.ts`, `unifiedMessage.ts`;
  `apps/integrator/src/infra/adapters/outboundMessagePolicy.ts` (new), `dispatchPort.ts`, `sendUnified.ts`,
  `channelRouting.ts`;
  `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`, `doctorBroadcastIntentMenu.ts`;
  `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts`, `sendOtpRoute.ts`, `sendEmailRoute.ts`,
  `sendSmsRoute.ts`, `dispatchRequestContact.ts`; co-located tests and one co-located static checker/test only.
  This exact extension over the N0 proposal is required by the N1 typed-contract and auth-regression checklist;
  product callers cannot supply an arbitrary class through the generic relay payload.
- **Protected scope:** webapp feature modules/routes, `apps/integrator` provider adapters/clients and DI, root
  tooling/CI, DB/migrations, settings/env, active SaaS/C5/FIO/Doctor UI files, TEST/PROD/host/provider state.
- **Acceptance:** typed finite policy; generic relay cannot forge auth capability; unknown/missing/legacy product
  external delivery is denied before adapter/send without payload logging; Web Push still passes; OTP over existing
  Telegram/MAX/email/SMS and request-contact handshake pass; worker replay/fake legacy config cannot bypass; a
  source-backed static checker catches a newly introduced product/provider bypass. Targeted policy/route/worker/auth
  tests, integrator typecheck/lint and one independent critical security audit are required. Full CI is deferred to
  the next cross-plan milestone unless the implementation introduces repo-level shared changes.
- **Open gates:** `MOB-O9`, `G-04B`, account-service templates and any TEST/PROD cutover remain owner/legal gates;
  they do not block this repository-only topology guard and are not inferred closed by it.

#### N1 closure — 2026-07-21

Integrated SHA: `671ac2127`. The first independent critical audit found seven owner-mapped P1s; one coherent
correction closed the taxonomy, forged queue marker, legacy retry, non-message regression, static-checker, email
contract and green-check gaps. Terminal audit `bcb-ntf01-n1-terminal-audit-20260721` passed `0 P0 / 0 P1 / 0 P2`.
The audited/rebased patch id remained `b5212dd13df01d0a3b37a895ff516147d0252db8` after current-roadmap rebase.

Checks: `13` targeted Vitest files / `136` tests PASS; integrator strict typecheck PASS; integrator lint PASS;
`git diff --check` PASS. Full CI was intentionally deferred by the launch checkpoint. No provider/webapp/DB/schema,
env, deploy, TEST/PROD, queue drain or real send was touched. Concrete safe templates remain N3/N1B work; SMS OTP
transport/config remains present and is controlled later by N1A rather than removed.

### N1A — platform auth-channel policy (`AI`, taskdb `#929`, after N1)

**U9A prerequisite / current-code correction (2026-07-21).** The existing `/api/admin/settings` route is an
organization-management surface by design: it resolves one clinic membership and must remain the writer for
per-organization settings. It is not a sanctioned platform-global writer. N1A therefore first lands one bounded U9
platform-settings spine: a dedicated `platform.operations` API guard with no organization membership, a dedicated
least-privilege DB principal/role for global settings, and a platform-only whitelisted API which still delegates every
write to `systemSettings.updateSetting`. Borrowing a clinic, mapping the operator to generic `app_staff`, weakening
RLS, using `adminMode` as universal authority, direct SQL, or adding a second sync/audit path is forbidden. This is
not the full U9 admin console; it owns only global configuration read/write plus its existing atomic settings audit.

- [x] Add independent global admin runtime flags for `auth_email_enabled`, `auth_sms_enabled`,
      `auth_telegram_enabled` and `auth_max_enabled` through the existing DB-backed `system_settings` registry,
      service and public-runtime projection. Provider credentials/readiness remain separate. (✓ apps/webapp/src/modules/auth/authChannelPolicy.ts; system-settings/registry.ts, runtimeConfig.ts)
- [x] Reuse the existing `/app/doctor/admin/auth` settings surface, the system-settings registry/service/UoW and
      integrator mirror. Add a separate platform-only API/helper; do not redirect clinic settings through it and do
      not introduce a second config store, env flag, provider adapter, route-level mirror or audit store. (✓ apps/webapp/src/app/app/(global-admin)/doctor/admin/auth/PlatformAuthChannelPolicySection.tsx)
- [x] Apply each flag to discovery and server execution: check-phone/channel picker/phone start, email OTP starts,
      Telegram Widget/login, MAX init, channel-link and messenger-bind paths. A crafted request cannot use a disabled
      channel; re-enable restores only an already configured provider path. (✓ checkPhoneMethods.ts, publicAuthSnapshot.ts, loginAlternativesConfig.ts, integrator/infra/db/authChannelPolicy.ts)
- [x] Preserve SMTP/SMSC/Telegram/MAX modules and settings. Existing bindings remain stored when a channel is off.
      `sms_fallback_enabled` stays a temporary legacy doctor/global compatibility key and is not reused as the new
      platform auth policy. (✓ authChannelPolicy.ts decouples sms_fallback_enabled; provider modules untouched)
- [x] Migration-safe rollout preserves current behavior: Email/Telegram/MAX default enabled; SMS seeds from the
      existing effective public SMS policy and otherwise defaults disabled. Any direct migration write maintains the
      `public` + `integrator.system_settings` mirror; no migration is executed on TEST/PROD by this stage. (✓ apps/webapp/src/modules/system-settings/authChannelPolicyMigration.ts + .test.ts)

Acceptance: platform admin independently controls four auth/binding channels; disabled channels are neither offered
nor executable; account-existence responses remain neutral; missing provider config still fails closed; SMS OTP
tests prove the existing module was retained; settings/mirror, route negatives, picker and auth regressions pass.
This stage owns auth/binding policy only, never product notification preferences, templates or broadcasts.

#### N1A launch checkpoint — 2026-07-21

- **Base:** `3ee1537bd` (includes the independently completed capacity/index canon); N1 integrated at
  `671ac2127`; taskdb `#929=doing`.
- **Dependencies:** U1 capability spine is integrated. The exact missing dependency is the bounded U9A platform-
  settings writer above; `#808` remains the umbrella for the later admin-console/support scope and is not claimed
  complete by N1A.
- **Ownership/file boundary:** platform-global `organization_id IS NULL`; no organization selection or clinical
  object. Shared principal/role changes are limited to the new platform-settings capability. The old clinic settings
  API and per-org settings remain protected and behavior-compatible.
- **Acceptance/verification:** platform admin allow; clinic owner/admin, doctor, patient and unauthenticated deny;
  real-role smoke proves global-settings access and denial on clinical/org tables; service mirror/audit stays atomic;
  every disabled auth channel disappears from discovery and rejects crafted execution before identity lookup;
  provider-not-ready stays denied and existing bindings/modules remain intact.
- **Operational boundary:** repository files and tests only. No DB apply, deploy, TEST/PROD, env/secret read, provider
  call, real message, account mutation or binding deletion. Targeted suites/typecheck/lint first; full CI waits the
  accumulated milestone.
- **Audit mode:** high-risk auth/tenant/config stage: one independent critical audit after the coherent worker pass;
  one integrated correction/re-audit only if an owner-mapped or repository-rule defect exists, with the universal
  two-correction hard stop.

#### U9A prerequisite closure — 2026-07-21

Integrated as `7c9d94bea` + `f48c4b8af`. The first audit found the missing Drizzle role translation/cleanup,
guard negatives and repository gate; one coherent correction also closed the mirror HTTP-fallback privilege gap
without granting the platform role generic outbox DML. Terminal re-audit passed `0 P0 / 0 P1 / 0 P2`.

Evidence: db-principal `7/7`; targeted webapp `82/82`; webapp typecheck and scoped lint; U9A/static DB gates;
disposable PostgreSQL 16 real-role matrix; diff check. No working DB, role apply, deploy, TEST/PROD, provider or
real send was touched. N1A remains `doing`: the four flags, UI/discovery and crafted-request enforcement are not
claimed by this prerequisite.

#### N1A repository closure — 2026-07-21

Integrated and pushed through `00d3b2240`. The platform page now controls four independent global auth/binding
channels through the existing registry/service/mirror path. Public discovery and UI fail closed, while webapp and
integrator execution paths reject disabled channels before send or binding mutation. Email/password login, provider
configuration and existing bindings remain intact; the legacy SMS fallback key is no longer an auth-policy gate.

The first whole-stage audit found two owner-mapped P1 gaps: request-contact could bypass the Telegram/MAX policy,
and SMS still depended on the legacy fallback flag. The coherent correction closed both server paths; the re-audit
found the remaining disabled-MAX bot fallback in Mini App UI. The second and final bounded correction removed that
offer. Terminal re-audit passed `0 P0 / 0 P1 / 0 P2`.

Evidence: email targeted `128` tests; integrated auth webapp `62` and integrator `32`; public/admin UI `92` plus one
existing intentional skip; correction webapp `28` and integrator `7`; final Mini App fallback `8`; affected app
typechecks, scoped lint and diff checks passed. Full CI and live owner/TEST acceptance remain milestone gates, so
taskdb `#929` stays `doing` despite repository implementation and audit closure. No DB apply, deploy, TEST/PROD,
provider call, real send or binding deletion was performed.

### N1B — managed notification templates and branded presentation (`AI`, taskdb `#930`, after N1)

Reuse base is mandatory: `modules/notif-templates/notifTemplatesService.ts`, existing admin/doctor routes,
`notif_template:*` global-fallback/per-org settings and the schedule «Тексты уведомлений» editor. Do not fork a
second template store or channel sender.

> Editor UI decision (owner 2026-07-21) — **layout + content split, NOT Tiptap here.** Transactional notification
> templates (notification texts, appointment reminders, OTP/verification emails) keep the current simple
> variable-based content editor. The only visually-configured artifact is a single per-organization presentation
> over a fixed server-owned email-safe envelope: branding (logo, specialist avatar, signature, contacts) plus
> server-owned title/body slots. The organization edits only typed branding fields/tokens and chooses an allowed
> layout with a synthetic live preview; it never submits HTML/CSS. This is exactly N1B0's safe branded layout:
> server-enforced field/variable schema, sanitized injected content and readiness-checked assets; one presentation
> override per org gated by the `branding`
> entitlement (neutral platform wrapper by default). **Tiptap (`#931`) is a separate cross-cutting decision for the
> markdown editors (broadcasts/CMS/recommendations) and is NOT used in N1B.** Refs:
> [`docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`](../../../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md)
> §«Конверт транзакционных писем». This note records the owner design clarification of N1B0; it does not add new
> stages or change the acceptance criteria below.

- [x] `N1B0 contract/editor`: define typed event × audience × channel templates and versioned effective resolution:
      platform default → eligible organization override → channel renderer. Platform admin owns defaults;
      organization owner/admin owns org overrides. Per-specialist override is not launch scope until a later owner
      decision. (✓ apps/webapp/src/modules/notif-templates/managedNotifTemplate.ts:31,69-70,103-125)
- [x] Replace the current global variable list with a server-enforced allowlist per event/channel/content tier.
      Unknown variable, raw chat/comment, diagnosis, complaint, phone/name where not explicitly allowed, absolute
      untrusted URL and secret/token fail closed. (✓ managedNotifTemplate.ts allowedNotifTemplateVariables/eventPolicy:103-133)
- [x] Email templates have subject, sanitized HTML and required plain-text fallback. Telegram/MAX/push render only
      their supported safe fields/formatting. Preview uses synthetic data and never performs a real DEV send. (✓ managedNotifTemplate.ts:200-218 email subject/plainText; notifTemplatesService.managed.test.ts)
- [x] Branding changes presentation only after the existing organization `branding` entitlement and published
      assets/readiness. Core organization identification remains available without paid branding; custom sender
      identity/readiness remains the separate U8/branding-domain contract. (✓ managedNotifTemplate.ts branding gating + test)
- [ ] `N1B1 adoption` is executed inside the matching N3 family child: appointment reminder, exercise reminder and
  neutral message/comment builders bind to exact template ids/classes and channel allowlists. Generic email or
  messenger relay never becomes a template escape hatch.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: адопция «внутри соответствующего N3 family child» опиралась на порядок N3
  (§21–§25 заменил его типизированным резолвером канала). **Не вытеснено:** «generic relay никогда не
  становится template escape hatch» — эта половина дословно продолжает действовать (см. верхний блок
  "SUPERSEDED AS TARGET", строка "Что НЕ отменено") и переносится в builders через типизированный
  event/audience/channel реестр `N1B0` (`managedNotifTemplate.ts`), а не через порядок N3.

Acceptance: current created/cancelled/rescheduled templates migrate without silent loss; platform/org ownership and
two-org negatives pass; unsafe variable/render attempts fail server-side; HTML/plain and messenger renderer fixtures
pass; branding-off fallback is deterministic; template revision/effective source is auditable without logging body;
no real channel send, provider configuration or TEST/PROD action is part of editor acceptance.

**N1B0 closure (2026-07-21, taskdb `#930`, integration `059b662d3`).** The same six `notif_template:*` carrier keys
now expose versioned platform/organization templates and one presentation profile. Exact event×audience×channel T1
policies exclude name/phone/reason, final rendered values are bounded and control-character safe, email uses a fixed
escaped server envelope plus plain fallback, and preview is synthetic/no-send. Compatible legacy text is adapted;
incompatible text remains visibly preserved. Exact-row CAS covers the legacy+runtime dual write and returns an
explicit conflict instead of losing concurrent template/presentation changes. Platform defaults require the platform
principal and NULL organization; clinic overrides require clinic management plus branding entitlement and exact org.
One correction pass and terminal independent re-audit passed with 0 P0/P1/P2; integration validation passed 8 files /
74 tests, typecheck, scoped lint, U9A and diff checks. Full CI waits for the accumulated milestone. No DB apply,
provider call, sender adoption, deploy, TEST or PROD action occurred.

### N2 — provider-neutral push target and delivery (`AI`, coordinated with `MOB-03`)

- [ ] Notification intent отделён от transport; Web Push/APNs/FCM — adapters одного push capability.
      ПЕРЕЖИВАЕТ 27.07: не противоречит §21–§25 (транспорт push остаётся одним из каналов резолвера); реально не
      начато, отложено вместе с native mobile app — владелец 27.07: «инициатива нативного мобильного приложения не
      выдумана - просто не сейчас. Пока pwa» (см. `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6.1).
- [ ] Native targets имеют отдельную модель от `user_web_push_subscriptions`; token lifecycle/retention/revoke
      описаны в mobile plan.
      ПЕРЕЖИВАЕТ 27.07: та же причина — часть native mobile initiative, отложенной владельцем, не отменённой.
- [ ] Org-scoped event несёт `organizationId`; target resolution не превращает device token в tenant bypass.
      ПЕРЕЖИВАЕТ 27.07: tenant-safety требование не зависит от того, push-only канал или один из многих; отложено
      вместе с native.
- [ ] Provider credentials читаются через restricted DB-backed settings после S5/CRYPTO gates, не из новых env.
      ПЕРЕЖИВАЕТ 27.07: усилено, не отменено — §19/§25 требуют ровно того же (креды/боты — данные кабинета, не env);
      применимо к native push-провайдерам так же, как к Telegram/MAX/SMTP.
- [ ] Provider response/metrics не содержат payload/token; invalid token деактивируется идемпотентно.
      ПЕРЕЖИВАЕТ 27.07: общая гигиена доставки, не завязана на push-only target; ср. §28.4 (пуш меряется ответом
      службы и телеметрией приложения, а не тестовой отправкой).

Checks: wrong-org, multiple devices, token rotation, duplicate/retry, provider failure, no-target, payload marker.

### N3 — migrate product families to in-app + push (`AI`, independent vertical slices)

> **SUPERSEDED AS TARGET — 2026-07-27.** В том числе checklist «нет product messenger/email/SMS job» ниже заменён §21–§23; читать только как историю planned migration.

Owner correction 2026-07-21 for the booking slice: hard-coded `24h/2h` is only the current legacy default, not the
target schedule model. Each specialist configures the reminder options/default proposed for appointments with that
specialist; after confirmation the client may override or disable reminders for that exact appointment. The client
per-appointment choice wins. N3 changes transport/cutover only and must preserve this target ownership for the later
booking-reminder stage rather than freezing `24h/2h` into the new channel policy.

Порядок с непересекающимися exact scopes:

1. patient ↔ specialist chat and program notes;
2. patient reminders and specialist task reminders;
3. booking created/cancelled/rescheduled/24h/2h/payment lifecycle; push job независим от messenger target/success;
4. broadcasts;
5. online intake and public/patient support после готового admin/support inbox (`#808/U9` reuse);
6. operator/security alerts после принятого replacement contour.

Для каждого slice:

- [ ] canonical in-app record/linked object существует до send intent;
      ПЕРЕЖИВАЕТ 27.07: хорошая архитектура сама по себе, не завязана на «push-only»; наличие messenger-канала
      этому не противоречит.
- [ ] content tier builder единственный и покрыт positive/negative fixtures;
      ПЕРЕЖИВАЕТ 27.07 (T0–T3 census — прямо названная владельцем/каноном surviving-часть): для personal-chat/task
      семейств содержание сузилось (§22 — только факт+ссылка, ещё строже, чем было), но для broadcast T2/T0
      определение "tier" меняется на "открытый текст как есть" (§15) — единый builder должен это отражать, не
      маскировать рассылку.
- [-] ~~нет product messenger/email/SMS job, callback или fallback;~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «должны быть те которые а) доступны (разрешены глобал админом и настроены либо у платформы либо у клиники) и б) разрешены клиентом в профиле для этого типа уведомлений».
  Основание: §21/§25 — Telegram/MAX/email/SMS теперь легитимные каналы
  доставки, выбираемые резолвером (доступно ∩ разрешено клиникой ∩ разрешено получателем), а не запрещённый
  job/callback/fallback.
- [ ] no push target даёт `no_active_target`, сохраняет unread/in-app state и health metric;
      ПЕРЕЖИВАЕТ 27.07 в обобщённом виде: концепция «пустое пересечение — законный исход, видимый и посчитанный»
      прямо сохранена и расширена §21 («Пересечение пусто → уведомление не уходит никуда, и это НЕ ошибка доставки:
      это законный исход… обязан быть виден… и посчитан в метрике») — только не только для push, а для любого канала.
- [ ] muting/topic preferences не уничтожают canonical event;
      ПЕРЕЖИВАЕТ 27.07: не затронуто; согласуется с §21 п.2 (получатель разрешает канал ПО ТИПУ уведомления, не
      «вообще») и §25.2 (клиника тоже решает что слать).
- [ ] tenant/dedup/retry/deep-link tests зелёные.
      ПЕРЕЖИВАЕТ 27.07: общий тестовый бар, не зависит от модели каналов.

### N4 — bots auth-only (`AI`, after replacement surfaces)

> **SUPERSEDED AS TARGET — 2026-07-27.** Перечень отключаемых product bot paths заменён §15 и §21–§23; врачебный Telegram имеет ровно два notification flows (§15).

- [ ] Сохранить phone auth/messenger bind contact/code/cancel/open-app flows и их rate limits.
      ПЕРЕЖИВАЕТ 27.07: не затронуто ни одним новым решением — auth-флоу остаются в любом варианте канальной модели.
- [ ] Отключить mini-app init login, product menus, booking/reminder/program callbacks, support relay, clinical
  inbound/outbound text и admin reply surfaces.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: §15 прямо оставляет во врачебном Telegram-чате ровно два уведомления («сообщение от
  пациента», «новая запись») — то есть booking- и support-related notification flows не отключаются целиком, а
  сужаются до типа/факта. Что НЕ вытеснено и остаётся в силе: `clinical inbound/outbound text` по-прежнему не
  течёт через бота (§22 — только факт и ссылка), mini-app product login/menus по-прежнему выводятся (это не
  входит в два разрешённых уведомления).
- [ ] Старые product callback/free-text получают короткий safe redirect в app; clinical text не сохраняется как
      новая bot conversation.
      ПЕРЕЖИВАЕТ 27.07: прямо усилено §22 — ни текст сообщения, ни текст задачи, ни превью не идут ни в один канал;
      механика safe-redirect для отмирающих product callback-ов (которые НЕ входят в два разрешённых уведомления
      §15) остаётся нужной.
- [ ] `#822` поглощается этим stage; `#816` помечается superseded после push-only deep-link replacement, а не исполняется ради выводимого messenger feature.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: посылка "push-only deep-link replacement" мертва вместе с push-only target; судьбу
  `#822`/`#816` нужно пересмотреть отдельно против §21–§25, это не сделано этой правкой (не решение, а вопрос
  к владельцу/taskdb, вне рамок этой задачи).
- [ ] Bot capability docs/scripts/tests отражают auth-only allowlist; stale callback не вызывает product action.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: «auth-only allowlist» как рамка мертва — бот легитимно несёт два
  notification-flow сверх auth (§15), это не allowlist из одних кодов. **Не вытеснено:** «stale callback не
  вызывает product action» — общая security-гигиена, остаётся требованием для любых отмирающих product
  callback-ов (см. пункт выше).

### N5 — settings and compatibility (`AI`, waits stable S5-7 and free Doctor DNA scope)

> **SUPERSEDED AS TARGET — 2026-07-27.** Settings не могут исключать Telegram/MAX/email/SMS как product channels: актуальный выбор определяют §21 и §27 через кабинет.

- [-] ~~Notification settings UI показывает product topics и app push/preview policy, но не Telegram/MAX/email/SMS как каналы product delivery.~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «пусть решают куда и какие слать напоминания».
  Основание: прямо противоположно новому решению — §21/§25/§25.2 требуют, чтобы клиника и
  получатель ВИДЕЛИ и выбирали Telegram/MAX/email/SMS как каналы именно product delivery, по типу уведомления.
- [ ] Auth channel bindings/preferences остаются отдельной настройкой и не удаляются.
      ПЕРЕЖИВАЕТ 27.07: не затронуто; согласуется с §3 («ничего не вырезаем из кода») и уже реализовано N1A
      (`authChannelPolicy.ts`) как отдельный от product-notification слой.
- [ ] Legacy DB enum/rows сначала ignored-at-runtime + compatibility read; cleanup migration только после zero-caller
      census и отдельного backward-compatible manifest.
      ПЕРЕЖИВАЕТ 27.07: общая миграционная гигиена, не зависит от того, какая канальная модель целевая.
- [ ] Web Push subscription UI остаётся только browser surface; native app не показывает PWA install/SW controls.
      ПЕРЕЖИВАЕТ 27.07: согласуется с «пока PWA, native не сейчас» (владелец 27.07, см. N2 выше).

### N6 — content, logs and queues (`AI`, linked `LOG-01`)

- [ ] Все event families назначены `T0–T3`; arbitrary sensitive fixtures не попадают в push.
      ПЕРЕЖИВАЕТ 27.07 (T0–T3 census переживает целиком): для personal-chat/task — строже, чем было (§22); для
      broadcast T2/T0 — определение "sensitive" сузилось: текст рассылки по §15 сам по себе не sensitive и не
      маскируется, тир остаётся для маршрутизации/минимизации иных полей, не для сокрытия текста рассылки.
- [ ] Delivery attempts/queues/dead-letter/provider errors не создают дополнительные clinical copies.
      ПЕРЕЖИВАЕТ 27.07, реально не сделано: это ровно `LOG-01/L2`, не завершено — `reminders.ts:812-842`
      (`logText`), `bookingLifecycleRoute.ts:360-390` и `deliveryJobs.ts:183-249` всё ещё хранят рендеренный текст
      в queue payload; сегодняшние коммиты (`fcd956395` и др.) этих файлов не касались. См.
      `LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md` L2 (расщеплено 2026-07-27).
- [ ] Pending legacy messenger product jobs перед TEST/PROD cutover классифицированы: cancel/archive metadata-only; auth jobs не затрагиваются.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: посылка «messenger — запрещённый канал, поэтому pending-строки гасим» мертва;
  messenger — легитимный канал по §21/§25, pending `reminder_dispatch`/`doctor_broadcast_intent`/
  `message_retry_jobs` строки нужно оценивать на предмет реальной доставки, а не массово cancel/archive.
- [ ] `SENSITIVE_TEST_MARKER` отсутствует во внешнем payload, SQL/error/provider logs и retained queue state.
      ПЕРЕЖИВАЕТ 27.07, реально не сделано: см. расщеплённый `LOG-01` L3 — маркер проверен только для
      DB/logger-пути (`L1`, закрыто), не для queue/retry/delivery-attempt пути.

### N7 — TEST, rollout and documentation (`AI + owner`)

> **SUPERSEDED AS TARGET — 2026-07-27.** Push-only proof и запрет fallback ниже заменены §21–§23; DEV/TEST filter обязан покрывать каждый канал.

- [ ] Synthetic send-safe matrix доказывает: product event → in-app + push only; auth code → selected auth channel.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: «push only» прямо противоречит §21/§25 (product event → резолвер каналов:
  платформа ∩ клиника ∩ получатель, не «только push»); auth-часть не меняется.
- [ ] Проверены permission denied, no/expired token, multiple devices, muted topic, retry/dedup, provider outage,
      background/killed state для native и browser compatibility.
      ПЕРЕЖИВАЕТ 27.07 в обобщённом виде: тестовая матрица для push-канала остаётся нужной, когда бы он ни
      использовался — независимо от того, единственный он канал или один из многих.
- [ ] До native release Web Push migration population и undeliverable metric видимы; messenger fallback не возвращается для улучшения процента доставки.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: «messenger fallback не возвращается» прямо противоречит новой модели — messenger
  теперь легитимный первичный канал по выбору получателя/клиники (§21/§25), а не запрещённый fallback ради
  процента доставки.
- [ ] Runtime docs обновляются только после фактического cutover: `NOTIFICATION_CHANNELS`, inbox/broadcast/bot/MAX/
      auth/integrator/reminder contracts.
      ПЕРЕЖИВАЕТ 27.07 в обобщённом виде: дисциплина «доки синхронизируются после факта, не раньше» остаётся;
      «cutover» теперь означает раскатку §21–§28 архитектуры, а не push-only.
- [ ] PROD drain/config/provider rollout — отдельный owner-approved change window с rollback, не часть DEV worker.
      ПЕРЕЖИВАЕТ 27.07: не затронуто; согласуется с §6 (прод — отдельное owner-approved окно).

## 6. Dependencies and non-overlap

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- N0/N1 и `LOG-01/L0-L1` не зависят от billing.
- N2 native provider ждёт `MOB-00/MOB-02`, `G-04B` и restricted setting/key gate; Web Push migration work может
  идти раньше.
- N3 support ждёт существующий `#808/U9` admin/support source; второй support backend запрещён.
- N5 ждёт stable S5-7 и свободный file scope после active Doctor DNA `#885`.
- Active D3/D4/S5/Product UX/billing plans не редактируются этим stage. Tenant-aware runtime slices ждут stable D4
  там, где меняют org-scoped write/read paths.
- `CRYPTO-01/C4`, `SEC-04` и `PR-04A` требуют закрытых NTF/LOG evidence.

## 7. Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **SUPERSEDED — 2026-07-27.** В частности, DoD «Ни один product runtime path не отправляет Telegram/MAX/email/SMS» и auth-only allowlist ниже инвертированы/уточнены §15 и §21–§23. Не использовать их как release criterion; см. строку **«Уведомления»** в карте authority.

- [-] ~~Ни один product runtime path не отправляет Telegram/MAX/email/SMS.~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «должны быть те которые а) доступны (разрешены глобал админом и настроены либо у платформы либо у клиники) и б) разрешены клиентом в профиле для этого типа уведомлений».
  Основание: полностью и прямо противоположно — §21/§24/§25 ТРЕБУЮТ, чтобы product-пути умели
  слать в Telegram/MAX/email/SMS, когда это выбрано резолвером каналов.
- [-] ~~Telegram/MAX технически способны только на login/bind code/auth handshake allowlist.~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Врач + Telegram: в Telegram-чате врача работают ТОЛЬКО уведомления. Уведомления — это: (а) уведомление о сообщении от пациента (уходит во врачебный чат) и (б) уведомление о новой записи. Всё.»
  Основание: §15 прямо разрешает два product notification flow сверх auth-allowlist
  («сообщение от пациента», «новая запись»).
- [ ] Product events имеют canonical in-app state и push transport; no target не включает hidden fallback.
      ПЕРЕЖИВАЕТ 27.07 в обобщённом виде: «canonical in-app state» и «no hidden fallback у пустого пересечения»
      сохранены §21 буквально; «push transport» узко — сейчас транспортов несколько по выбору, не только push.
- [ ] Booking/reminder push не зависит от messenger target/job success.
      ПЕРЕЖИВАЕТ 27.07: реальная незакрытая инженерная работа, не про запрет messenger — про то, что push не
      должен молчать/падать из-за messenger-биндинга (см. NTF-01 census, `active_dependency`,
      `bookingLifecycleRoute.ts`/`jobExecutor.ts`); не тронуто сегодняшними коммитами.
- [ ] `T0–T3` policy сохраняет полезные routine details и исключает raw clinical/free-text/file/secret payload.
      ПЕРЕЖИВАЕТ 27.07 (T0–T3 census — surviving часть по прямому указанию): для personal-chat/task ужесточено
      §22; carve-out — broadcast-текст по §15 открыт и не маскируется, это не «raw clinical» класс.
- [ ] Pending queues, bot callbacks, settings UI и legacy rows прошли controlled migration.
  ЧАСТИЧНО ИЗМЕНЕНО 2026-07-27: премиса «settings UI прячет messenger-каналы» и «bot callbacks отключены»
  вытеснена (см. N4/N5 выше). **Не вытеснено, реальная работа:** pending queue/legacy rows всё ещё хранят
  рендеренный текст без TTL/минимизации — см. `LOG-01` L2 (расщеплено 2026-07-27) и N6 выше.
- [ ] Auth, push, in-app, tenant-negative, marker, real-device/TEST tests и independent security audit зелёные.
      ПЕРЕЖИВАЕТ 27.07: общий тестовый/аудиторский бар, не зависит от канальной модели.
- [ ] Один full CI выполнен на integration/release checkpoint; owner принял real-device behavior.
      ПЕРЕЖИВАЕТ 27.07: общая дисциплина релизного гейта, не затронута.
