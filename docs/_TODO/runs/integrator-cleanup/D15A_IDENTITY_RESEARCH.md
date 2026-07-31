# D15a — идентичность: исследование и схема переноса

Дата исследования: 2026-07-31

Run: `worker-d15a-identity`

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15a и D15b.

## Статус и обязательный вывод

Это не отметка о завершении D15a/D15b и не разрешение выдавать интегратору узкую роль. Документ даёт
готовую к утверждению схему переноса, но перечисленные в разделе 6 продуктовые развилки обязан закрыть
владелец. До этого порядок остаётся неизменным: **D15a → D15b → D17**.

Текущий интегратор действительно является владельцем части canonical identity:

- первый входящий `message.received` или `callback.received` запускает `user.upsert`, который напрямую создаёт
  `public.platform_users`, привязывает канал и включает предпочтения;
- при нескольких кандидатах тот же путь сам выбирает target и вызывает merge;
- `user.phone.link` сам решает, что переданный телефон доверенный, и может слить людей;
- строк `org_enrollments` интегратор сейчас **не создаёт**, но сам выбирает организационный контекст нового
  пользователя по правилу «единственная активная организация» — это скрытая продуктовая развилка;
- дефолты каналов и тем интегратор пишет непосредственно в public-таблицы.

Поэтому простая выдача роли без `INSERT/UPDATE` в public сломает первый webhook нового Telegram/MAX-пользователя.
Оставить эти права — значит не выполнить цель Track D. Требуется перенос авторитета, вызывающих и механизма
повтора, а не только перенос SQL.

## 1. Канон и граница целевого состояния

Применённые источники:

1. `WORK_ORDER.md`, D15a/D15b — обязательный предмет, порядок и запрет закрывать работу одним отчётом.
2. `apps/webapp/ARCHITECTURE.md:53-84` — интегратор принимает/доставляет, а webapp владеет продуктовым каноном;
   допустимы узкие команды в домен, но не прямые продуктовые записи интегратора.
3. `.cursor/rules/clean-architecture-module-isolation.mdc:1-138` — новая запись идёт через application port и
   infra-реализацию модуля; для нового кода используется Drizzle, route остаётся тонким.
4. `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md` и
   `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — canonical user, bindings, phone trust и hard blockers merge.
5. `docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md` — действующие webapp identity-flows.
6. `docs/_TODO/SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` — relationship с организацией
   создаётся в webapp и становится `active` только после доказанного продуктового события.
7. `docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` — нельзя использовать
   single-clinic deployment как доказательство принадлежности человека организации.

Целевая граница:

```text
Telegram / MAX webhook
        │ provider verification, normalization, provider-event dedup
        ▼
integrator-owned durable identity-command outbox
        │ signed M2M request + stable idempotency key + verified evidence only
        ▼
webapp identity application port
        │ one transaction: resolve/create/conflict/bind/enroll/defaults
        ▼
public canonical tables (Drizzle infra adapter)
```

Интегратор оставляет у себя provider identity, webhook dedup, доставку, retry/outbox и локальное UI-состояние.
Webapp становится единственным владельцем решений о canonical person, `user_channel_bindings`, phone trust,
merge, `org_enrollments` и public preferences. Подписанная команда — дверь, но не передача интегратору права
выбирать результат.

### Контракт двери

Новая узкая команда уровня application должна принимать:

- `provider`, `externalActorId`, нормализованные profile hints;
- стабильный `providerEventId`/`idempotencyKey` и fingerprint полезной нагрузки;
- только доказательства: например, `telegram_owned_contact`, `max_contact_hmac_verified`,
  `webapp_phone_challenge_completed`, explicit invite/channel-to-org binding;
- при наличии — непривилегированный `integratorUserId` как hint, а не canonical authority.

Она не принимает от интегратора решение «этот canonical UUID — человек», `trusted=true`, target merge,
`active enrollment` или готовый набор дефолтов. Ответ: `created | linked | unchanged | conflict | deferred`,
canonical id и непривилегированные channel facts. Одинаковый idempotency key с другим fingerprint — конфликт,
а не повторная мутация.

Для уже существующих flows следует переиспользовать подписанные webapp-двери
`phone-messenger-bind/complete` и `channel-link/complete`; сейчас после их успешного ответа интегратор всё ещё
делает повторный `user.phone.link`, что должно исчезнуть. Для обычного первого webhook нужна отдельная
узкая команда `observe-messenger-actor` (рабочее имя), а не возврат generic projection D1.

## 2. Живой вход и общий call graph

1. `apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts:64-100,127-137` вызывает
   `ensureResolvedActor` до сценария для каждого пользовательского message/callback с external actor id.
2. `apps/integrator/src/infra/adapters/actorResolutionPort.ts:7-24` превращает это в `user.upsert`.
3. `apps/integrator/src/infra/db/writePort.ts:286-343` для Telegram/MAX вызывает
   `writeIdentityAndPreferencesDirect` и допускает direct merge.
4. Telegram приходит через `apps/integrator/src/integrations/telegram/webhook.ts:345-394`, MAX — через
   `apps/integrator/src/integrations/max/webhook.ts:306-341`.
5. До pipeline оба webhook определяют organization: сначала по существующему пользователю, затем по
   single-active-org fallback (`telegram/webhook.ts:172-205`, `max/webhook.ts:56-87`).

Следствие: это не редкий admin-path. Он достижим на первом обычном сообщении нового человека.

## 3. Перепись пяти предметов

### 3.1. Создание `platform_users`

**Где и при каком входе.** Основной путь — общий call graph выше. В
`apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts:378-443` транзакция собирает
кандидатов, а при отсутствии кандидата `:198-230` вставляет `public.platform_users`. Поля: generated id,
`integrator_user_id`, optional phone/name; role получает schema-default `client`. Если телефон передан,
`patient_phone_trust_at=now()`. При существующем человеке `:232-292` дополняет имя, phone,
`integrator_user_id` и trust.

Отдельно `writeIdentityAndPreferencesDirect.ts:465-513` позволяет notification-only пути создать технического
`platform_user` только по `integrator_user_id`. Живой `writePort.ts:286-343` сейчас не передаёт phone в обычный
`user.upsert`, но API direct writer это допускает.

**Другие достижимые входы.** `writePort.ts:672` разрешает identity resolution для support conversation, а
`writePort.ts:1121` — для `notifications.update`. Webapp-entry уже показывает правильное направление:
интегратор лишь подписывает token (`integrations/webappEntryToken.ts:86-115`), а
`apps/webapp/src/infra/repos/pgIdentityResolution.ts:86-191` сам resolve/create/bind/defaults.

**Целевой владелец и дверь.** Webapp identity application service через `observe-messenger-actor`; создание
технического client-anchor, binding и результат конфликта — одна webapp-транзакция. Интегратор пишет только
свою durable command и собственную provider identity.

**Существующие данные.** Сохранить canonical ids и aliases. До переключения снять census:

- users с `integrator_user_id`/channel binding и без enrollment;
- users без binding, созданные notification/support path;
- дубли по phone, integrator id и binding, включая merge aliases;
- неполные технические anchors без зависимых продуктовых данных.

Автоматически можно нормализовать лишь доказуемый технический мусор по утверждённому правилу; неоднозначные
люди уходят в review, а не в массовый merge/delete.

**Если перенести неаккуратно.** Отзыв прав до переключения ломает первый webhook; неидемпотентная команда
создаёт дубль при retry; две активные реализации могут выбрать разные canonical ids; перенос только INSERT,
но не binding/merge, сохраняет фактический identity authority в интеграторе.

### 3.2. Слияние людей

**Где и при каком входе.** `writeIdentityAndPreferencesDirect.ts:143-195` собирает кандидатов по
`integrator_user_id`, optional phone и public channel binding. При числе кандидатов больше одного
`apps/integrator/src/infra/db/directPublic/mergeCandidatesDirect.ts:51-84` загружает строки и booking counts,
сам вызывает `pickMergeTargetId`, затем `mergePlatformUsersInTransaction(..., "projection")`.

Этот путь достижим из:

- обычного `user.upsert` (`writePort.ts:286-343`);
- support actor resolution (`writePort.ts:672` и
  `directPublic/resolveDirectPublicActor.ts:58-76`);
- `notifications.update` (`writePort.ts:1121`);
- `user.phone.link` (`writePort.ts:353-423`) через
  `packages/platform-merge/src/messengerPhonePublicBind.ts:80-314`.

Общий merge engine блокирует часть опасных случаев в
`packages/platform-merge/src/pgPlatformUserMerge.ts:159-280`, но выбор target остаётся автоматическим:
`pgPlatformUserMerge.ts:1467-1522` предпочитает booking count, phone, старшего пользователя,
`integrator_user_id`, затем UUID. Это техническая эвристика, а не утверждённое продуктовое правило личности.

**Что пишет.** Merge переносит зависимые public-строки, ставит alias/merged relation, меняет bindings,
phone/integrator anchors и удаляет/поглощает source в рамках общего merge engine. Phone-bind дополнительно
обновляет `platform_users.phone_normalized`, `patient_phone_trust_at` и `integrator_user_id`.

**Целевой владелец и дверь.** Webapp merge policy/service. Команда интегратора сообщает только доказательства
канала/телефона. Автослияние допустимо лишь в утверждённом узком классе; остальные ответы — `conflict` с
review/audit trail. Target выбирает webapp по продуктовой политике, не интегратор.

**Существующие данные.** Уже созданные aliases не разворачивать. Снять census collision-групп, зависимостей и
истории phone source; безопасные технические anchors обработать идемпотентной миграцией, остальные оставить
как есть до manual review.

**Если перенести неаккуратно.** Phone collision может слить разных родственников или владельцев
переиспользованного номера; повторный merge разъедется по aliases; concurrent old/new writers могут связать
один provider id с разными людьми; неверный target переносит медицинские/финансовые данные к чужому человеку.

### 3.3. Доверие к телефону как идентификатору

**Где и при каком входе.** `writePort.ts:353-423` принимает `user.phone.link`, проверяет лишь форму входа и
enabled channel, вызывает `applyMessengerPhonePublicBind`, затем обновляет integrator contact.
`messengerPhonePublicBind.ts:80-314` ищет по phone/integrator id, может merge и всегда заканчивает записью
phone + `patient_phone_trust_at=now()`.

Достижимые источники различаются по силе доказательства:

1. Telegram contact: `telegram/webhook.ts:228-271` принимает contact как принадлежащий отправителю только при
   `contact.user_id === from.id`; content `telegram/user/scripts.json:1211-1229` вызывает `user.phone.link`.
2. Telegram `/start setphone_<phone>`: `integrations/common/messengerStartParse.ts:15-35,83-91` извлекает
   произвольный phone без подписи, а `telegram/user/scripts.json:262-278` передаёт его в `user.phone.link`.
3. MAX contact: `integrations/max/mapIn.ts:109-180` проверяет HMAC, когда hash и token есть, но при отсутствии
   hash или token продолжает с warning; `content/max/user/scripts.json:3-24,133-152` вызывает link.
4. После подписанных webapp flows executor повторно вызывает direct link:
   `kernel/domain/executor/executeAction.ts:500-599` (`phoneMessengerBind.complete`) и `:878-913`
   (`channelLink.complete`). Webapp уже принял identity-решение; повторная direct запись лишняя.

`apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts:1-64` фактически считает телефон доверенным по
наличию `patient_phone_trust_at`; enum source не хранится рядом с trust. `infra/repos/pgPhoneHistory.ts:9-49`
различает лишь крупные классы `otp/messenger/merge/admin/projection`. Поэтому по текущим данным нельзя надёжно
отличить Telegram-owned contact от raw `setphone` и MAX contact без HMAC.

**Целевой владелец и дверь.** Webapp phone trust policy. Интегратор проверяет provider proof и передаёт
тип/evidence; webapp решает, можно ли установить phone, trust или merge. Raw/deep-link phone не должен
превращаться в trusted identity. Завершённый webapp OTP/challenge остаётся webapp-решением без обратного
direct sync.

**Существующие данные.** Не обнулять trust массово и не считать весь `messenger` trusted. Сначала census по
audit/event provenance, phone history, channel и времени; явно доказанные источники сохраняются, сомнительные
помечаются для re-verification без автоматического merge. D15b должна добавить сохраняемый proof/source для
новых решений.

**Если перенести неаккуратно.** Произвольный `setphone` или непроверенный MAX contact позволяет присоединиться
к чужому пациенту; массовый revoke разлогинит настоящих пациентов; повторный phone bind после webapp decision
может слить уже разрешённый conflict по другой эвристике.

### 3.4. Зачисления (`org_enrollments`)

**Фактический результат поиска.** В current runtime интегратора нет `INSERT/UPDATE/DELETE` для
`org_enrollments`. Есть чтение:

- `directPublic/resolveDirectPublicActor.ts:79-105` требует ровно один active enrollment для product writers;
- `infra/db/repos/channelUsers.ts:68-101,141-167` читает enrollment/member для actor context.

Однако при новом/не зачисленном пользователе `channelUsers.ts:104-139` использует единственную active
organization как временный proxy channel→org. То же решение вызывают Telegram/MAX webhook и
`integrations/bersoncare/requestContactRoute.ts:131-170`. Интегратор не создаёт строку, но сам выбирает tenant,
в котором обрабатывается первый контакт. Это часть предмета D15a и не должно маскироваться формулировкой
«enrollments не пишет».

**Текущий webapp writer.** `apps/webapp/src/modules/patient-organization/ports.ts:44-60` задаёт port;
`infra/repos/pgPatientOrganization.ts:114-228` создаёт identity и relationship в одной транзакции;
`infra/repos/pgPatientOrganizationEnrollment.ts:15-71` создаёт `invited`, сохраняет существующий
`invited/active`, блокирует `discharged/archived` и делает повтор idempotent. Schema
`apps/webapp/db/schema/bookingEngine.ts:267-308` имеет опасный default `active`, поэтому status должен задаваться
явно. Историческая `0145_seed_client_org_enrollments.sql` массово зачисляла в fixed default org; это one-shot,
не модель для D15b.

**Целевой владелец и дверь.** Webapp patient-organization policy. Первый messenger webhook создаёт только
техническую identity/binding и остаётся без enrollment, пока нет explicit invite, booking, authenticated
clinic flow или утверждённого channel→org evidence. Single active org deployment — не evidence.

**Существующие данные.** Сохранить все существующие statuses. Для людей без enrollment: уникальное долговечное
доказательство может породить только утверждённый status (рекомендация — `invited`); ambiguous/no-evidence
остаются unassigned. Никакого blanket `active` backfill.

**Если перенести неаккуратно.** Пользователь попадёт в чужую клинику, RLS/аналитика/рассылки начнут считать
его пациентом; default `active` обойдёт invite acceptance; удаление fallback до появления явного routing
превратит первый webhook в ошибку. Правильный отказ — принять provider event, сохранить deferred command и
показать нейтральный onboarding, а не угадывать tenant.

### 3.5. Предпочтения по умолчанию

**Где и при каком входе.** При новом binding
`writeIdentityAndPreferencesDirect.ts:294-343` upsert-ит `public.user_channel_preferences` с
`message_enabled=true`, `notifications_enabled=true`. Notification topics пишутся в `:345-364`.
`writePort.ts:1072-1133` обрабатывает Telegram `notifications.update`, сохраняет локальный
`integrator.telegram_state`, затем переносит четыре флага в `public.user_notification_topics`.

В executor отсутствующее локальное состояние трактуется как «всё включено»
(`kernel/domain/executor/handlers/notifications.ts:15-88`, `helpers.ts:223-230`), тогда как domain helper и
DB-defaultы имеют false (`kernel/domain/usecases/notifications.ts:3-11` и schema defaults). Уже одно это
показывает, что дефолт сейчас не единый канон.

Webapp уже имеет эквивалентный writer
`apps/webapp/src/infra/upsertBroadcastDefaultsAfterChannelBind.ts:1-30`; чтение отсутствующей channel-pref
трактует как true/true в `infra/repos/pgChannelPreferences.ts:62-69`.

**Целевой владелец и дверь.** Webapp preferences policy/service. Создание binding в webapp вызывает один
утверждённый default policy. Явный callback пользователя идёт узкой командой изменения preference; интегратор
может держать локальный UI cache, но public row и значение по умолчанию определяет webapp.

**Существующие данные.** Существующие явные rows и opt-outs не перезаписывать. До cutover сравнить local
Telegram flags, public topic rows, missing rows и channel defaults; конфликт разрешать в пользу явного
пользовательского выбора, не «последней записи интегратора».

**Если перенести неаккуратно.** Upsert defaults на каждом bind/retry снова включает отключённые уведомления;
разные missing-row semantics дают UI «выключено» при фактической рассылке; смешение transactional messages и
optional notifications создаёт consent-риск.

## 4. Миграция существующих данных и идемпотентность

D15b начинает не с отзыва grants, а со следующих артефактов:

1. **Read-only census** с воспроизводимыми counts и samples по пяти наборам из раздела 3. SQL не изобретать в
   этом исследовании: использовать/добавить штатный repo script после утверждения схемы.
2. **Command ledger/idempotency** в webapp/public: unique source + event/command id, request fingerprint,
   outcome/canonical id и timestamps. Новая горячая колонка получает индекс в той же миграции.
3. **Evidence provenance** для новых phone/enrollment решений. Источник должен сохраняться, а не существовать
   только TypeScript enum/log line.
4. **Integrator-owned durable retry**: webhook можно подтвердить provider-у после durable enqueue; временная
   недоступность webapp не возвращает direct-public fallback. Повтор приходит с тем же key.
5. **Per-actor serialization + DB constraints**: lock/unique binding защищают гонку разных events; ledger
   защищает повтор одного event. Одна защита не заменяет другую.
6. **No dual authority**: shadow phase только читает/сравнивает. После cutover конкретного caller его old direct
   writer не имеет права параллельно принимать решения.

Миграция сохраняет canonical ids, aliases, явные preferences и enrollment statuses. Она не делает phone-only
merge, blanket trust, blanket enrollment или reset preferences. Любая неоднозначная строка остаётся
неизменённой и попадает в review set с причиной.

## 5. Утверждаемая схема по предметам

| Предмет | Кто решает | Дверь интегратора | Existing data | Безопасный отказ |
|---|---|---|---|---|
| Create person | webapp identity service | `observe-messenger-actor` | сохранить ids/aliases; классифицировать anchors | durable `deferred`, без public write |
| Merge | webapp merge policy | evidence в identity/phone command | только доказуемые stubs автоматически | `conflict`, без merge |
| Phone trust | webapp phone policy | тип verified provider proof или завершённый webapp challenge | census provenance; сомнительным re-verify | phone untrusted, без identity match |
| Enrollment | webapp patient-organization service | explicit invite/booking/channel-org evidence | сохранить statuses; no-evidence unassigned | без enrollment, нейтральный onboarding |
| Defaults | webapp preferences service | explicit user command, не caller-chosen default | сохранить opt-outs/явные rows | optional notifications off |

Схема считается утверждённой только после ответов владельца на раздел 6, записи выбранных вариантов в этот
документ и отдельной acceptance отметки владельца. Сам исполнитель галочку D15a не ставит.

## 6. Развилки, которые закрывает владелец

### O1. Какой messenger phone даёт trust

- Варианты: (a) любой полученный phone; (b) только Telegram owned-contact / MAX с валидным HMAC /
  завершённый webapp OTP; (c) messenger phone никогда не даёт trust.
- Рекомендация: **(b)**, с сохранением proof source.
- Безопасное умолчание: raw `setphone`, MAX без hash/token и прочий неподтверждённый phone не ставят trust и
  не участвуют в identity match.

### O2. Когда разрешён автоматический merge

- Варианты: (a) при любом совпадении phone; (b) только поглощение доказуемого пустого technical anchor при
  непротиворечивой сильной binding/evidence; (c) всегда manual review.
- Рекомендация: **(b)**; любой meaningful/dependent data или конфликт bindings → review.
- Безопасное умолчание: **(c)** — вернуть `conflict`, ничего не менять.

### O3. Как обращаться с общим/переиспользованным номером и выбирать target

- Варианты: (a) phone всегда побеждает; (b) старый booking-count/phone/age heuristic; (c) phone доказывает
  владение номером, но не тождество; реальный account/card сохраняется, конфликт review.
- Рекомендация: **(c)**; старую эвристику разрешить только внутри узкого O2 technical-stub case.
- Безопасное умолчание: не merge и не переносить binding.

### O4. Создаёт ли первый messenger-контакт enrollment

- Варианты: (a) `active` в единственной организации; (b) `invited` при explicit channel→org evidence;
  (c) не создаёт enrollment до invite/booking/authenticated clinic action.
- Рекомендация: **(c)**; если владелец требует связь канала с клиникой — только **(b)**, никогда global count.
- Безопасное умолчание: без enrollment.

### O5. Что делать с существующими messenger users без enrollment

- Варианты: (a) blanket active default org; (b) evidence-only backfill, иначе unassigned; (c) все остаются
  unassigned до явного действия.
- Рекомендация: **(b)**, статус evidence-driven и по умолчанию `invited`, existing statuses не менять.
- Безопасное умолчание: **(c)**.

### O6. Дефолт уведомлений после нового channel binding

- Варианты: (a) всё on; (b) transactional/service messages отдельно, optional topics off до opt-in;
  (c) всё off.
- Рекомендация: **(b)** и сохранение явных пользовательских choices.
- Безопасное умолчание: optional notifications off; не перезаписывать существующую row.

### O7. Кто владеет public `user_channel_bindings`

- Варианты: (a) интегратор напрямую; (b) webapp identity service, интегратор хранит лишь собственный
  technical anchor и читает узкий resolver/result.
- Рекомендация: **(b)**, потому что binding утверждает тождество provider actor и человека.
- Безопасное умолчание: никаких direct public binding mutations у будущей роли интегратора.

### O8. Поведение при недоступном webapp identity command

- Варианты: (a) уронить webhook; (b) временно вернуть direct-public fallback; (c) durable enqueue, ack provider,
  retry с тем же key и ограниченный neutral response.
- Рекомендация: **(c)**.
- Безопасное умолчание: queue/deferred без canonical mutation; direct fallback запрещён.

## 7. Обязательный порядок D15b и риск

| Шаг | Что должно быть доказано до следующего шага | Риск |
|---|---|---|
| 1. Утвердить схему | Владелец закрыл O1-O8; границы пяти предметов и safe failures записаны здесь | **Критический продуктовый**: без этого код закрепит случайные правила phone/merge/enrollment |
| 2. Миграция и идемпотентность | Census, reviewed classification, command ledger, provenance, indexes, rollback; повтор команды даёт тот же outcome | **Высокий data-integrity**: дубли, чужой trust/enrollment, потеря opt-outs |
| 3. Переключить вызывающих | По одному переключены first webhook, support resolver, notification update, phone/link flows; old path не dual-writes; webapp outage уходит в durable retry | **Критический availability/identity**: новый webhook или retry не должен падать/раздваивать canon |
| 4. Живое доказательство на TEST | Telegram и MAX new actor, exact replay, concurrency, verified/unverified phone, conflict merge, no-evidence enrollment, explicit preference, outage/recovery; SQL evidence показывает только webapp public writer | **Критический integration**: unit tests не доказывают grants, provider input и процессный retry |
| 5. Удалить широкие записи | Удалены D1 direct writers/callers и grants на `platform_users`, aliases/merge, public bindings, enrollments, prefs/topics; negative TEST доказывает denied direct write, а новый webhook остаётся жив | **Критический cutover**: рано — outage; неполно — D17 фиктивен |

После этого D17 может выдать и проверить узкую роль только на integrator-owned tables/outbox и разрешённую
доставку/read contract. Нельзя считать aggregate CI или факт наличия API доказательством шагов 3-5.

### Минимальная TEST-матрица шага 4

- новый Telegram actor и новый MAX actor: provider webhook успешен, один canonical user/binding;
- exact replay и два concurrent events: один outcome, без дубликатов;
- Telegram owned contact проходит; `/start setphone_<чужой>` не даёт trust/merge;
- MAX HMAC valid проходит; missing/invalid HMAC не даёт trust;
- existing phone collision с meaningful users возвращает conflict, данные не переносятся;
- новый actor без org evidence не получает enrollment; explicit invite flow даёт утверждённый status;
- существующий opt-out переживает bind/retry; новый optional default соответствует O6;
- webapp недоступен: webhook не делает public write, команда durable; после восстановления применяется один раз;
- под будущей narrow role прямой `platform_users` write denied, но весь новый-user flow проходит.

## 8. Доказательство полноты поиска

### Индекс: смысловые и точные запросы

Обязательный BM25-инструмент запускался как
`node /home/dev/brain/tools/code-search.mjs "<query>" --repo bcb -k N` (индекс на момент исследования:
2026-07-31T10:15:03Z, 22 334 chunks). Выполнены попытки:

1. `integrator creates platform_users merge people phone enrollment default preferences`
2. `platform_users INSERT UPDATE integrator`
3. `merge platform user by phone integrator`
4. `enrollment identity integrator`
5. `default notification preferences platform user integrator`
6. `webhook new user identity platform_users`
7. `identity reconcile canonical platform user`
8. `platform identity ops phone merge`
9. `writeIdentityAndPreferencesDirect`
10. `createOrResolvePlatformUser`
11. `ensurePlatformUser`
12. `writeIdentityAndPreferences`
13. `integrator_user_id platform_users`
14. `org_enrollments writeIdentityAndPreferencesDirect`
15. `user_subscriptions_webapp writeIdentityAndPreferencesDirect`
16. `platform_user_channel_bindings writeIdentityAndPreferencesDirect`
17. `type user.upsert writeDb integrator webhook Telegram MAX`
18. `dispatchRequestContact user.phone.link Telegram contact`
19. `actorResolutionPort ensure user upsert incoming event`
20. `notifications.update handler callback Telegram`
21. `org_enrollments insert integrator public`
22. `user_channel_preferences default bind`
23. `patient_phone_trust_at integrator`
24. `mergePlatformUsersInTransaction phone_bind projection integrator`
25. `pgUserProjection org enrollment create default organization`
26. `user upserted event enrollment organization`
27. `platform user projection org_enrollments insert`
28. `identity webhook enrollment default clinic`
29. `brand new messenger identity organization enrollment`
30. `default enrollment new Telegram user`
31. `apps webapp ARCHITECTURE целевая схема интегратор приём доставка канон`
32. `platform identity target owner webapp integrator doorway M2M`
33. `identity scenarios code map messenger phone trust merge enrollment`
34. `platform user merge invariants safe merge`
35. `webapp.phoneMessengerBind.complete implementation M2M route enrollment`
36. `phoneMessengerBind complete org enrollment active`
37. `channelLink complete phoneNormalized needsPhone webapp`
38. `patient enrollment messenger bind activation`
39. `orgEnrollments insert status invited active webapp service`
40. `upsert org enrollment patient organization port`
41. `createManualPatientVisit enrollment idempotent`
42. `patient invite redeem enrollment active`
43. `platform user phone history trusted source provenance patient_phone_trust_at`
44. `patient_phone_trust_at source enum trusted phone policy`
45. `phone history messenger source schema`

Семантический `codeq.sh` отдельно пробовался для пяти смыслов: создание по webhook, phone merge,
enrollments, defaults и target webapp door. Все пять попыток вернули `no DSN (secrets/storage.env)`. Это
зафиксированное ограничение инструмента; полнота добиралась BM25, точными символами, call graph и DML-аудитом.

### Точечная проверка после индекса

После получения символов выполнены `rg` по:

- всем определениям/вызовам `writeIdentityAndPreferencesDirect`, `user.phone.link`,
  `mergePlatformUsersInTransaction`, `applyMessengerPhonePublicBind`, `resolveDirectPublicActor`;
- всем упоминаниям `org_enrollments`/`orgEnrollments` в `apps/integrator/src`;
- всем DML-паттернам `INSERT/UPDATE/DELETE` для `platform_users`, `patient_phone_trust_at`,
  `user_channel_preferences`, `user_notification_topics`, `org_enrollments` в integrator и merge package;
- Telegram/MAX scripts и executor callers `notifications.update`, `phoneMessengerBind.complete`,
  `channelLink.complete`;
- webapp writers/ports для identity, phone bind, channel bind, patient organization и preferences.

DML-аудит подтвердил direct writes identity/preferences и отсутствие runtime DML интегратора в
`org_enrollments`; найденные enrollment occurrences — reads, schema/migrations и webapp writers. Поиск был
сначала индексным, затем точечным; слепого полного чтения репозитория не использовалось.

## 9. Не считать доказательством завершения

- комментарий в D1-файле о том, что writer «не wired»: `writePort.ts:286-343` доказывает обратное;
- зелёные unit tests без TEST процесса и будущих DB grants;
- наличие подписанного API, пока caller продолжает direct write после ответа;
- отсутствие `org_enrollments` DML, пока integrator сам угадывает org context;
- отзыв части grants, пока merge/bind/default writers остаются достижимыми.
