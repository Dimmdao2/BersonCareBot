Findings
Critical: webapp запускается с известными fallback-секретами, из-за чего можно подделывать сессии и интеграционные подписи.
В webapp/src/config/env.ts заданы дефолты SESSION_COOKIE_SECRET и INTEGRATOR_SHARED_SECRET, и они реально используются в webapp/src/modules/auth/service.ts и webapp/src/infra/webhooks/verifyIntegratorSignature.ts. Если production/staging поднят с неполным env, приложение не падает, а работает на секретах из репозитория. Это прямой риск forge для cookie/session и webhook/signature.
Покрытие: явного теста на запрет insecure defaults не увидел.

High: привязку телефона можно перехватить и переназначить на другой Telegram identity.
src/integrations/telegram/webhook.ts принимает /start setphone_<number>, затем src/content/telegram/user/scripts.json вызывает user.phone.link, а src/infra/db/repos/channelUsers.ts в setUserPhone() делает ON CONFLICT (type, value_normalized) DO UPDATE SET user_id = EXCLUDED.user_id. Это значит, что уже привязанный телефон можно перепривязать. Дополнительно я не нашёл проверки contact.user_id === from.id в контактном сценарии.
Последствие: захват чужих записей, напоминаний, диалогов.
Покрытие: есть тесты на SQL-форму записи, но нет hostile-path тестов на takeover/relink.

High: legacy Rubitime callback GET /api/rubitime?record_success=... фактически не аутентифицирован.
В src/integrations/rubitime/webhook.ts GET-роут не проверяет ни подпись, ни shared secret. Он сразу тянет запись через fetchRubitimeRecordById() и скармливает её в pipeline. Любой внешний вызов с валидным recordId может инициировать внутренние side effects.
Покрытие: негативных тестов на auth/abuse не видно.

High: ошибки pipeline/webhook маскируются как успех, что ведёт к тихой потере событий.
src/kernel/eventGateway/index.ts, src/integrations/telegram/webhook.ts и src/integrations/rubitime/webhook.ts в ошибках возвращают accepted/200 ok вместо fail-fast. Для провайдера это означает “всё обработано”, хотя update мог упасть в середине сценария.
Последствие: нет ретраев, трудно ловить регрессии, высокая цена диагностики.
Покрытие: тестов на failure-path и корректную propagation не хватает.

High: {{values.*}} нельзя безопасно использовать внутри одного script-step chain, а reminder-сценарии на это опираются.
src/kernel/orchestrator/resolver.ts интерполирует весь план до исполнения шага, а значения action result мерджатся только позже в src/kernel/domain/handleIncomingEvent.ts. При этом src/content/telegram/user/scripts.json передаёт userId: "{{values.reminderUserId}}" в reminders.rule.toggle и reminders.rule.cyclePreset. Это хрупкий, а по текущему коду, скорее всего, нерабочий контракт.
Последствие: часть callback-flow напоминаний может падать до callback.answer, оставляя спиннер Telegram.
Покрытие: end-to-end на live reminder callbacks нет.

High: у Telegram-контента два конкурирующих source of truth.
src/kernel/contentRegistry/index.ts при наличии src/content/telegram/user и src/content/telegram/admin игнорирует root-level src/content/telegram/scripts.json и src/content/telegram/templates.json для живого пути. Но root-файлы всё ещё существуют и содержательно отличаются. Это почти гарантированный источник ложных правок и будущих регрессий.
Покрытие: нет invariant-теста, который падал бы при coexistence scoped+root content.

Medium: выбор script зависит от specificity и порядка в JSON, а не от явного priority.
В src/kernel/orchestrator/resolver.ts resolveBusinessScript() использует только specificity; priority из content schema не участвует. Если два сценария совпали по точности, выиграет тот, кто раньше в файле. Это делает Telegram-flow хрупким и плохо предсказуемым.
Конфликт: модель данных говорит “есть priority”, runtime говорит “priority не существует”.
Покрытие: есть тесты, фиксирующие текущее поведение, но не intended contract.

Medium: часть Telegram UX держится на скрытых transport-ограничениях, а не на явной модели сообщений.
Логика reply-menu размазана между scripts.json, executeAction, delivery.ts и самим ограничением Telegram “только один reply_markup на сообщение”. Из-за этого одна смена UX уже потребовала касаться нескольких слоёв, а сценарии типа message.inlineKeyboard.show и message.send ведут себя по-разному.
Последствие: высокая вероятность регрессий при любой доработке меню/кнопок.
Покрытие: есть частичные unit-тесты, но нет полноценных сценарных e2e на reply keyboard vs inline keyboard.

Medium: cabinet.open в Telegram выглядит как недоведённая миграция и сейчас архитектурно раздваивает продукт.
В src/content/telegram/user/scripts.json есть placeholder-flow для cabinet.open, включая хардкод на одного пользователя (telegram.cabinet.open.allowed), при этом webapp-entry путь уже частично существует в других слоях. Это явный пример “новый путь есть, старый не убран, связка не завершена”.
Последствие: дальнейшая разработка кабинета почти гарантированно поедет в forked logic.
Покрытие: нет теста, что Telegram cabinet flow реально использует webapp-entry.

Medium: webapp обещает идемпотентные integrator routes, но реализация только in-memory и race-prone.
webapp/src/app/api/integrator/events/route.ts и webapp/src/app/api/integrator/reminders/dispatch/route.ts используют webapp/src/infra/idempotency/store.ts с process-local Map. Это не выдержит рестартов, нескольких инстансов и гонок между getCachedResponse() и setCachedResponse(). Особенно тревожно на фоне того, что в backend уже есть более зрелый DB-backed pattern.
Покрытие: нет тестов на concurrency/restart/multi-instance semantics.

Architectural Drift
Legacy и новая архитектура живут параллельно.
Production path идёт через src/kernel/eventGateway -> orchestrator -> executor, но рядом всё ещё существуют src/kernel/domain/usecases/*, src/integrations/telegram/connector.ts, mapIn.ts-логика и старые content bundles. Это уже сейчас размывает границы “что реально продовое”.

Межсервисные контракты описаны раньше, чем реализованы.
webapp/INTEGRATOR_CONTRACT.md и API routes уже есть, но webapp/src/modules/integrator/events.ts и webapp/src/modules/integrator/reminderDispatch.ts по сути заглушки. Риск: команды будут считать интеграцию настоящей, а на деле она фальшиво “accepted”.

Telegram UX не моделируется как единый доменный контракт.
Сейчас поведение зависит от комбинации content JSON, action types, transport constraints и env-флагов. Это уже не “данные управляют ботом”, а “данные + код + побочные эффекты transport-а”.

Feature taxonomy дублируется по слоям.
Одни и те же сущности и переходы описаны в mapIn.ts, scripts.json, templates.json, menu.json, replyMenu.json, webapp/src/modules/*, webapp/src/app/*. Цена любого rename/рефактора уже чрезмерна.

Security Risks
Fallback secrets в webapp/src/config/env.ts недопустимы для production-grade системы.
Перепривязка телефона через setUserPhone() и start.setphone выглядит как реальная account takeover уязвимость.
Неаутентифицированный GET /api/rubitime даёт внешний триггер внутренних действий.
Ошибки webhook/event processing скрываются под 200 ok, что облегчает silent failure exploitation.
В логах оркестратора и webhook-слоя уходит слишком много runtime-данных для callback/user flows.
validateTelegramInitData() в webapp/src/modules/auth/service.ts использует обычное сравнение hash, а не timing-safe; это не главный риск репо, но показатель непоследовательной security discipline.
Redundancy / Dead Code
src/content/telegram/scripts.json и src/content/telegram/templates.json выглядят как dead/shadow content при наличии src/content/telegram/user и admin.
В src/kernel/domain/executor/executeAction.ts и handler-файлах есть признаки дублирования responsibility по delivery/reminders/booking.
src/kernel/domain/usecases/* похожи на legacy stack, который уже не является canonical runtime path.
telegram.more.menu.byText / byText.plain частично дублируют action-based routing через mapIn.ts.
menu.ask и связанные шаблоны остались после изменения reply-menu и создают ложный след для будущих правок.
В webapp рядом сосуществуют DI/Repo-подход и page-local/mock-подход, что плодит два стиля реализации в одной кодовой базе.
Priority Fix Plan
Закрыть уязвимости доступа и подписи.
Убрать insecure defaults для секретов, закрыть/удалить неаутентифицированный GET /api/rubitime, запретить перепривязку телефона без строгой верификации владельца.

Прекратить silent success на ошибках интеграций.
Для webhook/event paths сделать честную политику ошибок: либо retryable fail, либо явный dead-letter/logging contract.

Определить один canonical Telegram runtime path.
Зафиксировать, что живое: scoped content + kernel orchestrator path. Всё остальное либо удалить, либо явно пометить legacy и исключить из активного развития.

Нормализовать content selection и script ordering.
Либо реально использовать priority, либо удалить поле из схемы. Добавить invariant-test на отсутствие root/scoped dual content для одного source.

Вытащить Telegram reply/inline behavior в явную модель.
Нужен один слой, который знает transport constraints Telegram. Сейчас это размазано и слишком дорого в сопровождении.

Довести webapp integrator boundary до честного состояния.
Либо сделать реальные persistent handlers и durable idempotency, либо не возвращать accepted: true и не притворяться рабочим bridge.

Guardrails
Для одного source должен существовать только один активный content layout: либо root bundle, либо scoped user/admin, но не оба.
Любой новый Telegram сценарий обязан иметь scenario-level test на реальное runtime-поведение, а не только unit-тест helper-а.
Любая security-sensitive env переменная в production должна быть mandatory, без repo-known default.
Нельзя добавлять новый feature flow одновременно в legacy и new path. Сначала выбрать canonical path.
Нельзя кодировать авторизацию/whitelist прямо в content JSON, как в telegram.cabinet.open.allowed.
Любой внешний webhook/bridge endpoint должен иметь: auth, idempotency, failure semantics, negative tests.
Любой accepted: true ответ должен означать, что событие либо уже durable persisted, либо гарантированно будет доставлено позже.
Для доменных идентификаторов (conversationId, phone link, callback data) должны быть отдельные hostile-input tests, а не только happy path.
Если изменение UX Telegram требует правок в scripts.json + executeAction + delivery.ts, это сигнал, что контракт слишком размазан и его надо централизовать.
Assumptions / Gaps
Ревизия сделана по коду и тестам репозитория, без живого прогона Telegram/webapp flows.
Часть выводов про “мертвый код” и “shadow content” выглядит очень вероятной по runtime path, но для окончательной зачистки стоит подтвердить это через usage inventory и deploy path.