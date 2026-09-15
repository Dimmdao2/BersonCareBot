Э5 — широкий единый post-auth гейт, а не локальная правка формы; главный риск — отрезать телефонные, мессенджерные и пришедшие из публичной записи учётки до безопасной привязки подтверждённой почты.

# Э5: замер почты при входе в кабинет

Дата замера: 15.09.2026. Среда: только DEV на хосте `localhost` (`151.241.228.122`, проверено командой
`hostname && hostname -I`), база `bcb_webapp_dev`; PROD не читался и не изменялся. Код, миграции и тесты не
менялись.

Оракул — Р5 плана: почта обязательна при входе в кабинет, а привязка почты или телефона чужой
пациентской учётки сливает учётки без конфликта
(`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md:11-20`). Канон объясняет границу: это единая
опознавательная система поверх бота, OAuth и телефона; штатные привязки не конфликтуют, а блокер ровно один —
медицинские данные с обеих сторон внутри одной организации
(`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:406-443`). Э5 в плане отложен и не реализуется этим замером
(`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md:83-84`).

## 1. Живые двери пациента сегодня

Под «дверью» ниже понимается путь, который способен создать пациентскую сессию или провести уже
идентифицированного пациента в кабинет. Наличие обработчика и включённый toggle не означают, что внешний
провайдер настроен: доступность канала дополнительно проверяется по credentials
(`apps/webapp/src/modules/auth/authChannelPolicy.ts:41-87`).

| Дверь | Маршрут и реализация | Чем опознаётся человек | Подтверждённая почта обязательна сейчас |
|---|---|---|---|
| Уже существующая сессия | `GET /app` либо любой `/app/patient/**`; `apps/webapp/src/app/app/AppEntryRsc.tsx:48-59`, `apps/webapp/src/app/app/patient/layout.tsx:67-94` | Session cookie и роль пациента | **Нет.** `/app` сразу редиректит вошедшего, а layout проверяет сессию, роль и business/phone gate, но не email. |
| Общая браузерная дверь | `GET /app`, `GET /app/patient/login`; `apps/webapp/src/app/app/page.tsx:9-16`, `apps/webapp/src/app/app/(role-login)/patient/login/page.tsx:1-14`, `apps/webapp/src/app/app/AppEntryRsc.tsx:34-85` | Выбранный метод: email OTP, телефонный OTP через разрешённый канал, OAuth либо passkey | **Нет для двери в целом.** Матрица пациента реализует все четыре метода (`apps/webapp/src/shared/lib/surface/surfaceAuthPolicy.ts:20-33`). Email OTP требует почту; телефонный confirm принимает только challenge/code и создаёт сессию без проверки почты (`apps/webapp/src/app/api/auth/phone/confirm/route.ts:25-31,89-91,170-185`); passkey не просит почту; OAuth может создать учётку только по стабильному `sub` (`apps/webapp/src/modules/auth/oauthWebLoginResolve.ts:31-54,93-105`). По DEV-переключателям ниже passkey сейчас выключен, а OAuth-провайдеры не настроены: это реализованные, но не доступные сегодня варианты общей двери. |
| Telegram Mini App | `GET /app/tg` → `POST /api/auth/telegram-init`; `apps/webapp/src/app/app/tg/page.tsx:1-8`, `apps/webapp/src/app/api/auth/telegram-init/route.ts:64-96,129-164` | Подписанный Telegram `initData`, затем Telegram binding | **Нет.** После проверки `initData` обработчик создаёт сессию без email. |
| Telegram Login Widget | `POST /api/auth/telegram-login`; `apps/webapp/src/app/api/auth/telegram-login/route.ts:24-64`, `apps/webapp/src/modules/auth/service.ts:878,932-933` | Подпись виджета (`verifyTelegramLoginWidgetSignature`, `apps/webapp/src/modules/auth/telegramLoginVerify.ts:13`) и существующий Telegram binding — схема подписи ДРУГАЯ, чем `initData` у Mini App, поэтому это отдельная дверь, а не та же другими словами | **Нет.** `persistNewAuthSession(cookieStore, buildSession(user), 'telegram')` ставит настоящую сессионную куку, почта не проверяется нигде на пути. Гейтов ровно три: `isAuthChannelEnabled('telegram')` (`route.ts:24`, по замеру ниже канал на пациентской поверхности ВКЛЮЧЁН), наличие бот-токена и подпись. Whitelist гейтом не является — `apps/webapp/src/modules/auth/envRole.ts:85-91` `isWhitelistedAsync` всегда `return true`. Кнопку виджета наш UI сегодня не рисует (`TelegramLoginButton.tsx` нигде не отрисован), но виджет хостит Telegram, а callback — обычный POST JSON на наш эндпоинт, поэтому дверь исполнима. |
| MAX Mini App | `GET /app/max` → `POST /api/auth/max-init`; `apps/webapp/src/app/app/max/page.tsx:1-8`, `apps/webapp/src/app/api/auth/max-init/route.ts:203-259` | Подписанный MAX `initData`, затем MAX binding | **Нет.** После exchange обработчик создаёт сессию без email. |
| Код из Telegram/MAX-бота | Бот выдаёт код и URL кабинета в `apps/integrator/src/kernel/domain/executor/executeAction.ts:444-475`; браузер завершает `/api/auth/phone/confirm` | Подтверждённый телефон плюс доказанный messenger context | **Нет.** Финальная дверь — тот же phone confirm без email. |
| Старый token exchange | `GET /app?t=…` / `?token=…` → `POST /api/auth/exchange`; классификация в `apps/webapp/src/app/app/AppEntryRsc.tsx:50-85`, exchange в `apps/webapp/src/app/api/auth/exchange/route.ts:24-32,55-72,96-130` | Подписанный integrator token с Telegram/MAX binding | **Нет.** Успешный exchange сразу возвращает redirect и ставит сессию. Это всё ещё исполнимый compatibility-path в коде, хотя канон велит убрать такой диплинк как класс (`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:84-103`). |
| Ссылка врача | `GET /join/start#<bearer>` → `/api/join/exchange` → `/join/[continuation]`; `apps/webapp/src/app/join/start/JoinStartClient.tsx:10-35`, `apps/webapp/src/app/api/join/exchange/route.ts:27-85`, `apps/webapp/src/app/join/[continuation]/JoinPatientClient.tsx:143-197` | Bearer приглашения; затем совпавшая живая сессия либо email OTP | **Да для незалогиненного/несовпавшего человека; нет для совпавшей живой сессии.** Совпавшая сессия принимает приглашение и сразу идёт в кабинет (`apps/webapp/src/app/api/join/exchange/route.ts:44-52,66-85`). Иначе UI требует email и код (`apps/webapp/src/app/join/[continuation]/JoinPatientClient.tsx:165-197,214-243`), а confirm ставит сессию (`apps/webapp/src/app/api/join/email/confirm/route.ts:23-28,52-84,102-111`). |
| Публичная запись | `GET /{clinicSlug}/booking` → `/api/booking/public/create` → `/api/booking/public/create/confirm`; `apps/webapp/src/app/[clinicSlug]/booking/page.tsx:20-55` | По умолчанию SMS-код на телефон; email OTP — альтернативный proof | **Нет.** В body телефон обязателен, email опционален (`apps/webapp/src/app/api/booking/public/bookingPublicBodySchema.ts:10-18`); клиент по умолчанию выбирает SMS (`apps/webapp/src/shared/publicBook/usePublicCreateBooking.ts:35-45,116-165`); после SMS создаётся/находится телефонная учётка и ставится сессия (`apps/webapp/src/app-layer/booking/identifyPublicBookingPayer.ts:27-40`, `apps/webapp/src/app/api/booking/public/create/confirm/route.ts:98-130`). |
| Публичная заявка | `GET /{clinicSlug}/lead` → `/api/leads/public/email-otp/start` → `/api/leads/public/submit`; `apps/webapp/src/app/[clinicSlug]/lead/page.tsx:8-26` | Подтверждённая email-сессия; телефон в форме лишь дополнительный контакт | **Да уже сейчас.** UI запускает email OTP и затем submit (`apps/webapp/src/shared/publicBook/PublicLeadForm.tsx:54-105,130-151`); backend требует email и сессию с тем же подтверждённым email (`apps/webapp/src/app/api/leads/public/submit/route.ts:16-48`). Пути успешной заявки без email в этих трёх звеньях нет. |

Защищённый кабинет сам по себе требует лишь сессию, роль и действующий business/phone gate:
`apps/webapp/src/app/app/patient/layout.tsx:67-94` и
`apps/webapp/src/modules/platform-access/patientClientBusinessGate.ts:13-53`. Проверки подтверждённой почты в
этом chokepoint нет. Поэтому добавление требования только в одну форму входа оставит обходы через остальные
сессиеобразующие двери.


**Поправка после независимого аудита (`e5-audit-20260915`, 15.09).** Строка Telegram Login Widget в
таблице выше пропущена первой редакцией этого замера и дописана по находке аудита. Это не деталь:
по замеру раздела 2 **91 человек** имеет привязку Telegram/MAX и не имеет почты вовсе — ровно та
когорта, которую эта дверь обслуживает, и ровно тот обход, ради поиска которого замер и делался.
Пропуск двери в перечне «всех живых дверей» означал бы, что Э5 закроет вход и оставит форточку.

### Фактическая матрица переключателей DEV

Команда ниже читала только известные boolean-ключи в `BEGIN READ ONLY` и завершилась `ROLLBACK`. Отсутствующие
строки поверхности заменены теми же compiled defaults, что использует
`apps/webapp/src/modules/auth/surfaceAuthSettings.ts:49-66`.

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F '|' -A -c \"BEGIN READ ONLY; WITH requested(key, compiled_default) AS (VALUES ('auth_surface_patient_email_enabled','true'),('auth_surface_patient_sms_enabled','false'),('auth_surface_patient_telegram_enabled','true'),('auth_surface_patient_max_enabled','true'),('auth_surface_patient_oauth_google_enabled','false'),('auth_surface_patient_oauth_yandex_enabled','true'),('auth_surface_patient_oauth_vk_enabled','false'),('auth_surface_patient_oauth_apple_enabled','false'),('auth_surface_patient_passkey_enabled','false')), toggles AS (SELECT r.key, COALESCE(s.value_json->>'value', r.compiled_default) AS effective_toggle, (s.key IS NOT NULL) AS overridden_in_db FROM requested r LEFT JOIN public.system_settings s ON s.key=r.key AND s.scope='global' AND s.organization_id IS NULL) SELECT key, effective_toggle, overridden_in_db FROM toggles ORDER BY key; WITH providers(key) AS (VALUES ('oauth_google_enabled'),('oauth_yandex_enabled'),('oauth_vk_enabled'),('oauth_apple_enabled')) SELECT p.key, COALESCE(s.value_json->>'value','false') AS configured FROM providers p LEFT JOIN public.system_settings s ON s.key=p.key AND s.scope='global' AND s.organization_id IS NULL ORDER BY p.key; ROLLBACK;\""
```

Результат: на patient surface включены email, Telegram и MAX; SMS и passkey выключены. У всех provider-specific
OAuth capability — `false`, поэтому OAuth в DEV сейчас фактически не является доступной дверью, хотя код двери
существует. Ни один из девяти surface-toggle не переопределён строкой DEV-базы. Наличие credentials для email,
Telegram и MAX этим запросом намеренно не раскрывалось и не измерялось; их API дополнительно fail-closed по
capability.

## 2. Сколько пациентов затронет требование

Когорта: канонические `platform_users` с `role='client'`, без `merged_into_id`, глобальной блокировки и архива.
«Без почты» означает отсутствие любой строки `user_contacts.contact_kind='email'`; «без подтверждённой почты» —
отсутствие email-контакта с `confirmed_at`. «Только телефон» здесь строго означает: есть подтверждённый телефон,
нет никакой почты и нет ни одного messenger binding. «С мессенджером» означает любой допустимый
`user_channel_bindings.channel_code`: Telegram, MAX или VK
(`apps/webapp/db/schema/schema.ts:453-488`); Telegram/MAX дополнительно посчитаны отдельным bot-срезом.

Точные числа получены одной командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F '|' -A -c \"BEGIN READ ONLY; WITH patients AS (SELECT id, is_blocked, is_archived FROM public.platform_users WHERE role='client' AND merged_into_id IS NULL), facts AS (SELECT p.*, EXISTS (SELECT 1 FROM public.user_contacts c WHERE c.platform_user_id=p.id AND c.contact_kind='email') AS has_email, EXISTS (SELECT 1 FROM public.user_contacts c WHERE c.platform_user_id=p.id AND c.contact_kind='email' AND c.confirmed_at IS NOT NULL) AS has_confirmed_email, EXISTS (SELECT 1 FROM public.user_contacts c WHERE c.platform_user_id=p.id AND c.contact_kind='phone' AND c.confirmed_at IS NOT NULL) AS has_confirmed_phone, EXISTS (SELECT 1 FROM public.user_channel_bindings b WHERE b.user_id=p.id AND b.channel_code IN ('telegram','max','vk')) AS has_messenger, EXISTS (SELECT 1 FROM public.user_channel_bindings b WHERE b.user_id=p.id AND b.channel_code IN ('telegram','max')) AS has_bot_messenger FROM patients p), eligible AS (SELECT * FROM facts WHERE NOT is_blocked AND NOT is_archived) SELECT metric, people FROM (SELECT 1 ord, 'blocked_or_archived' metric, count(*)::bigint people FROM facts WHERE is_blocked OR is_archived UNION ALL SELECT 2, 'login_eligible_total', count(*)::bigint FROM eligible UNION ALL SELECT 3, 'eligible_without_confirmed_email', count(*)::bigint FROM eligible WHERE NOT has_confirmed_email UNION ALL SELECT 4, 'eligible_without_any_email', count(*)::bigint FROM eligible WHERE NOT has_email UNION ALL SELECT 5, 'eligible_confirmed_phone_only_no_email_no_messenger', count(*)::bigint FROM eligible WHERE has_confirmed_phone AND NOT has_email AND NOT has_messenger UNION ALL SELECT 6, 'eligible_messenger_without_any_email', count(*)::bigint FROM eligible WHERE has_messenger AND NOT has_email UNION ALL SELECT 7, 'eligible_messenger_without_confirmed_email', count(*)::bigint FROM eligible WHERE has_messenger AND NOT has_confirmed_email UNION ALL SELECT 8, 'eligible_telegram_or_max_without_any_email', count(*)::bigint FROM eligible WHERE has_bot_messenger AND NOT has_email) measured ORDER BY ord; ROLLBACK;\""
```

```text
blocked_or_archived|0
login_eligible_total|270
eligible_without_confirmed_email|236
eligible_without_any_email|143
eligible_confirmed_phone_only_no_email_no_messenger|34
eligible_messenger_without_any_email|91
eligible_messenger_without_confirmed_email|121
eligible_telegram_or_max_without_any_email|91
```

Следствие для оценки Э5: обязательную проверку почты при следующем входе увидит не редкий хвост, а большинство
DEV-когорты. Отдельно нельзя считать группы «только телефон» и «мессенджер» взаимоисключающими за пределами
строго названного `phone_only`-показателя: у человека может быть и телефон, и binding.

## 3. Что перестанет проходить при прямом требовании почты

Если поставить fail-closed проверку подтверждённой почты перед созданием сессии или перед каждым из перечисленных
действий, изменятся такие живые пути:

1. **Уже живущая сессия без почты.** `/app` сразу редиректит её по роли
   (`apps/webapp/src/app/app/AppEntryRsc.tsx:48-59`), а patient layout пропускает по нынешнему gate
   (`apps/webapp/src/app/app/patient/layout.tsx:67-94`). Немедленное требование на каждом request оборвёт уже
   начатую работу; требование только в формах входа эту сессию не затронет и оставит обход.
2. **Браузерный вход по телефону; при будущем включении — также passkey и успешный OAuth.** Эти методы создают
   сессию без email; точные места
   прохода — `apps/webapp/src/app/api/auth/phone/confirm/route.ts:170-185` и
   `apps/webapp/src/modules/auth/oauthWebLoginResolve.ts:31-34,93-105`. Passkey является самостоятельным методом
   поверхности (`apps/webapp/src/shared/lib/surface/surfaceAuthPolicy.ts:30-33`). Без общего post-auth экрана
   простая проверка превратит эти методы в тупик.
3. **Telegram/MAX Mini App.** Сессия возникает сразу после доказанного `initData`:
   `apps/webapp/src/app/api/auth/telegram-init/route.ts:129-164` и
   `apps/webapp/src/app/api/auth/max-init/route.ts:203-259`. Требование до привязки почты отрежет пользователей без
   email. Отдельно существует незакрытое расхождение: код и DEV surface-toggle оставляют двери, а канон велит
   временно отключить mini apps (`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:84-103`). Это вопрос владельцу,
   не разрешение исправлять его в Э5.
4. **Бот и compatibility token exchange.** Телефонный код проходит через
   `apps/webapp/src/app/api/auth/phone/confirm/route.ts:25-31,170-185`; token exchange — через
   `apps/webapp/src/app/api/auth/exchange/route.ts:54-72,126-130`. Оба пути сейчас не имеют шага почты.
5. **Ссылка врача.** Для нового/незалогиненного пациента почта уже обязательна, поэтому этот путь сам по себе не
   ломается. Но совпавшая живая сессия принимает приглашение и сразу направляется в кабинет без email
   (`apps/webapp/src/app/api/join/exchange/route.ts:44-52`). Новый гейт должен сохранить узкое owner-решение
   «сначала принять своей сессией», а затем потребовать почту перед кабинетом, иначе приглашение станет повторно
   требовать уже доказанную личность.
6. **Публичная запись.** SMS — текущий default, email опционален
   (`apps/webapp/src/shared/publicBook/usePublicCreateBooking.ts:35-45,116-165`); после SMS backend ставит
   пациентскую сессию (`apps/webapp/src/app/api/booking/public/create/confirm/route.ts:98-130`). Если почта станет
   условием самой записи, человек без неё не сможет записаться. Если условием останется только вход в кабинет,
   запись можно завершить, а созданную сессию направить на post-auth email gate.
7. **Публичная заявка.** **Не перестанет проходить по причине нового требования:** успешной ветки без
   подтверждённой почты сейчас нет. Проверены маршрут страницы
   `apps/webapp/src/app/[clinicSlug]/lead/page.tsx:8-26`, UI
   `apps/webapp/src/shared/publicBook/PublicLeadForm.tsx:54-105,130-151` и backend
   `apps/webapp/src/app/api/leads/public/submit/route.ts:16-48`. Но при указанном в форме телефоне чужой учётки
   остаётся отдельный разрыв слияния, описанный ниже.

Инвентаризация искала двери сначала запросами `code-search` по `patient login entry`, `doctor invite`,
`public booking`, `public lead`, `telegram init`, `max init`, `oauth callback`, затем точными обратными ссылками
`rg` на `/api/auth/*`, `/api/join/*`, `/api/booking/public/*`, `/api/leads/public/*` и места постановки сессии.
Именно поэтому отсутствие пути заявки без email — результат проверки трёх звеньев, а не вывод по названию формы.

## 4. Готовность обещанного §18 слияния

§18 обещает нормальное слияние в `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:410-423`; заявки прямо названы
неблокирующими в `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:434-439`.

### Что уже есть

- Общий движок Э1–Э4 уже вызывается при **привязке чужой подтверждённой почты** из профиля:
  `apps/webapp/src/infra/repos/pgEmailAuth.ts:259-355`. Он строит human prompt, требует совпадающее решение,
  вызывает `mergePlatformUsersInTransaction`, а медицинский конфликт сохраняет для разбора.
- API принимает решение человека и возвращает prompt:
  `apps/webapp/src/app/api/auth/email/confirm/route.ts:20-24,67-105` и
  `apps/webapp/src/app/api/patient/email-change/confirm/route.ts:27-29,60-97`.
- UI уже умеет показать один общий `AccountMergeConfirmation` и повторить запрос с `mergeDecision`:
  `apps/webapp/src/shared/ui/patient/EmailAccountPanel.tsx:97-146,318-355`;
  общий компонент — `apps/webapp/src/shared/ui/patient/auth/AccountMergeConfirmation.tsx:44-80`.
- Телефонная привязка имеет ту же механику: prompt и merge для чужого телефона в
  `apps/webapp/src/infra/repos/pgUserByPhone.ts:591-627`, для чужого messenger binding — там же
  `:697-750`; `/api/auth/phone/confirm` возвращает prompt в `:127-129`, а
  `apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx:238-290,592-629` показывает его и повторяет
  confirm.

Итого: **ядро слияния и готовый диалог существуют**, поэтому Э5 не требует нового merge engine. Но Э5 не
сводится к одной проверке наличия адреса.

### Чего не хватает до сквозного Э5

1. **Единого post-auth email gate.** `patient/layout` и `patientClientBusinessGate` почту не проверяют; профильная
   панель — добровольная настройка. Нужна одна точка продолжения после phone/messenger/OAuth/passkey, а не
   повторение логики в каждой двери.
2. **Ссылка врача не подключена к штатному слиянию чужой почты.** При unbound invite и почте другой учётки
   текущая DB-функция создаёт `patient_merge_candidates` и возвращает `conflicting_identity`, не human prompt и
   нормальное слияние (`apps/webapp/db/drizzle-migrations/20260911T020000_invite_proof_doors_stop_re_signing_what_the_port_binds.sql:333-350`;
   HTTP превращает это в `409` в `apps/webapp/src/app/api/join/email/confirm/route.ts:67-75`). Это не соответствует
   штатным случаям §18, пункты 1–4 (`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:417-423`).
3. **Заявка не доводит штатное слияние до решения человека.** Если введённый телефон уже принадлежит другой
   учётке, `resolveVerifiedLeadApplicant` вызывает `claimVerifiedEmail` без `humanMergeDecision`; готовый merger
   закономерно возвращает `merge_confirmation_required`, который превращается в
   `lead_identity_merge_conflict` (`apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts:44-55`). UI
   заявки умеет только общий error, а не `AccountMergeConfirmation`
   (`apps/webapp/src/shared/publicBook/PublicLeadForm.tsx:92-105`). Это расходится с прямым обещанием §18 о
   штатном переносе заявок.
4. **OAuth collision остаётся отдельным fail-closed случаем.** Когда подтверждённые email и phone провайдера
   указывают на разные учётки, resolver возвращает `contact_conflict`
   (`apps/webapp/src/modules/auth/oauthWebLoginResolve.ts:81-89`). Без решения владельца Э5 не должен ослаблять
   этот security boundary. Безопасная композиция — сначала успешный OAuth по непротиворечивой личности, затем
   общий email gate; конфликт самого ответа провайдера оставить fail-closed.

## 5. Лист развилок владельцу

Ниже один полный список продуктовых решений, без запуска реализации.

1. **Где стоит обязательность.** Рекомендация: после успешного primary proof (телефон, messenger, OAuth,
   passkey), но до первого открытия защищённого кабинета; выполнено только при наличии подтверждённого
   канонического email. Безопасный default: разрешены лишь экран привязки, повторная отправка кода, поддержка и
   выход; клинические данные до завершения не показываются.
2. **Что делать с уже живыми сессиями существующих пациентов.** Рекомендация: применять гейт при следующем
   успешном входе/обновлении идентичности, без массового отзыва текущих сессий. Безопасный default: текущие сессии
   не инвалидировать; новые сессии без почты направлять в ограниченный email gate.
3. **Граница публичной записи.** Рекомендация: не делать email условием создания записи или оплаты; завершить
   нынешний SMS-proof и потребовать почту только перед переходом в кабинет. Безопасный default: запись и платёж
   никогда не теряются из-за недоступности email; сессия остаётся на ограниченном экране.
4. **Ссылка врача при совпавшей сессии.** Рекомендация: сохранить owner-решение о приёме приглашения своей уже
   доказанной сессией, после чего вести в email gate вместо кабинета. Безопасный default: не требовать повторно
   bearer/email для самого приглашения и не открывать кабинет до подтверждения почты.
5. **Чужая почта в ссылке врача.** Рекомендация: подключить общий human confirmation и штатное слияние §18;
   медицинский конфликт по-прежнему уходит врачу. Безопасный default до этого: нынешний fail-closed
   `conflicting_identity`, без автоматического захвата контакта и без потери приглашения.
6. **Телефон чужой учётки в публичной заявке.** Рекомендация: показать общий human confirmation и после него
   перенести заявку штатным merger. Безопасный default до этого: нынешний `409`, без молчаливого объединения и
   без привязки чужого телефона; это безопасно для идентичности, но продуктово не выполняет §18 и потому не может
   считаться завершённым Э5.
7. **Mini Apps, которые канон велит отключить, а код и toggle оставляют.** Рекомендация: решение об их удалении/
   отключении вынести из Э5; пока путь исполним, он обязан попадать под тот же email gate. Безопасный default:
   Э5 не включает и не рекламирует Mini Apps, но и не оставляет через них обход обязательной почты.
8. **Поведение при недоступной почтовой доставке.** Рекомендация: не активировать Э5, пока transactional email
   capability не подтверждена живой приёмкой; после активации не делать скрытый per-request bypass. Безопасный
   default до готовности канала: оставить Э5 выключенным целиком, а не запереть пациентов в неработающем gate.
9. **Состояние после медицинского defer.** Рекомендация: сохранить доказанную текущую учётку и показывать статус
   разбора, поддержку и выход, но не данные найденной учётки до решения врача. Безопасный default: fail-closed на
   объединение и чужие данные, без удаления исходной сессии и без повторного создания дубля.

## НЕ СДЕЛАНО

- Э5 не начат: обязательность почты, post-auth gate и перечисленные подключения merge-flow не реализованы.
- Код, миграции, декларации привилегий и тесты не создавались и не менялись.
- Миграции на DEV не применялись; DB-запросы открывали `BEGIN READ ONLY`, успешные замеры завершились
  `ROLLBACK`. Два предварительных вызова capability-функций были отвергнуты обязательным accepted-context до
  чтения результата, завершились ошибкой и в выводы не включены; записей они не выполняли.
- Автоматические UI-тесты, второй Next-сервер, полный CI и `scripts/ci-record.mjs` не запускались.
- Живая UI-приёмка и проверка внешней доставки email/Telegram/MAX не проводились.
- Продуктовые развилки выше не решены за владельца.
- Строка вердикта в очередь/`feat` не записывалась; автор этого замера свою работу не аудировал.
