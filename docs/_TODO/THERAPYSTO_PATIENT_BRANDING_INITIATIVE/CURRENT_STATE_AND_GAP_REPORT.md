# Измеренное текущее состояние и разрывы — Therapysto / patient branding

**Дата:** 2026-08-21. **Тип:** discovery-отчёт, поддерживающий `IMPLEMENTATION_PLAN.md`. Кода не написано, миграций
нет, БД не менялась. Каждое утверждение — с командой или путём рядом, как того требует `AGENTS.md` («пустой поиск
доказывается перечнем запросов»).

Этот отчёт не переоткрывает `docs/_TODO/CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` и
`docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` — он их использует как измеренную базу (оба датированы
19.08, двумя днями раньше) и добавляет то, чего в них нет: инвентарь переименования и сверку с новыми owner-
решениями Therapysto/PersonCare/standard-patient-domain.

## 1. Инвентарь переименования — масштаб, не список файлов

| Что | Команда | Результат |
| --- | --- | --- |
| `BersonCare\|PersonCare` (tracked-файлов без учёта регистра), audit snapshot `43c59a522` | `git grep -Ili -E 'bersoncare\|personcare' 43c59a522 -- . \| wc -l` | 1214 файлов |
| — из них `apps/webapp/src` | `git grep -Ili -E 'bersoncare\|personcare' 43c59a522 -- apps/webapp/src \| wc -l` | 318 |
| — из них `apps/integrator/src` | `git grep -Ili -E 'bersoncare\|personcare' 43c59a522 -- apps/integrator/src \| wc -l` | 86 |
| — из них `docs/` | `git grep -Ili -E 'bersoncare\|personcare' 43c59a522 -- docs \| wc -l` | 623 |
| — из них `deploy/` | `git grep -Ili -E 'bersoncare\|personcare' 43c59a522 -- deploy \| wc -l` | 82 |
| Буквальная строка `PersonCare Bot` / `personcarebot` в product/deploy scope | `git grep -In -E 'PersonCare Bot\|personcarebot' 43c59a522 -- apps deploy README.md package.json \| wc -l` | 0 product-строк |
| Та же строка внутри документов этой инициативы | `git grep -In -E 'PersonCare Bot\|personcarebot' 43c59a522 -- docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE \| wc -l` | 3 self-reference строки, поэтому утверждать «во всём репозитории 0» нельзя |
| Пакетные имена | `grep -n '"name"' package.json apps/*/package.json` | `berson-care-bot` (корень), `@bersoncare/webapp`, `@bersoncare/integrator`, `@bersoncare/media-worker` — технические npm-имена, owner-требование №15 их не трогает |

**Вывод:** переименование — это не один mechanical replace. 623 совпадения в `docs/` включают исторические LOG/audit-записи,
которые owner-требование №15 явно запрещает трогать («не переписывать исторические audit evidence»). Реальный
user-facing rename-объём — подмножество из 318+86, и следующий пункт называет конкретные user-facing точки входа,
а не весь список файлов. Параллельный проход тем же вопросом (независимый research-агент, другая методология счёта)
получил близкие, но не идентичные числа по отдельным директориям — расхождение в пределах 1 файла на
`apps/webapp/src`/`apps/integrator/src`, нормально для двух разных grep-запусков в живом дереве; обе методологии
сведены здесь к одной команде, которую можно перевыполнить перед стартом rename-этапа.

### 1.1 Конкретные user-facing точки

| Файл | Строка | Текущее значение | Категория |
| --- | --- | --- | --- |
| `apps/webapp/src/app/manifest.ts` | 14-15 | `name: 'BersonCare — забота о твоём здоровье'`, `short_name: 'BersonCare'` | **PWA patient manifest** — единственная установленная пациентская identity сегодня (`id: '/app'`, `start_url: '/app/patient'`, `scope: '/app'`) |
| `apps/webapp/src/app/layout.tsx` | 21-22, 33 | `title: 'BersonCare Webapp'`, `description: 'Patient and doctor web application for the BersonCare platform.'`, OG `title: 'BersonCare'` | Root `<head>` metadata, общий для всех зон |
| `apps/webapp/src/shared/lib/pwa/staffPwaLayoutMetadata.ts` | 14 | `appleWebApp.title: 'BersonAdmin'` (не «BersonCare» буквально — отдельная строка) | Staff/doctor PWA identity (`manifest-staff.webmanifest`, подключается к `doctor`/`settings`/`admin` layouts) |
| Транзакционные письма/SMS | `modules/patient-booking/sendBookingConfirmationEmail.ts:105,116`, `integrations/bersoncare/sendOtpRoute.ts:112`, `sendSmsRoute.ts`, `operatorAlertRelayRoute.ts:95-114` | Hardcoded «С уважением, BersonCare» и аналоги прямо в коде отправки, не в шаблоне | Owner-требование №13 (own SMTP/sender отдельно) начинается с того, что сегодня подпись платформы вшита в код, а не параметризована |
| Passkey/TOTP issuer | `modules/auth/passkeyAuth.ts:31`, `modules/staff-security/totp.ts:51` | Строка «BersonCare» как RP/issuer name | Меняется на Therapysto как часть rename-этапа, без функционального следствия |
| Landing/legal | `components/landing/{LandingHeader,LandingFooter,WhySection}.tsx`, `app/legal/{terms,privacy}/page.tsx`, `DoctorAdminSidebar.tsx:86`, `PatientTopNav.tsx:255` | Видимый UI-текст | Специалист-facing и часть patient-facing (см. §2 owner-требование о patient-facing branding) |

Полный список user-visible вхождений шире названных здесь — это ожидаемо для 318+86 файлов; исполнитель rename-этапа
обязан перевыполнить `grep`, а не полагаться на этот список как на исчерпывающий (правило AGENTS.md «померить, а не
вспомнить»). Технические идентификаторы, которые owner-требование №15 явно НЕ просит трогать: npm-имена (§1), git
worktree/branch-имена, директория `apps/integrator/src/integrations/bersoncare/` (контрактное имя модуля),
переменные окружения, имена таблиц/ролей БД (проверено: `grep` по SQL-миграциям строк «BersonCare» не находит).

## 2. Host/surface model — измеренное состояние

**Единственный входной middleware-чокпоинт — `apps/webapp/src/proxy.ts`** (`matcher: ['/app', '/app/:path*',
'/api/:path*']`). Он уже делает: CSRF origin decision (`decideCsrfOrigin`), doctor-route редиректы, platform-context
(Telegram/MAX mini-app entry), portal/role guard по **пути** (`portalForAppPath`), session renewal. Он **не читает
`Host`** ни для чего, кроме собственного `NextRequest.nextUrl` (относительные редиректы на себя же).

**Резолва `hostname → organization` в коде нет.** Проверено (свежая сверка 19.08, независимо подтверждено этим
проходом):

```
grep -rn "resolve organization by hostname\|host header custom domain" apps/webapp/src   # 0 попаданий
```

и чтением трёх мест, которые вообще читают `Host`: `proxy.ts` (сам себя, не арендатора),
`apps/webapp/src/middleware/platformContext.ts` (Telegram/MAX entry, не Host), `apps/webapp/src/shared/lib/http/
getRequestOrigin.ts` (self-redirect только).

**CSRF уже origin-agnostic и готов к нескольким доменам без правок:** `apps/webapp/src/middleware/csrfOrigin.ts`
строит ожидаемый origin из `Host` запроса + `X-Forwarded-Proto` (не из захардкоженного platform-домена) и сравнивает
с `Origin`/`Referer`. Это значит: пока edge/прокси не переписывает `Host`, второй легитимный домен (patient-app
domain) не ломает CSRF без единой строки правок — это именно тот choke point, который нельзя дублировать.

**Session cookie — host-only, без `domain`-атрибута:** `apps/webapp/src/modules/auth/sessionCookie.ts:188-194` (`buildSessionCookieOptions`) —
`httpOnly`, `sameSite: 'lax'`, `path: '/'`, `domain` не установлен. Это хорошо для разделения Therapysto/patient-app
доменов (сессия одного не «протекает» на другой автоматически), но означает: если patient-app и Therapysto будут
на **разных полных доменах** (что и требует owner-решение №3), между ними нет built-in SSO — переход специалист↔
пациент внутри одной сессии не предполагался этим кодом и не предполагается новыми owner-решениями (роли разведены).

## 3. Org branding (name/logo) — построено, БЕЗ анонимного публичного чтения, без domain/PWA

**Важная поправка к состоянию миграций.** Коммит `609a19f94` («salvage: establish B0-forward candidate without
replay», 2026-08-17) сбросил историю пронумерованных миграций; файла `0238_org_brand_publication.sql` в
`apps/webapp/db/drizzle-migrations/` сегодня **нет** (`grep -rl "org_brand_revisions" apps/webapp/db/drizzle-
migrations` → пусто). Сам объект `org_brand_revisions` при этом физически существует в развёрнутой схеме
(подтверждено `deploy/postgres/generated/prod-to-target/schema-post.sql`) — он был создан коммитом `361a1920c` до
сброса истории. **Следствие для плана:** любая будущая миграция, трогающая `org_brand_revisions` (например, для
custom-domain), обязана быть `ALTER` против уже существующего объекта, а не `CREATE` — writer этапа обязан сверить
это на актуальной DEV-БД, а не по номеру файла.

Схема (`apps/webapp/db/schema/orgBranding.ts:24-60`): `status` ∈ `draft|published|archived` **на самой revision**
(не отдельная pointer-таблица), partial-unique «максимум один published / один draft на организацию»,
`display_name` (nullable — иначе canonical org name), `logo_media_id` → `public.media_files`. **Цвета/темы нет** —
подтверждено самим кодом и `BRANDING_DOMAIN_CONTRACT.md:513` («Scope: name + logo only. No colour/theme»).

Единственный вход на запись — `apps/webapp/src/app-layer/guards/requireOrgBrandingManagementContext.ts`: организация
берётся из server-resolved membership (`requireOrganizationManagementContext`, capability
`organization.management`), никогда из body/query/slug/Host. Комментарий в файле называет себя «the ONLY way to
obtain a branding mutation context» — это уже единый проход в терминах §5 AGENTS.md, расширять, не дублировать.

**Публичного (анонимного) чтения `org_brand_revisions` сегодня НЕТ.** RLS на таблице — FORCE RLS, `SELECT`
выдан только `app_patient`/`app_staff` (никакого гранта `app_pre_session`/анонимной роли,
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:14966-15004`), пациент читает только **published**-ревизию
**своей** организации при активном enrollment. `app.read_org_brand_core_context()` возвращает только canonical
`display_name`/`is_active`, не платный override (не логотип, не переопределённое имя). Попытка добавить анонимный
`SECURITY DEFINER`-аксессор `app.read_public_org_brand_projection` (миграция `0243`, коммит `26e05aa90`,
2026-07-26 — то самое «branding is fully PUBLIC», см. цитату владельца от 26.07 в `BRANDING_DOMAIN_CONTRACT.md:671-673`)
**была сделана и в ту же ночь откачена** — сегодня в схеме её нет (`grep -rn "read_public_org_brand_projection"
schema-pre.sql schema-post.sql` → пусто). **Владельческое требование «брендирование полностью публично» от 26.07
остаётся нереализованным для `org_brand_revisions`** — это открытый разрыв, не просто gap для нового кода.

**Второй, независимый источник имени/лого уже есть и уже публичен.** Модуль `apps/webapp/src/modules/clinic-
public-card/*` + таблица `clinic_public_directory_entries` (Drizzle-схема `apps/webapp/db/schema/
clinicDirectory.ts:26-34`) несёт **свой собственный** `displayName`+медиа, читается анонимно через отдельный
`SECURITY DEFINER`-аксессор (см. §4) и рендерится на `/{clinicSlug}` (см. §4 ниже). **Между `org_brand_revisions`
(платный бренд) и `clinic_public_directory_entries` (бесплатная визитка) сегодня нет синхронизации** —
`grep -n "org_brand" apps/webapp/db/drizzle-migrations/20260819T*.sql` не находит связи. Это значит: на публичной
визитке клиники сегодня может показываться ДРУГОЕ имя/лого, чем то, что клиника опубликовала как платный бренд
через `OrgBrandingSection`. Это конкретный, измеренный разрыв, который owner-требование №11 («branded поверхность
показывает именно этот бренд») делает видимым и который плану нужно явно закрыть или явно отложить с названной
причиной — не оставить молча как два тихо разъезжающихся источника истины (см. AGENTS §4 «второе хранилище
настроек» — тот же класс проблемы, но для имени бренда, а не системной настройки).

UI: `apps/webapp/src/app/app/settings/OrgBrandingSection.tsx`, `OrgBrandLogoControl.tsx` (кнопки «Установить»/
«Очистить», не «Заменить»/«Убрать» — owner-решение 25.07). Доступ — `owner` **и** `admin` через capability
`organization.management`. Публикация — не отдельный REST-роут, а server action `apps/webapp/src/app/app/settings/
brandingActions.ts:29-53` (`saveOrgBranding`, save+publish одним кликом, owner-решение 25.07).

## 4. Публичная страница клиники `/{clinicSlug}` — построена

`apps/webapp/src/app/[clinicSlug]/**` отдаёт визитку (проекция `public.clinic_public_directory_entries`, не прямое
чтение арендаторских таблиц) и `/{clinicSlug}/booking` — запись. `/book/{slug}` жив как `308`-редирект на новый
адрес (не удалён). Порядок адреса `{домен}/{slug}/{путь}` уже реализован — совпадает с owner-правилом §16 канона
(`CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md`, разделы 1-2). Неизвестный `Host`/slug — платформенный 404, не
догадка (тот же файл, §12.1).

**Значение для этого плана:** patient-facing публичные поверхности (визитка + запись) уже единообразно резолвятся
через slug-чокпоинт (`resolvePublicOrganizationBySlugRsc` → `pgClinicDirectory.ts`) — это готовый образец для
будущего Host-based резолвера кастомного домена клиники (тонкая перезапись `Host → slug → то же дерево`, не второе
дерево маршрутов).

## 5. `org_custom_domain_hostname` — поле есть, эффекта нет

`apps/webapp/src/modules/system-settings/registry.ts:543` — `org_custom_domain_hostname: runtime('admin',
'per_org', 'authenticated_client', 'string', '')`, комментарий над строкой: «Clinic personal domain hostname
intent; part of branding/custom_domain capability (owner 05.08)». UI — `OrgCustomDomainSection.tsx` на вкладке
«Клиника», валидация формы (без протокола/пути, ≤253 симв.) есть, гейт по механике `custom_domain` есть
(`mechanicSettingsWriteClearance.ts:48`), доступ — **только `owner`** (расхождение с брендом, который даёт и
`admin` — см. `CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` K4/O3, не решено владельцем).

**Поле нигде не читается на живом пути запроса.** Ни один резолвер, middleware или роут не берёт эту настройку и не
сопоставляет её с `Host` входящего запроса — строка лежит в БД и ни на что не влияет. Точный поиск
`git grep -n -E 'custom_hostnames|domain_bindings|custom_domain_requests' 43c59a522 -- apps/webapp/db deploy`
не находит таблиц с этими буквальными именами; это **не** доказательство отсутствия hostname-механики вообще,
потому что `org_custom_domain_hostname` уже существует. TLS/edge для произвольных хостов не поднят —
исследование `CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md` рекомендует Caddy `on_demand_tls`, ничего из
инфраструктуры не развёрнуто.

## 6. Sender-чокпоинт для bots/SMS/email — уже единый и уже per-org

`apps/integrator/src/infra/db/clinicDeliveryCredentials.ts` — единый резолвер per-org credential для
`email|smsc|telegram|max|vk`, каждый канал привязан к своей tariff-механике (`clinic_smtp`, `clinic_sms`,
`clinic_telegram_bot`, `clinic_max_bot`, `clinic_vk_community` — те же ключи, что в `registry.ts:350-362`).
Единственный писатель настроек — тот же `mechanicSettingsWriteClearance.ts`, что и у `custom_domain`.

Единственная точка отправки — `apps/integrator/src/infra/adapters/dispatchPort.ts`, функция
`createDefaultDispatchPort` (строки ~322-400): для каждого исходящего intent вычисляется `senderScope`
(`clinic_required` / `platform_required` / иначе), при `clinic_required` без сконфигурированного clinic-credential
бросается `CLINIC_CHANNEL_NOT_CONFIGURED` — **платформенного fallback для такого intent не происходит**; при
ошибке отправки через clinic-credential для `clinic_required`-intent ошибка **не** поглощается откатом на
платформенный sender (комментарий в коде: «Clinic-required flows … must never silently assume the platform
sender»).

**Значение для этого плана:** no-fallback уже реализован как общий механизм на уровне integrator dispatch; новый
dispatcher не нужен. По последнему owner-решению все patient intents, начатые на branded surface, включая contact
confirmation, login/recovery/security codes и notifications, обязаны доходить до этого choke point с
`senderScope='clinic_required'` для Telegram/MAX. Старое допущение о platform recovery bot несовместимо с
`TPB-12` и не является открытым вопросом.

## 7. `APP_BASE_URL` — deployment identity в env, не в БД

`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md:34`: `APP_BASE_URL` — validated env у **обоих** сервисов
(webapp и integrator), «это идентичность конкретного развёртывания, поэтому она не редактируется через admin
Settings и не читается из `system_settings`»; миграция `0273_remove_app_base_url_setting` явно **убрала** старый
DB-backed вариант этого значения. Использований в audit snapshot:
`git grep -n 'env.APP_BASE_URL' 43c59a522 -- apps/webapp/src | rg -v '\.test\.' | wc -l` → **41** (не считая
интегратора отдельно) — письма, напоминания, ICS, страницы оплаты, canonical-
создание визита.

**Это готовый прецедент для owner-требования №9** («стандартный patient-домен — deploy-конфигурация, не тенантные
данные»): по построению репозитория ровно такие значения уже живут в env, а не в БД, и миграция `0273` — прямое
доказательство, что команда уже проводила именно этот тип решения (перенос deployment-identity значения ИЗ БД
в env) один раз. Новый `PATIENT_APP_BASE_URL`-класс переменной — не новый паттерн, а второй экземпляр уже
существующего.

Один `APP_BASE_URL` сегодня используется для абсолютных ссылок ВСЕХ клиник одинаково — сам факт подключения
`org_custom_domain_hostname` (если бы он уже работал) не поменял бы ни одной ссылки в письмах/напоминаниях; чтобы
письма клиники несли её домен, нужен per-org base URL поверх текущего единственного глобального — это то, что
`CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` называет развилкой **O5** и явно не строит.

## 8. `system_settings` — релевантные ключи (`registry.ts`)

| Ключ | Scope | Секрет | Комментарий |
| --- | --- | --- | --- |
| `yandex_oauth_redirect_uri` | `admin` / `global` | нет — `restricted(..., 'url', 'absent', 'derived', 'oauth_yandex_enabled')`, не `secret_envelope` (`registry.ts:440-446`) | Один глобальный redirect URI, не per-org |
| `max_bot_api_key`, `telegram_bot_token` | `admin` / `global` | `secret_envelope` | Платформенные боты (fallback уровня P) |
| `smtp_outbound` | `admin` / `global` | `secret_envelope` | Платформенный SMTP |
| `clinic_smtp_outbound`, `clinic_smsc_api_key`, `clinic_telegram_bot_token`, `clinic_max_bot_api_key`, `clinic_vk_community_access_token` | `admin` / `per_org` | `secret_envelope` | Уже per-org, уже gated через `mechanicSettingsWriteClearance.ts` |
| `org_custom_domain_hostname` | `admin` / `per_org` | нет (`authenticated_client`) | См. §5 — интент без эффекта |

Yandex OAuth redirect URI — **один глобальный**, не org-aware. Несколько redirect URI в одном Yandex application
решают callback topology, но consent всё равно показывает фиксированные name/icon этой application. Поэтому для
правильной identity нужны отдельные Yandex registrations: global для standard patient app и per-org для каждого
активного true-white-label brand. Start/callback при этом остаются одной реализацией и выбирают config через один
surface-aware resolver; это техническое следствие `TPB-10`, не owner-вопрос.

## 9. Reserved-slug / platform-hold механизм — готовый прецедент для будущих технических имён

`RESERVED_ORGANIZATION_SLUGS` (`apps/webapp/src/modules/clinic-directory/organizationSlug.ts`) + CHECK-ограничение
в БД + поведенческий тест, читающий фактические корневые сегменты `apps/webapp/src/app/**` и `apps/webapp/public/**`
(`CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §1.3) — уже используемый паттерн «список ловит настоящее, тест
ловит будущее». Тот же паттерн стоит переиспользовать для reserved-hostname списка на будущем hostname-резолвере
(не изобретать новый механизм резервирования).

## 10. Тесты/гейты, относящиеся к области

- `apps/webapp/src/app/app/settings/OrgBrandingSection.ui.test.tsx` — UI бренда.
- `apps/webapp/src/app/[clinicSlug]/**` — поведенческие тесты визитки/записи, см. таблицу «что краснеет» в
  `CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §16.1 (не переоткрывать, там уже задокументирован fault-injection
  для каждого теста).
- `apps/webapp/src/modules/clinic-directory/reservedNamespace.test.ts` — резерв корневых имён читает файловую
  систему, не список (см. §9 выше).
- **Поправка:** `AGENTS.md` §2 называет `apps/webapp/scripts/check-system-settings-accessors.mjs` как CI-проверку
  доступа к `system_settings` в обход accessor'а. Файл под этим именем сегодня **не найден**
  (`find apps/webapp/scripts -iname "*system-setting*"` → пусто; `grep -l "ALLOWED_KEYS" apps/webapp/scripts/*.mjs`
  → пусто). В `apps/webapp/scripts/` есть соседние проверки того же типа (`check-drizzle-migration-order.sh`,
  `check-s4-entitlement-coverage.ts`, `check-media-upload-door.mjs`), но не именно эта. Это расхождение между
  описанием правила и текущим деревом — не работа этого плана чинить (§0 AGENTS.md — правки самого AGENTS.md вне
  scope), но исполнитель любого этапа, трогающего `system_settings`, обязан перепроверить актуальное имя/наличие
  гейта перед стартом, а не полагаться на имя из этого отчёта.
- Отдельного теста на hostname-резолвер, custom-domain edge или host→org маппинг **нет** — потому что самого кода
  нет (см. §2, §5).

## 11. Сверка с owner-требованиями брифа — что уже есть, чего нет

| Owner-требование брифа | Состояние |
| --- | --- |
| №1 Точное имя Therapysto | Не применено нигде в коде; везде `BersonCare` (§1) |
| №2-3 Therapysto = специалисты; отдельный patient-app на отдельном домене | Архитектурно возможно (host-agnostic CSRF, host-only cookie, §2), но host-based routing не построен |
| №4 Не вводить `staff.therapysto.ru`/`patient.therapysto.ru` | В коде такого нет; в документах есть отменённая фраза-допущение агента про «поддомены платформы» (`CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md:453-454`, `CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` §1.4) — сама фраза подлежит явной documentation-коррекции этим планом (owner попросил атомарный пункт, не молчаливую правку) |
| №5 Клиника: стандартный домен ИЛИ свой бренд-домен | Оба маршрута для визитки/записи разведены на уровне slug (§4); custom-domain резолвер не построен (§5) |
| №6 PersonCare — первая активация универсального механизма | Универсальный org brand уже не клиникоспецифичен; PersonCare должен стать первой published revision + первым реально маршрутизируемым `org_custom_domain_hostname`, без PersonCare-specific code и без новой hostname table |
| №7 Один репозиторий/webapp/БД | Уже так; ничего в этом отчёте не предполагает второй webapp |
| №9 Стандартный домен = deploy-конфиг, не тенантные данные | Прямой прецедент — `APP_BASE_URL` в env, миграция 0273 (§7) |
| №10 OAuth доступен, без утечки чужой identity в consent | Global-only config сегодня недостаточен (§8): redirect URI можно добавить, но отдельная consent identity требует отдельной Yandex registration для standard patient app и каждой branded clinic |
| №12 Branded bot/SMS/email, без молчаливого platform fallback | `clinicDeliveryCredentials.ts` + `dispatchPort.ts` уже умеют `clinic_required`; разрыв — провести через этот scope все branded patient intents, включая recovery/security (§6) |
| №13 Own SMTP отдельно от mass-mailing | `clinic_smtp_outbound` уже per-org; brand-aware sender/template resolver и per-org transactional template overrides ещё отсутствуют; mass-mailing остаётся вне плана |
| №15 Rename user-visible identity, не трогать техническое | Инвентарь — §1; список того, что НЕ трогается (npm-имена, БД/таблицы, git-ветки) — тот же §1 |
| №16 Расширять choke points, не дублировать | Выявленные choke points для расширения: `proxy.ts` (§2), `requireOrgBrandingManagementContext` (§3), slug-резолвер (§4), `mechanicSettingsWriteClearance.ts` (§5, §6), `dispatchPort.ts` (§6), `APP_BASE_URL`-паттерн (§7) |

## 12. Активные соседние ветки на момент этого прохода — не дублировать

Согласно прочитанным 08-19-документам, на момент их авторства существовали параллельные worktree
`wt/branding-domain-20260819`, `wt/clinic-public-page-20260819`, `wt/clinic-card-page-20260819`,
`wt/public-catalog-silent-20260819`. Этот план не открывает работу в этих ветках и не переоткрывает их находки;
`IMPLEMENTATION_PLAN.md` обязан быть проверен исполнителем на актуальное состояние `feat/doctor-ui-rebuild` перед
стартом каждого этапа (см. AGENTS.md «Как решать, что делать», п.5) — часть описанного здесь «gap» может уже быть
закрыта к моменту исполнения.
