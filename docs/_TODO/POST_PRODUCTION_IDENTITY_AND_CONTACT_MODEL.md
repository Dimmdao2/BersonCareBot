# Post-production: единая модель пользователя, identity и контактов

**Статус:** TODO после запуска production. Не является gate текущего DEV → TEST → отдельно разрешённого PROD.

**Owner decision 14.08.2026:** найденные архитектурные проблемы обязательно сохранить, но не растягивать
текущий запуск ещё на неделю. Сейчас выполнить только малые безопасные исправления; полный переход начать после
того, как DEV и TEST работают, production отдельно разрешён и запущен, а ветки синхронизированы.

## 1. Продуктовый инвариант

- У человека одна каноническая, неповторимая учётная запись.
- У аккаунта может быть несколько телефонов, email и messenger bindings.
- Любой подтверждённый телефон или email — равноправный идентификатор входа; primary означает адрес/номер по
  умолчанию для доставки, а не единственную дверь входа.
- Подтверждение — свойство конкретного контакта; нужны дата и источник подтверждения. Отвязка номера снимает
  подтверждение номера, отвязка бота сама по себе его не снимает.
- ФИО, контакты, channel/OAuth bindings и медицинские данные — разные части модели. Будущая псевдонимизация
  medical store остаётся отдельным от этого workstream этапом.

Канон прежних owner-решений: [`IDENTITY_AND_MERGE_SCHEME.md`](runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md).

## 2. Что реально построено сейчас

### 2.1 Хранилище

- `public.platform_users` остаётся перегруженным account root: кроме id/role/merge/session state в нём до сих пор
  лежат phone/email, ФИО, DOB/gender и height/weight.
- `public.user_identity` создан как будущий источник ФИО, но пока поддерживается dual-write mirror из
  `platform_users`.
- `public.user_contacts` создан как будущий реестр phone/email. Уникальность телефона/email уже перенесена туда,
  часть login/readers уже читает её, но production writer `syncUserContactsMirror` сначала удаляет строки
  пользователя и заново собирает их из `platform_users`, `user_oauth_bindings` и `user_phone_history`. Поэтому
  фактически это пока зеркало, а D15b/6 не завершён.
- `public.user_channel_bindings` — отдельные messenger external-id bindings; их прежний дублирующий slice из
  `user_contacts` уже удалён миграцией `0382` и возвращаться не должен.
- `public.user_oauth_bindings` хранит provider identity и provider email.
- `public.user_phone_history` — временная история назначений/подтверждений номера, не contact source of truth.
- `public.platform_user_contacts` — вторая контактная модель: дополнительные, обычно неподтверждённые контакты,
  введённые врачом/админом/booking. Она не участвует в auth и имеет organization scope.

### 2.2 Кодовая модель

- `SessionUser` — plain typed object, не domain aggregate. В bounded-fix 14.08 он получил единый свежий
  `contacts[]` snapshot для всех phone/email с `isPrimary`, `confirmedAt`, `sourceOrigin`; compatibility-поля
  `phone` и `email` выводятся из primary contacts. Messenger bindings, session epoch и staff security state
  остаются в том же объекте. Это ещё не разделённые `SessionPrincipal` и `UserIdentitySnapshot`.
- `loadSessionIdentityUser` — единственный сборщик этого сессионного identity snapshot, но не полного user
  aggregate и не facade для медицинских/организационных данных.
- `IdentityPort` уже документирован как «single module that knows how a platform user's entity is assembled»,
  однако фактически только группирует четыре независимых порта: `projection`, `session`, `channelResolution`,
  `clients`. OAuth, channel-link, phone-bind и полноценный contact aggregate прямо оставлены follow-up.
- Кодовая база использует functional TypeScript + plain records + ports/services, а не Active Record классы.
  Это допустимо: доменная сущность не должна держать DB connection. Проблема не в отсутствии классов, а в
  отсутствии одного application-level identity facade и в том, что слишком много infra-кода знает физические
  таблицы/колонки.

## 3. Доказанные находки

### 3.1 D15b/6 закрыли формально, а не фактически

Живой DEV показывает полную паритетную копию основных контактов. Команда:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FILTER (WHERE contact_kind='phone' AND is_primary), count(*) FILTER (WHERE contact_kind='email' AND is_primary) FROM public.user_contacts;"
```

Результат: `200|126`. Расширенная read-only сверка дала `0` missing и `0` mismatch отдельно для phone и email.
Следствие: данные готовы к будущему cutover, но source-of-truth и writers не переведены.

### 3.2 Старые integrator contact tables не восстановлены

Read-only catalog query по `public`/`integrator` нашёл `platform_users`, `user_contacts`, `user_identity`,
`user_channel_bindings`, `user_oauth_bindings`, `user_phone_history`, `platform_user_contacts`; таблиц
`integrator.contacts`, `integrator.identities`, `integrator.users`, `integrator.telegram_users` нет.

### 3.3 Физическая схема протекла в infra

Верхняя граница production TS-файлов, где ещё встречаются legacy contact column names:

```bash
rg -l "phone_normalized|email_normalized|email_verified_at|patient_phone_trust_at" \
  apps/webapp/src/infra apps/integrator/src/infra packages/platform-merge/src \
  --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts'
```

Результат по каталогам: `35 + 7 + 8 = 50` файлов. Это верхняя граница: в неё входят readers, writers, типы и
несколько одноимённых полей других записей. Исходный D15b/6 census называл 36 contact readers.

Phone/bindings из `SessionUser` потребляют 32 production-файла:

```bash
rg -l "session\.user\.(phone|bindings)|user\.(phone|bindings)" apps/webapp/src \
  --glob '*.ts' --glob '*.tsx' --glob '!**/*.test.*' | wc -l
```

Результат: `32`.

### 3.4 SessionUser асимметричен

Телефон и messenger bindings попали в session snapshot исторически, когда patient activation строилась вокруг
телефона. Email OAuth/password/OTP появились позже отдельными путями. Архитектурного основания считать phone
важнее email нет; для auth они равноправны. Сессионный identity snapshot должен собирать phone/email одинаково и
нести confirmation metadata либо не нести контакты вообще.

### 3.5 Две контактные модели

`user_contacts` несёт global auth contacts, а `platform_user_contacts` — organization-scoped supplementary
contacts. Это не простой duplicate: clinic-specific неподтверждённый контакт нельзя бездумно сделать глобальным
login identifier или открыть другой клинике. Будущий единый contact aggregate обязан явно хранить scope,
confirmation и purpose; физическое объединение таблиц делается только после RLS/data migration design.

### 3.6 Незавершённый env cutover затронул auth lifecycle

После перехода на четыре port-context login общий runtime `DATABASE_URL` удалён, но docs и production runtime
проверяли `env.DATABASE_URL` не только в auth, а также в access-gates, `/api/me`, OAuth/email/channel-link,
doctor/patient pages и media delivery. Из-за этого рабочий port-context мог ошибочно считаться режимом «без БД»:
не перечитывался свежий identity snapshot/`session_epoch`, auth уходил в memory branches, patient gates и media
получали ложный no-DB. Bounded fix перевёл все решения «runtime DB настроена» на один
`webappRuntimeDatabaseIsConfigured()`.

Повторный production-кодовый поиск:

```bash
rg -n "env\\.DATABASE_URL|process\\.env\\.DATABASE_URL" apps/webapp/src \
  -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' -g '!*.spec.ts' | sort
```

оставляет только парсинг env, конфигурацию физических pool/startup, port-context URL и два чтения legacy URL для
локальной TEST-media fixture; ни один runtime availability predicate больше не зависит от агрегатного URL.
Post-production workstream не должен возвращать общий runtime URL.

### 3.7 Phone bind пересекает неправильные границы

Signed completion сначала пытался открыть старую безымянную pre-session relation transaction, которой нет в
declaration. После exact completion-state root живой `user.phone.link` дошёл до следующего разрыва: общий
`syncUserContactsMirror` потребовал OAuth relation для обычной телефонной привязки. Широкий grant был бы
маскировкой проблемы. Текущий запуск допускает узкий compatibility sync без OAuth; post-production решение —
direct canonical contact command внутри identity boundary.

### 3.8 Зелёный тест не равен доказанному пути

В этом workstream уже встречались формально зелёные проверки, которые не выполняли найденный runtime path либо
работали на ручном fixture после producer boundary. Канон: тест доказывает конкретный разрыв, только если он
падал на найденном дефекте или краснеет при независимой поломке этого поведения. Post-production перевод нельзя
закрывать source-string assertions, общим CI или одним агрегатным `IdentityPort` type без live/fault proof.

## 4. Другие связанные большие переделки, найденные в этом проходе

### 4.1 `user_identity` / ФИО — такой же незавершённый cutover

Readers частично переведены на `user_identity`, но writers продолжают dual-write, а ФИО остаётся в
`platform_users`. Ложное «готово» должно быть исправлено там же, где стоит статус D15b/5. Завершение: один source,
удаление COALESCE/mirror и legacy columns после parity/live proof.

### 4.2 Account root смешан с PII и medical attributes

`platform_users` сейчас одновременно account root, identity row и место для DOB/gender/height/weight. Медицинские
таблицы ссылаются на тот же physical user id. Полная деперсонализация уже исследована и owner-deferred: нужен
opaque medical subject и отдельная identity mapping boundary, но это самостоятельный privacy workstream, не
часть запуска и не побочный эффект contact cleanup.

### 4.3 Session cookie, principal и свежий user snapshot смешаны

`SessionUser` одновременно сериализуется в cookie и используется как свежая DB-проекция. Контакты и bindings
могут меняться независимо от cookie; authority должен приходить из DB, а cookie должен нести только principal и
revocation/assurance state. Нынешний refresh chokepoint полезен, но контракт нужно разделить явно.

### 4.4 Один facade заявлен, но не реализован

`assembleIdentityPort()` сейчас возвращает переданный объект без собственной сборки или policy. Следовательно,
изменение физической схемы всё ещё требует править много repository queries. Нужен настоящий identity application
facade с узкими методами, а не новый класс ради класса и не один гигантский объект со всей медициной.

### 4.5 Migration/deploy harness не должен собирать историческую схему с нуля

Отдельная A0/greenfield сборка миграций не входит в текущий или будущий обычный deploy. DEV обновляется на месте;
TEST после owner-approved очистки получает штатную schema/data migration + declaration reconcile. Если когда-либо
нужна disposable DB, структура копируется из отработанного DEV. Эту границу нельзя снова превратить в blocker
identity refactor или «чистый» тест, не совпадающий с реальным deploy path.

## 5. Целевая архитектурная граница

### SessionPrincipal

Минимум, который действительно относится к подписанной сессии/cookie: canonical user id, role, session epoch,
authentication assurance/2FA state и timestamps. Контакты и medical data в cookie не являются authority.

### UserIdentitySnapshot

Свежая application-level модель, собранная одним `UserIdentityPort`:

- account id/role/state;
- structured ФИО;
- `contacts[]`: kind, display/normalized value, primary, confirmedAt, confirmedVia, origin, scope;
- `channelBindings[]`;
- удобные производные `primaryPhone`, `primaryEmail`, `confirmedLoginContacts` вычисляются в одном месте.

Это может быть plain immutable object + функции либо facade с методами. Класс не является целью сам по себе.

### Отдельные data ports

Medical/clinical/program/payment data не загружаются целиком вместе с identity. Их получает application service
через отдельные scoped ports после проверки actor/subject/organization. Если API выглядит как
`user.medicalProfile()`, это facade над портом, а не domain entity с собственным DB connection.

## 6. Этапы после production launch

1. Повторить точный reader/writer/RLS census и отделить реальные `platform_users` contact refs от одноимённых
   полей других таблиц.
2. Сделать `UserIdentityPort` настоящим facade: один loader полного identity snapshot, узкие методы resolve/login/
   delivery/list/update; callers не знают таблицы.
3. Отделить `SessionPrincipal` от свежего `UserIdentitySnapshot`; cookie хранит principal, request context получает
   свежий snapshot и обязательный epoch check.
4. Перевести все phone/email writers на прямые операции `user_contacts`; прекратить delete/rebuild mirror.
5. Спроектировать organization-scoped supplementary contacts: либо расширить `user_contacts` scope/purpose, либо
   оставить отдельное хранилище за тем же facade. Не смешивать неподтверждённый clinic contact с login contact.
6. Перевести auth/session/delivery/merge readers на facade, доказать fault injection и live login по каждому
   подтверждённому контакту.
7. Fail-closed migration: parity proof, удалить `platform_users.phone/email*` и mirror writer; добавить точные
   primary/scope/confirmation constraints. Историю/provenance не использовать как обратный source of truth.
8. Отдельно завершить `user_identity` cutover. Pseudonymous medical subject mapping остаётся privacy workstream,
   не частью contact migration.

## 7. Критерий завершения

- Один production writer/read facade владеет contact storage semantics.
- Ни один application caller за пределами его infra adapter не знает `user_contacts`, legacy scalar columns или
  supplementary storage table.
- Любой подтверждённый phone/email входит в один аккаунт; conflict двух аккаунтов fail closed.
- Primary влияет только на default delivery; все подтверждённые контакты равноправны для login.
- Confirmation date/source и organization scope сохраняются и проверяются RLS.
- Session epoch проверяется при каждом DB-backed request во всех runtime modes.
- Старые scalar contacts и mirror rebuild удалены только после live DEV/TEST и migration parity proof.

## 8. Что разрешено до этого workstream

Текущий запуск ограничен выполненными bounded-fix: port-context DB detection, симметричный phone/email snapshot
в `SessionUser`, phone bind через exact roots без нового широкого grant, рабочий DEV, затем TEST. Эти правки не
закрывают настоящий workstream и не являются основанием снова поставить D15b/5 или D15b/6 `[x]`.
