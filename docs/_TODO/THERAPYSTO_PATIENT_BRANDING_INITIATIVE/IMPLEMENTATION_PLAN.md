# Therapysto + универсальное patient-branding — implementation plan

**Дата:** 2026-08-21. **Ветка:** `wt/therapysto-patient-branding-plan`. **Статус:** план после авторского
исследования и независимого аудита; product code не менялся. Фактическая база —
`CURRENT_STATE_AND_GAP_REPORT.md`, мировые аналоги и ограничения Yandex OAuth —
`EXTERNAL_PRODUCT_RESEARCH.md`, замечания к первой редакции — `INDEPENDENT_PLAN_AUDIT.md`.

## 1. Итоговое решение

Делаем **не два webapp и не форк**, а один webapp с тремя request-surface:

1. `staff` — Therapysto для специалистов и администраторов;
2. `patient_default` — стандартное patient-приложение на отдельном полном домене и под отдельным именем;
3. `patient_branded` — то же patient-приложение на домене клиники с effective brand этой клиники.

Один запрос проходит через один `RequestSurfaceResolver`. Его результат содержит `surface`, `publicOrigin`,
`organizationId` (только для branded surface) и `EffectivePatientBrand`. Этот результат переиспользуют routing,
metadata/manifest, auth/OAuth, абсолютные ссылки и transactional delivery. Отдельные функции «получить имя для
header», «получить имя для письма», «получить домен для OAuth» не создаются.

### 1.1 Единственные источники данных

| Смысл | Единственный источник | Что не создаём |
| --- | --- | --- |
| Therapysto staff identity/origin | точное имя `Therapysto` + существующий typed deploy config (`APP_BASE_URL`) | DB-настройку названия платформы |
| Стандартное patient-приложение | один typed deploy config: обязательные `name` и `origin` | tenant-строку в БД, hardcoded placeholder |
| Домен клиники | существующий per-org `system_settings.org_custom_domain_hostname` | `hostname_binding`/`custom_domains` table |
| Опубликованный бренд | существующий `org_brand_revisions` и его service/port | второй branding module/store |
| Карточка, запись, контакты | существующая `clinic_public_directory_entries` и clinic-public-card port | копию публичного профиля внутри brand |
| SMTP/боты | существующие per-org settings и `dispatchPort`/`clinicDeliveryCredentials` | второй delivery dispatcher |
| OAuth credentials | DB-backed `system_settings`; один OAuth-config resolver выбирает запись по surface | env-секреты и отдельные OAuth flow |

`EffectivePatientBrand` — один composed read model. Для `patient_default` он строится из deploy identity. Для
`patient_branded` он берёт published org brand, а данные карточки/записи/контактов — из существующей public-card
проекции. Дублировать имя/контакты между этими хранилищами нельзя. Если patient app name должен отличаться от
названия клиники, в **существующую** brand revision добавляется одно optional поле `patientAppName` с fallback на
`displayName`; для цвета — один optional accent token с безопасным default. Полноценный theme/CMS не строится.

### 1.2 Домен без новой domain-state машины

- `org_custom_domain_hostname` остаётся каноническим нормализованным hostname.
- В существующий write path добавляется защита от дубля hostname. На актуальной DEV schema создаётся узкий
  partial unique expression index для непустого `value_json->>'value'` только у этого key; новой таблицы нет.
- Настройку домена оставляем `owner`-only, как сегодня. Расширение прав не нужно для результата и не является
  owner-вопросом этого плана.
- DNS, TLS и proxy binding выполняет оператор. Домен начинает принимать трафик только после этой ручной
  операции; отдельный lifecycle/marketplace/self-service не строится.
- Resolver признаёт branded surface только при точном совпадении нормализованного Host, действующей
  `custom_domain` capability и published brand. Неизвестный/дублирующийся Host — hard 404, не platform fallback.
- Host выбирает surface, но никогда не выдаёт доступ к tenant data. Авторизация остаётся по session/membership/
  enrollment через существующие guards.

### 1.3 Поверхности и маршруты

- Therapysto origin обслуживает staff/admin и свою marketing/login поверхность. Patient-only путь на нём
  переводится на канонический путь стандартного patient origin без переноса cookie.
- Стандартный patient origin обслуживает общий patient login/recovery/cabinet и существующие clinic card/booking
  по slug. Therapysto marketing home там не рендерится.
- Branded origin обслуживает то же patient tree. Корень показывает effective clinic/app brand, login/recovery,
  clinic card и ссылку/форму booking; slug клиники в URL не обязателен, потому что организация уже определена Host.
- Существующие clinic card/booking services переиспользуются; второго route tree с копиями UI и логики нет.
- Session cookie остаётся host-only. Cross-domain SSO не вводится. CSRF продолжает использовать request origin.
- Passkey/TOTP остаются staff-механикой Therapysto; на patient origins passkey не расширяется и не предлагается.
  Yandex OAuth на patient surfaces при этом обязателен и не отключается.
- Metadata, OpenGraph и manifest вычисляются через тот же resolved surface; отдельные manifest-файлы под бренды
  не создаются.

### 1.4 OAuth без потери Yandex-входа

Несколько redirect URI у одного Yandex-приложения решают callback, но **не меняют имя/иконку consent**. Поэтому
один global OAuth client не удовлетворяет white-label.

- Therapysto использует существующую global Yandex app identity.
- Стандартное patient-приложение получает отдельную global DB-backed Yandex app config с собственными
  client id/secret/exact redirect URI и именем/иконкой, зарегистрированными в Yandex.
- Каждая активируемая branded clinic получает per-org DB-backed Yandex app config с consent identity этой клиники.
- Один OAuth-config resolver выбирает config по `ResolvedSurface`; start и callback не имеют параллельных
  реализаций. Signed state связывает surface, normalized origin и organization id, а callback сверяет exact
  allowlist и снова резолвит surface.
- Между provider configs нет fallback. Branded domain нельзя активировать, пока его Yandex app не готова: OAuth
  остаётся видимым и рабочим, а не отключается.

### 1.5 Боты и transactional mail

- Все patient-facing intents, начатые на branded surface — login/contact confirmation, recovery/security codes и
  notifications — несут `organizationId` и `senderScope='clinic_required'` для Telegram/MAX. Platform bot fallback
  запрещён и уже обеспечивается существующим `dispatchPort`; задача — провести через него все эти intents.
- Branded activation требует настроенные Telegram/MAX credentials для каналов, которые UI предлагает пациенту.
  Неготовый канал не показывается; готовый не откатывается на platform sender.
- SMS остаётся отдельной tariff capability и в branding не включается.
- Existing `clinic_smtp_outbound` остаётся transport source. Один transactional-mail profile resolver соединяет
  его с `EffectivePatientBrand` и per-org template overrides.
- Template overrides хранятся в одном новом per-org `system_settings` key и допускаются только для реально
  существующих patient transactional template IDs и allowlisted variables. Используется один renderer;
  произвольный mass-mail editor/рассылки не строятся.
- На branded surface email либо отправляется собственным SMTP/sender/template, либо недоступен/fail-closed. Письмо
  с Therapysto/другим брендом через platform fallback не отправляется.

## 2. Атомарные owner requirements

Checkbox закрывается только доказательством, указанным в той же строке. ID не переименовываются.

- [ ] `TPB-01` User-visible имя staff/platform surface — **Therapysto**. Доказательство: inventory diff + UI/
  metadata/auth issuer assertions без старого platform name.
- [ ] `TPB-02` Specialists, clinic admins и platform admins работают на Therapysto surface. Доказательство:
  host/role route tests для staff/admin paths.
- [ ] `TPB-03` Пациенты работают в отдельно названном standard patient app на отдельном полном owner-selected
  domain. Доказательство: typed config validation и runtime smoke обоих origins.
- [ ] `TPB-04` Не созданы `staff.therapysto.ru` и `patient.therapysto.ru`. Доказательство: deploy config и active
  docs содержат только два выбранных полных домена.
- [ ] `TPB-05` Пациент клиники входит через standard patient domain или активный branded clinic domain.
  Доказательство: одинаковые login/booking/cabinet behavior tests на обоих surface.
- [ ] `TPB-06` PersonCare активирован первой конфигурацией универсального механизма, без PersonCare-specific code.
  Доказательство: runtime settings/brand data + отсутствие PersonCare branching в product code.
- [ ] `TPB-07` Остаются один repo, один webapp, одна DB и общие mechanics. Доказательство: architecture diff не
  создаёт второго app/tree/store/dispatcher.
- [ ] `TPB-08` Branding влияет только на patient-facing surface; staff/admin видят Therapysto. Доказательство:
  cross-surface metadata/UI tests.
- [ ] `TPB-09` Standard patient name/origin меняются deploy config без data migration; clinic domain/integrations
  остаются org-scoped DB settings. Доказательство: config test и settings ownership tests.
- [ ] `TPB-10` Yandex OAuth работает на Therapysto, standard patient и branded domains с правильной consent
  identity, без cross-brand fallback. Доказательство: config-selection/state/callback tests и operator smoke каждой
  зарегистрированной app identity.
- [ ] `TPB-11` Branded root не показывает Therapysto home/directory и ведёт к brand login/recovery, clinic card,
  booking и patient cabinet. Доказательство: branded-host page/navigation tests.
- [ ] `TPB-12` Branded Telegram/MAX confirmations, codes и notifications идут только через clinic bot; SMS не
  считается branding. Доказательство: dispatch fault injection подтверждает `clinic_required` и отсутствие fallback.
- [ ] `TPB-13` Branded transactional patient mail использует clinic SMTP/sender/template; mass mailing не изменён.
  Доказательство: template/profile selection tests и delivery fault injection.
- [ ] `TPB-14` Первичная domain activation остаётся ручной; self-service DNS/TLS, SEO automation и marketplace не
  построены. Доказательство: operator runbook и отсутствие таких product flows в diff.
- [ ] `TPB-15` User-visible BersonCareBot/platform PersonCare и понятие PersonCare Bot заменены; technical IDs и
  history не переименованы. Доказательство: scoped exact inventory before/after с явным allowlist technical/history.
- [ ] `TPB-16` Реализация расширяет перечисленные choke points и не создаёт параллельных getters/resolvers/stores.
  Доказательство: dependency/architecture audit по diff.

## 3. Этапы реализации

Этапы выполняются последовательно. Перед каждым — перечитать позднейшие owner-регистры, актуальный `AGENTS.md` и
перемерить соответствующий путь на текущем `feat`.

### A — Identity и active docs (`TPB-01`, `02`, `03`, `04`, `09`, `15`)

- [ ] `A1` Ввести один typed product-surface config. Therapysto name фиксирован; staff origin использует текущий
  deploy seam; standard patient `name` и `origin` — обязательные deploy inputs без placeholder/default бренда.
- [ ] `A2` Перевести root/staff metadata, manifest, landing/legal, navigation, passkey/TOTP issuer и staff-facing
  copy на Therapysto через единый identity value. Patient metadata берёт standard patient config, а patient mail
  становится brand-aware только в C.
- [ ] `A3` Повторить user-visible inventory точной командой на implementation SHA; заменить только runtime/product
  occurrences. npm/package/table/module/route identifiers и archive/audit history не трогать.
- [ ] `A4` В активных owner/contract/runbook docs заменить несовместимое platform-name/subdomain описание на
  `TPB-01…16`. Не добавлять параллельную сноску рядом со старым активным вариантом и не редактировать archive.

**Gate A:** targeted config/metadata/auth tests, webapp lint+typecheck для изменённой ветки; review показывает один
identity seam, а не набор getters.

### B — Единый surface/brand path (`TPB-05`, `07`, `08`, `09`, `11`, `14`, `16`)

- [ ] `B1` Добавить domain port с inverse lookup существующего `org_custom_domain_hostname`; запрос реализовать
  через Drizzle repo/approved DB seam и инъекцию, не из route/proxy напрямую.
- [ ] `B2` Добавить narrow unique index на нормализованное непустое значение этого setting key. Миграцию создать
  штатным Drizzle flow; проверить на named DEV, затем sanctioned dry-run на TEST перед landing. Одноразовые БД и
  historical replay запрещены.
- [ ] `B3` Реализовать один `RequestSurfaceResolver` и подключить к существующему request choke point. Результат
  резолва переиспользуется routing, metadata/manifest и absolute links.
- [ ] `B4` Расширить существующий org branding service: optional patient app name и один accent token; anonymous
  branded projection отдаёт только published/entitled safe fields. Public card/contacts читаются через существующий
  clinic-public-card port.
- [ ] `B5` Переподключить root/login/recovery/clinic card/booking/patient cabinet к одному patient tree с разным
  resolved context. Therapysto home и therapist directory недостижимы на patient origins.
- [ ] `B6` Оставить cookies host-only и текущий CSRF request-origin seam; добавить только regression tests для
  нескольких Host. Unknown Host и cross-org попытки fail closed.
- [ ] `B7` Описать ручную DNS/TLS/proxy активацию и rollback; не строить UI/lifecycle automation.

**Gate B:** host matrix tests (`staff`, `patient_default`, `patient_branded`, unknown), tenant-isolation fault
injection, targeted route/UI tests, migration dry-run DEV→TEST, lint+typecheck.

### C — OAuth и branded delivery (`TPB-10`, `12`, `13`, `16`)

- [ ] `C1` Добавить global standard-patient и per-org clinic Yandex config в `system_settings` с secret envelope,
  existing settings write service, entitlement/organization context и admin UI в существующей integrations section.
- [ ] `C2` Параметризовать существующий Yandex start/callback одним OAuth-config resolver по `ResolvedSurface`;
  signed state и exact callback allowlist исключают подмену host/org/provider.
- [ ] `C3` Провести все branded patient Telegram/MAX confirmation/recovery/security/notification intents через
  существующий dispatch port как `clinic_required`; удалить любой достижимый platform fallback для них.
- [ ] `C4` Расширить existing SMTP config только sender display data, добавить один org-scoped transactional template
  setting и один mail-profile resolver/renderer. Не трогать doctor broadcasts/mass mailing кроме сохранения текущего
  поведения.
- [ ] `C5` Добавить readiness check: branded domain не активируется, пока OAuth и обязательные branded channels не
  сконфигурированы. Неактивный branded hostname не ухудшает standard patient path.

**Gate C:** OAuth state/provider-selection tests; clinic-required dispatch fault injection; SMTP/template selection
tests; проверка, что секреты не попадают в public runtime projection/logs; lint+typecheck.

### D — PersonCare как первая конфигурация (`TPB-05`, `06`, `10`, `11`, `12`, `13`)

- [ ] `D1` Через существующие settings/branding flows опубликовать PersonCare brand, custom hostname, Yandex app,
  Telegram/MAX bots, SMTP/sender/templates. Product code не получает `if PersonCare`.
- [ ] `D2` Выполнить operator DNS/TLS/proxy binding и smoke полного patient journey: branded root → OAuth/login →
  recovery → card/booking → cabinet → bot/email notification.
- [ ] `D3` Проверить standard patient domain тем же journey и Therapysto staff login отдельно; ни одна identity не
  протекает в другую.

**Gate D:** runtime evidence на TEST. PROD/deploy/push не входят в текущее поручение и требуют отдельной команды
владельца.

### E — Финальная приёмка (`TPB-01…16`)

- [ ] `E1` Закрыть каждый checkbox §2 только его бинарным evidence; синхронизировать активные docs и runbook.
- [ ] `E2` На implementation-ветке перед landing выполнить relevant tests, lint и typecheck. Full CI — только по
  действующему §9 `AGENTS.md`, не как автоматический ритуал этапа.
- [ ] `E3` Независимый аудитор проверяет owner checklist и достижимые regression/security сценарии. Finding вне
  `TPB-01…16` — owner question, а не самовольное расширение scope.
- [ ] `E4` После PASS приземлять только штатным orchestration flow. Миграционный dry-run должен быть уже зелёным;
  временные базы/fixtures не создаются.

## 4. Что сознательно не делаем

- второй `webapp`, отдельную PersonCare папку, product fork или копию route tree;
- `staff.therapysto.ru`/`patient.therapysto.ru`;
- generic hostname-binding/domain lifecycle table;
- self-service DNS/TLS, SEO automation, domain marketplace;
- cross-domain SSO, passkey expansion, native branded apps;
- новый dispatch engine, новый public clinic profile, второй brand store;
- arbitrary theme builder или общий CMS шаблонов;
- mass mailing и SMS-provider work;
- технический mass rename и переписывание истории.

## 5. Единственные owner inputs

Они не блокируют A–C, но обязательны до D/runtime activation:

1. имя стандартного patient-приложения;
2. его полный основной домен;
3. полный домен PersonCare.

Остальные развилки первой редакции закрыты технически: domain edit остаётся owner-only; active docs исправляются
на месте; standard и branded identity получают отдельные Yandex app registrations; новая domain table не нужна.
