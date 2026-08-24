# `TPB-09` — доказательство конфигурационного шва и владения настройками клиники

**Дата:** 24.08.2026. **Ветка:** `wt/therapysto-night-20260823`. **Исполнитель:** Claude Opus 5/high по брифу
`docs/_TODO/runs/briefs/TPB09_CONFIG_OWNERSHIP_BRIEF_2026-08-24.md`. **Вердикт: `PASS`.**
**Инъекций посажено 8 — убито 8 — не поймано 0.** Дерево после прогона чистое.

Оракул (дословно, план §2): «`TPB-09` Standard patient name/origin меняются deploy config без data migration;
clinic domain/integrations остаются org-scoped DB settings. Доказательство: config test и settings ownership tests».

## Классификация «тест или взгляд» (§24.4)

Обе половины требования — **поведение**, взгляда на файлы здесь нет.

- «имя/origin меняются деплой-конфигом без миграции данных» — поведение потребителей: подставить значение в
  окружение, пере-импортировать граф и спросить каждое место, где имя видит пациент. Место, взявшее литерал
  сборки, краснеет само.
- «домен и интеграции клиники остаются org-scoped настройками БД» — поведение владения: значение принадлежит
  организации, окружением не задаётся, соседняя организация его не видит.

## Что и где проверено

Проверки дописаны по одному разу в существующие соседние файлы, новых наборов не заведено:

- `apps/webapp/src/config/envDatabaseRuntime.unit.test.ts` — тот же файл, где уже жили два теста про
  `PATIENT_APP_ORIGIN`. Добавлен блок `TPB-09` из двух тестов (имя и origin).
- `apps/webapp/src/modules/system-settings/orgCustomDomainHostname.unit.test.ts` — файл самой настройки домена
  клиники. Добавлен блок `TPB-09` из двух тестов (владение и отсутствие дублирующей настройки).

Прогон: `pnpm --dir apps/webapp exec vitest run src/config/envDatabaseRuntime.unit.test.ts
src/modules/system-settings/orgCustomDomainHostname.unit.test.ts` → **12 passed**; `eslint` по обоим файлам
чисто; `tsc --noEmit -p apps/webapp/tsconfig.json` чисто. Full CI не гонялся (запрещён брифом).

### 1. Имя пациентского приложения — одно значение окружения

Потребители обойдены самостоятельно, а не по списку из плана: `grep` по `PATIENT_DEFAULT_SURFACE` /
`PATIENT_DEFAULT_SURFACE_NAME` / `PATIENT_APP_NAME` во всём `apps/webapp/src`, плюс отдельный обход литералов
`Therapygo`/`Therapysto` по `src` и `public`. Живые потребители пациентского имени:

| Что видит пациент | Файл | Источник имени |
| --- | --- | --- |
| Заголовок вкладки, описание, заголовок установленного приложения | `shared/lib/surface/surfaceLayoutMetadata.ts:21,23,34` | `PATIENT_DEFAULT_SURFACE.name` |
| Имя на домашнем экране (PWA-манифест) | `shared/lib/pwa/patientPwaManifest.ts` → `surfaceDisplayName` (`shared/lib/surface/requestSurface.ts:286`) | то же |
| Профиль отправителя письма (подпись) | `modules/auth/mailProfile.ts:18,49` | то же |
| Календарный файл записи (`PRODID`) | `modules/patient-booking/sendBookingConfirmationEmail.ts:83-96` → `shared/lib/buildCalendarLinks.ts:55` | имя из профиля отправителя (`b9ec6a87c`) |
| Календарный файл из кабинета | `app/app/patient/booking/done/BookingDoneClient.tsx:74` | `useSurfaceName()` из `ResolvedSurface`, разрешённый в `RootLayout` |
| Врез про абонементы | `app/app/patient/sections/PatientSectionSubscriptionCallout.tsx:19` | `PATIENT_DEFAULT_SURFACE.name` (серверный компонент, env применяется) |

`PATIENT_DEFAULT_SURFACE.name = env.PATIENT_APP_NAME` (`config/productSurfaces.ts:24`), дефолт —
`PATIENT_DEFAULT_SURFACE_NAME` (`config/env.ts:38`). Литералов имени в `apps/webapp/src` и `apps/webapp/public`
мимо `config/productSurfaceNames.ts` не осталось, кроме двух статических дубликатов ниже («Findings»).

Тест `одно значение PATIENT_APP_NAME доходит до каждого места, где имя видит пациент` подставляет в окружение
имя `Наименование-Из-Деплоя`, сбрасывает модульный граф и спрашивает первые четыре строки таблицы (метаданные,
манифест, профиль отправителя, реальный путь письма с `.ics` через фейковую очередь). Заключительная
проверка требует, чтобы дефолтного `Therapygo` не осталось ни в одном из четырёх ответов.

### 2. Origin — только `APP_BASE_URL`

Тест `origin пациентской поверхности берётся только из APP_BASE_URL, без второй константы`: при заданном одном
`APP_BASE_URL` и `staff`, и пациентская поверхность отдают его; отдельный пациентский host задаётся тем же
механизмом (`PATIENT_APP_ORIGIN`, свод в `config/env.ts:222`), а не второй константой. Origin доезжает и до
календарного файла — домен в `UID` события в первом тесте равен инъектированному.

### 3. Без миграции данных

Оба теста первого блока прогоняются с **удалёнными** из окружения `DATABASE_URL*` и `DB_PRINCIPAL*`: имя и
origin разрешаются полностью, ни одного порта БД в тест не внедрено (в письме внедрена только очередь
исходящих). Плюс `ни одна настройка не дублирует имя пациентской поверхности` — в `ALLOWED_KEYS` реестра
`system_settings` нет ключа вида `patient_app_name` / `patient_surface_name` / `platform_name` / `*_app_origin`
ни в одном scope. То есть строки в БД для смены имени/origin не существует по построению.

### 4. Домен и интеграции клиники — наоборот, org-scoped

Тест `домен клиники принадлежит организации, а не деплою, и не течёт между организациями`: на in-memory порту
настроек организация `A` записывает `clinic-a.example.test`; чтение за организацию `A` отдаёт её значение,
чтение за организацию `B` не содержит ни домена `A`, ни значения, выставленного в `process.env`
(`ORG_CUSTOM_DOMAIN_HOSTNAME=domain-from-deploy.example.test` игнорируется — окружение не является входом
этого чтения). Тест `интеграции клиники тоже per-org` фиксирует `per_org` у `clinic_smtp_outbound`,
`clinic_smsc_api_key`, `clinic_max_bot_api_key`, `patient_booking_url`.

Границы соблюдены: `app.read_integrator_clinic_delivery_credential` и миграции `20260823T030000…`,
`20260823T043206…` не тронуты, обе роли в одном списке не появлялись; `--execute`, деплой, PROD/TEST,
`telegram_mode`, push/слияния в `feat` — ничего из этого не делалось.

## Инъекции неисправности (8/8 убито)

| № | Инъекция | Файл | Красный тест |
| --- | --- | --- | --- |
| I1 | имя поверхности берётся литералом сборки вместо `env.PATIENT_APP_NAME` | `config/productSurfaces.ts` | имя доходит до каждого места |
| I2 | origin пациентской поверхности — вторая константа | `config/productSurfaces.ts` | origin только из `APP_BASE_URL` |
| I3 | PWA-манифест подставляет `'Therapygo'` мимо резолвера | `shared/lib/pwa/patientPwaManifest.ts` | имя доходит до каждого места |
| I4 | метаданные документа подставляют `'Therapygo'` | `shared/lib/surface/surfaceLayoutMetadata.ts` | то же |
| I5 | `.ics` возвращается к литералу по умолчанию (аргумент имени снят) | `modules/patient-booking/sendBookingConfirmationEmail.ts` | то же |
| I6 | профиль отправителя письма подставляет `'Therapygo'` | `modules/auth/mailProfile.ts` | то же |
| I7 | домен клиники объявлен `global` — арендаторы делят одну настройку | `modules/system-settings/registry.ts` | домен принадлежит организации |
| I8 | появилась DB-настройка `patient_app_name` | `modules/system-settings/registry.ts` | ни одна настройка не дублирует имя |

Все восемь откачены `git checkout --`, `git status --porcelain` после прогона пуст.

## Findings — вопросы владельцу, работой не становятся (§24.6)

1. **Статический дубликат имени в `apps/webapp/public/sw.js:64`** — `showNotification(title || 'Therapygo')`.
   Файл сырой браузерный, импортировать конфиг не может, и это уже описано комментарием круга `TPB-15`.
   Сегодня литерал **недостижим**: интегратор отбивает пустой заголовок push как
   `WEB_PUSH_PAYLOAD_INVALID: title is required` (`apps/integrator/src/integrations/web-push/deliveryAdapter.ts:77-79`),
   то есть до `sw.js` пустой заголовок не доходит. Строки плана про этот дубликат нет; поведением он
   `TPB-09` не нарушает. Вопрос владельцу: оставить как мёртвый литерал с комментарием или отдать `sw.js`
   значение шаблоном при сборке.
2. **`apps/webapp/public/maintenance.html`** держит `Therapysto` литералом (строки 12/15/82). Это имя
   **staff**-поверхности, у которого env-переключателя нет по решению владельца (`TPB-01`), поэтому шва
   `TPB-09` здесь нет. Отмечаю только потому, что страница обслуживания показывается и пациенту.
3. **Дефолт контекста `SurfaceNameContext`** (`shared/ui/PlatformProvider.tsx:25`) — литерал
   `PATIENT_DEFAULT_SURFACE_NAME` как fallback без провайдера. В живом дереве провайдер ставит `RootLayout`
   из `ResolvedSurface`, то есть env-разрешённое имя; fallback виден только при рендере компонента вне
   layout. Это конструкция, а не находка.

## НЕ СДЕЛАНО

- Реальные домены (`therapygo.ru`, поддомены клиник) не проверялись — регистрация не сделана, брифом
  запрещено; проверен только конфигурационный шов.
- Живого прогона приложения и снимков экрана нет: требование `TPB-09` конфигурационное, а деплой/TEST брифом
  запрещены. «Готово» по этому пункту = галочка плана + эти тесты; живая проверка имени на TEST — гейт `D`.
- Full CI не гонялся (запрещён брифом); прогнаны затронутые тесты, `eslint` по двум файлам и `tsc` вебаппа.
