# NTF-01 — App push and messenger auth-only boundary

Статус: `planned`; owner channel direction принят 2026-07-19. Текущий runtime всё ещё многоканальный.

## Цель

Отделить аутентификацию от продуктовых коммуникаций:

- Telegram/MAX: только login/bind code и минимальный auth handshake;
- product reminders/notifications: in-app source of truth + push;
- browser/PWA transport: существующий Web Push до отдельного retirement decision;
- native transport: APNs/FCM через [`NATIVE_MOBILE_APP_INITIATIVE`](../../NATIVE_MOBILE_APP_INITIATIVE/README.md);
- отсутствие push target не включает скрытый fallback в messenger/email/SMS.

Этап не требует делать каждый push бессодержательным. Он вводит контролируемую матрицу: полезные routine details
разрешены, произвольный clinical/free-text payload остаётся внутри авторизованного приложения.

## 1. Зафиксированное owner ruling (`G-15`)

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

| Class | Примеры | In-app | App push | Telegram/MAX | Email/SMS |
|---|---|---:|---:|---:|---:|
| `auth_code` | login/bind OTP, contact handshake | да | нет | **да** | существующие email auth/recovery flows отдельно |
| `routine_product` | запись, перенос, отмена, обычный reminder, quota/trial status | **да** | **да** | нет | нет |
| `conversation_event` | новое сообщение, program note, intake reply | **да** | **да** | нет | нет |
| `broadcast_event` | врачебная рассылка | **да** | **да** | нет | нет |
| `account_service` | invite, reset, receipt, договор, export/deletion notices | по событию | по policy | нет | **да по allowlist** |
| `operator_security` | provider outage, security incident, health alert | admin/monitoring | по принятому contour | нет | отдельный monitoring allowlist |

Новый/неизвестный class = default deny для messenger/email/SMS. Allowlist хранится централизованно в typed policy,
а не размножается по feature modules.

## 4. Матрица текста push — engineering safe default до `MOB-O9/G-04B`

| Tier | Что можно показать | Что нельзя автоматически подставлять | Default copy |
|---|---|---|---|
| `T0 public/general` | общий news/product text | secrets/tokens/PII in URL | полезный полный короткий текст |
| `T1 transactional` | дата/время записи, отмена/перенос, payment/subscription/trial status, сумма при необходимости | payment credentials, телефон, email, token | конкретный статус и действие |
| `T2 controlled product` | generic training/warmup copy, notification-safe broadcast/reminder title | диагноз, symptom/test value, internal clinical field | полезный title + короткий context |
| `T3 arbitrary sensitive` | факт события, sender role/безопасный short label | raw chat, complaint, intake summary, diagnosis, note, task free text, filename, attachment preview | «Новое сообщение от специалиста» / «Новый комментарий к программе» |

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

### N0 — census, contracts and exact manifests (`AI`, executable now docs/read-only)

- [ ] Построить полный producer → resolver → queue → dispatch → provider → inbox map для chat/program note,
      reminders, specialist tasks, booking/payment lifecycle, broadcasts, intake, support и operator alerts.
- [ ] Для каждого path указать current channels, copied fields, queue/log retention, tests и replacement source.
- [ ] Зафиксировать allowlist `auth_code/account_service/operator_security` и content tier каждого event.
- [ ] Найти pending queue rows/types, которые при cutover нельзя отправить в messenger.
- [ ] Создать exact child tasks только после проверки active worktrees/SHA; не расширять `#751/#844/#845`.

Checks: code-search+codeq provenance, zero `unclassified` feature family, link validation, independent plan audit.

### N1 — central egress policy guard (`AI`, after exact dispatch scope)

- [ ] Ввести strict typed `OutboundMessageClass/Capability`; product module не передаёт произвольную строку.
- [ ] В нижнем integrator dispatch chokepoint Telegram/MAX допускают только `auth_code` и минимальный auth
      handshake allowlist. Ошибка resolver/legacy setting не обходит guard.
- [ ] Email/SMS product delivery default-deny; разрешённые service classes имеют отдельные tests/templates.
- [ ] Static/runtime checker запрещает product notification → Telegram/MAX/email/SMS и direct provider calls.
- [ ] Существующий OTP/login/bind regression остаётся зелёным; code/token не логируется и не попадает в URL.

Scope boundary: не менять feature UI/routes в этом slice. Checks: dispatch policy tests, fake legacy config, replay,
unknown class, direct-call checker, auth regression, independent security audit.

Messenger topology guard не ждёт `MOB-O9`. Конкретные content builders из `N3/N6` используют safe default только в
DEV fixtures и не получают production release до exact matrix acceptance.

### N2 — provider-neutral push target and delivery (`AI`, coordinated with `MOB-03`)

- [ ] Notification intent отделён от transport; Web Push/APNs/FCM — adapters одного push capability.
- [ ] Native targets имеют отдельную модель от `user_web_push_subscriptions`; token lifecycle/retention/revoke
      описаны в mobile plan.
- [ ] Org-scoped event несёт `organizationId`; target resolution не превращает device token в tenant bypass.
- [ ] Provider credentials читаются через restricted DB-backed settings после S5/CRYPTO gates, не из новых env.
- [ ] Provider response/metrics не содержат payload/token; invalid token деактивируется идемпотентно.

Checks: wrong-org, multiple devices, token rotation, duplicate/retry, provider failure, no-target, payload marker.

### N3 — migrate product families to in-app + push (`AI`, independent vertical slices)

Порядок с непересекающимися exact scopes:

1. patient ↔ specialist chat and program notes;
2. patient reminders and specialist task reminders;
3. booking created/cancelled/rescheduled/24h/2h/payment lifecycle; push job независим от messenger target/success;
4. broadcasts;
5. online intake and public/patient support после готового admin/support inbox (`#808/U9` reuse);
6. operator/security alerts после принятого replacement contour.

Для каждого slice:

- [ ] canonical in-app record/linked object существует до send intent;
- [ ] content tier builder единственный и покрыт positive/negative fixtures;
- [ ] нет product messenger/email/SMS job, callback или fallback;
- [ ] no push target даёт `no_active_target`, сохраняет unread/in-app state и health metric;
- [ ] muting/topic preferences не уничтожают canonical event;
- [ ] tenant/dedup/retry/deep-link tests зелёные.

### N4 — bots auth-only (`AI`, after replacement surfaces)

- [ ] Сохранить phone auth/messenger bind contact/code/cancel/open-app flows и их rate limits.
- [ ] Отключить mini-app init login, product menus, booking/reminder/program callbacks, support relay, clinical
      inbound/outbound text и admin reply surfaces.
- [ ] Старые product callback/free-text получают короткий safe redirect в app; clinical text не сохраняется как
      новая bot conversation.
- [ ] `#822` поглощается этим stage; `#816` помечается superseded после push-only deep-link replacement, а не
      исполняется ради выводимого messenger feature.
- [ ] Bot capability docs/scripts/tests отражают auth-only allowlist; stale callback не вызывает product action.

### N5 — settings and compatibility (`AI`, waits stable S5-7 and free Doctor DNA scope)

- [ ] Notification settings UI показывает product topics и app push/preview policy, но не Telegram/MAX/email/SMS
      как каналы product delivery.
- [ ] Auth channel bindings/preferences остаются отдельной настройкой и не удаляются.
- [ ] Legacy DB enum/rows сначала ignored-at-runtime + compatibility read; cleanup migration только после zero-caller
      census и отдельного backward-compatible manifest.
- [ ] Web Push subscription UI остаётся только browser surface; native app не показывает PWA install/SW controls.

### N6 — content, logs and queues (`AI`, linked `LOG-01`)

- [ ] Все event families назначены `T0–T3`; arbitrary sensitive fixtures не попадают в push.
- [ ] Delivery attempts/queues/dead-letter/provider errors не создают дополнительные clinical copies.
- [ ] Pending legacy messenger product jobs перед TEST/PROD cutover классифицированы: cancel/archive metadata-only;
      auth jobs не затрагиваются.
- [ ] `SENSITIVE_TEST_MARKER` отсутствует во внешнем payload, SQL/error/provider logs и retained queue state.

### N7 — TEST, rollout and documentation (`AI + owner`)

- [ ] Synthetic send-safe matrix доказывает: product event → in-app + push only; auth code → selected auth channel.
- [ ] Проверены permission denied, no/expired token, multiple devices, muted topic, retry/dedup, provider outage,
      background/killed state для native и browser compatibility.
- [ ] До native release Web Push migration population и undeliverable metric видимы; messenger fallback не
      возвращается для улучшения процента доставки.
- [ ] Runtime docs обновляются только после фактического cutover: `NOTIFICATION_CHANNELS`, inbox/broadcast/bot/MAX/
      auth/integrator/reminder contracts.
- [ ] PROD drain/config/provider rollout — отдельный owner-approved change window с rollback, не часть DEV worker.

## 6. Dependencies and non-overlap

- N0/N1 и `LOG-01/L0-L1` не зависят от billing.
- N2 native provider ждёт `MOB-00/MOB-02`, `G-04B` и restricted setting/key gate; Web Push migration work может
  идти раньше.
- N3 support ждёт существующий `#808/U9` admin/support source; второй support backend запрещён.
- N5 ждёт stable S5-7 и свободный file scope после active Doctor DNA `#885`.
- Active D3/D4/S5/Product UX/billing plans не редактируются этим stage. Tenant-aware runtime slices ждут stable D4
  там, где меняют org-scoped write/read paths.
- `CRYPTO-01/C4`, `SEC-04` и `PR-04A` требуют закрытых NTF/LOG evidence.

## 7. Definition of Done

- [ ] Ни один product runtime path не отправляет Telegram/MAX/email/SMS.
- [ ] Telegram/MAX технически способны только на login/bind code/auth handshake allowlist.
- [ ] Product events имеют canonical in-app state и push transport; no target не включает hidden fallback.
- [ ] Booking/reminder push не зависит от messenger target/job success.
- [ ] `T0–T3` policy сохраняет полезные routine details и исключает raw clinical/free-text/file/secret payload.
- [ ] Pending queues, bot callbacks, settings UI и legacy rows прошли controlled migration.
- [ ] Auth, push, in-app, tenant-negative, marker, real-device/TEST tests и independent security audit зелёные.
- [ ] Один full CI выполнен на integration/release checkpoint; owner принял real-device behavior.
