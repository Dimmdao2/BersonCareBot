# MWT-01–MWT-04 correction-pass — повторный независимый аудит

Роль: независимый docs/research auditor; разовая inspection актуального кода без тестов на текст исходников.

Target: `ebf06f1c42445e8d215a0da182f2bc240e90f7ad` (docs-only correction-pass) поверх первичного FAIL
`dc0491aec` ([`MEDICAL_WELLNESS_TERMINOLOGY_MWT01_04_INDEPENDENT_AUDIT_2026-09-02.md`](MEDICAL_WELLNESS_TERMINOLOGY_MWT01_04_INDEPENDENT_AUDIT_2026-09-02.md)).

Authority:

- [`../MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md`](../MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md);
- owner-решение 02.09.2026: один системный режим вместо независимых настроек слов; до реализации —
  **полный** инвентарь видимых терминов, включая уведомления и ботов, и пары для обоих режимов;
- [`../MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md`](../MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md)
  (исправленная редакция — предмет проверки);
- `AGENTS.md` §10a, §10b, §12, §24 и «Как решать, что делать».

## Вердикт

**FAIL, NOT FOR LAND.**

Прежний kill-set закрыт по F2, F3 и F4 — проверено построчно против кода, все фактические утверждения
correction-pass подтвердились (раздел «Что подтвердилось»). Но собственный смысловой + точный поиск нашёл
**два новых пропуска класса F1**, каждый из которых меняет будущую реализацию: медицинское понятие в
платформенной копии вебаппа, которого нет ни в §4.1, ни в D1-D25, ни в Q8 (значит владелец о нём не
спросят, а MWT-05 не имеет права его чинить), и целый второй **кодовый** источник baseline-справочника,
из-за которого «ключевая развилка» Q1 посчитана по одному файлу вместо четырёх и класс A/B в §3 назначен
неверно.

MWT-01–MWT-03 остаются `[ ]`. MWT-04–MWT-06 открыты корректно. Реализация не разрешена.

## Blind kill-set, составленный до чтения correction-pass

1. Видимое медицинское понятие есть в коде, но его нет ни в §4.1, ни в D1-D25, ни в §4.3 как явно
   исключённого — после MWT-05 оно остаётся hardcode-обходом режима.
2. Инвентарь приписывает строку одной поверхности (и одному вопросу владельца), а на деле она живёт ещё и
   в другом классе текста с другим владельцем решения.
3. Пункт §4.1 меняет, сужает или расширяет смысл, либо Q8 молча выбирает за владельца.
4. Слой не собирается для одного из процессов, не получает режим точной организации, либо оставляет
   `patient_label` вторым бессрочным путём.
5. Галочки плана и taskdb описывают состояние, которого evidence не доказывает.

## Новые findings

### N1 — понятие «лекарства» в напоминаниях вебаппа: нет ключа, нет вопроса, приписано чужой поверхности

Достижимый сценарий: оздоровительная клиника, у пациента активно напоминание категории
`supplements_medication`. Вебапп материализует доставку и подставляет **свой** дефолтный заголовок
`'Напоминание: бады и лекарства 💊'` — он уходит в TG/MAX/VK/email/web-push. Ни в `medical`, ни в
`wellness` этот текст не меняется, потому что ключа для понятия нет.

```bash
rg -n 'supplements_medication' apps/webapp/src apps/integrator/src --glob '!**/*.test.*'
sed -n '36,42p;120,126p' apps/webapp/src/modules/reminders/materializePatientReminderDeliveries.ts
```

- `apps/webapp/src/modules/reminders/materializePatientReminderDeliveries.ts:41` — строка в
  `DEFAULT_TITLES`; `:123` — `DEFAULT_TITLES[rule.category] || 'Напоминание'` подставляется в `title`
  и в `body` доставки. Это **платформенная копия (класс A)**, ровно тот текст, который слой обязан
  переключать.
- `apps/integrator/src/kernel/contracts/reminders.ts:1-7` — `supplements_medication` входит в живой
  контракт категорий; `apps/webapp/src/modules/web-push/pushNotificationCopy.ts:14` — та же категория
  в push-контуре. Это не мёртвая ветка.

Что не так в документе:

- инвентарь называет эту фразу **один раз** — §2.5-E, и приписывает её только файлам
  `apps/integrator/src/content/{telegram,max}/user/templates.json`, после чего маршрутизирует в **Q6**
  с рекомендацией «отметить и оставить, это разрыв мультиарендности, не режима». Копия вебаппа не
  названа нигде: `modules/reminders/**` отсутствует и в §2.2 (строка 9 «Уведомления / письма /
  web-push» перечисляет `pushNotificationCopy.ts`, `patientMessageText.ts`,
  `sendBookingConfirmationEmail.ts`, `notifTemplatesService.ts`), и в §6.2;
- в §4.1/§4.2 нет `TermKey` для медикаментов, в §4.3 это понятие не объявлено исключённым, Q8
  перечисляет только D1-D25 — владелец о нём не спросят.

Последствие для реализации: MWT-05 по §6.2 не тронет `modules/reminders/**`, а Q6 явно выводит фразу
из объёма MWT. Wellness-клиника продолжит слать «бады и лекарства» — прямое невыполнение owner-решения
для канала, который MWT-01 называет поимённо («письма, уведомления, ботов»).

### N2 — baseline справочников живёт ещё и в коде: Q1 посчитан по одному файлу, класс A/B назначен неверно

Достижимый сценарий: врач оздоровительной клиники открывает конструктор программы, в пикере
рекомендаций подпись строки — «Физиотерапия» / «Самостоятельная процедура» / «Внешняя терапия», взятая
**из кодовой константы платформы**, а не из справочника клиники. Переименование строк у себя в клинике
эту подпись не меняет, и переключение режима её не изменит тоже.

```bash
rg -n 'SEED_V1' apps/webapp/src/modules --glob '!**/*.test.*'
sed -n '4,15p;25,37p;68,80p;118,124p' apps/webapp/src/modules/recommendations/recommendationDomain.ts
rg -n 'recommendationDomainTitle' apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts
rg -n "title: '(Виды оценки|Диагноз|Физиотерапия|Манипуляции визита)" apps/webapp/src/infra/repos/inMemoryReferences.ts
```

- `modules/recommendations/recommendationDomain.ts:25-37` (`RECOMMENDATION_TYPE_SEED_V1`),
  `modules/tests/clinicalTestAssessmentKind.ts:22-31` (`CLINICAL_ASSESSMENT_KIND_SEED_V1`),
  `modules/lfk-exercises/exerciseLoadTypeReference.ts` (`EXERCISE_LOAD_TYPE_SEED_V1`),
  `infra/repos/inMemoryReferences.ts:11-341` (категории **и** позиции, включая
  `:25 'Диагноз'`, `:46 'Виды оценки (клинические тесты)'`, `:60 'Манипуляции визита'`,
  `:261 'Физиотерапия'`). Три из них несут в собственном JSDoc жёсткое требование: «синхронизация
  набора кодов v1 — **три точки в одном PR**: SQL + константа + `inMemoryReferences.ts`».
- `recommendationDomainTitle(code)` документирован как «без справочника: только сиды (редкие
  unit-тесты)», но реально вызывается в проде:
  `app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts:203`
  (`subtitle: recommendationDomainTitle(r.domain ?? null)`) — с **пустым** списком строк справочника,
  то есть всегда из сида. `buildRecommendationDomainSelectOptions` падает на сид при пустом
  справочнике клиники — тот же класс.

Что не так в документе:

- §2.3 и §2.2 (строка 12, «Seed / миграции») называют единственным источником baseline
  `db/drizzle-migrations/20260821T025935_restore_reference_catalog_baselines.sql`; §6.2 повторяет тот
  же единственный файл для Q1;
- §3 «Класс B» относит **все** позиции baseline к контенту клиники и утверждает, что переключение
  режима «**не может** переписать уже засеянные строки». Для кодового сида это неверно: он платформенный
  (класс A), рендерится поверх данных клиники и меняется правкой кода;
- §4.1 №13 объявляет однозначным переключение заголовка категории «Виды оценки (клинические тесты)» →
  «…(функциональные тесты)», но не называет ни одного места, где эта строка живёт в коде
  (`inMemoryReferences.ts:46`), — исполнителю MWT-05 менять нечего.

Последствие для реализации: любой ответ владельца по Q1 (в т.ч. рекомендованный «(в) и то, и другое»)
посчитан по объёму как одна миграция, а стоит минимум четырёх согласованных точек; реализация «только
SQL» оставит медицинские подписи в конструкторе программ и в fallback-путях, а расхождение с
трёхточечной синхронизацией сломает согласованность кодов.

## Что подтвердилось (прежний kill-set закрыт по F2, F3, F4)

**F2 — закрыт.** §4.1 = ровно 9 строк, все либо прямая цитата владельца («клинические тесты →
функциональные тесты»), либо грамматическая/составная форма живой сегодня настройки `patient_label`
(`person.singular/plural/genPlural/dative/card/backToList`). Все четыре названные аудитом пары
(`record.card`, `contraindication`, `history.*`/`complaint`, `note.clinical`/`status.clinical`/
`comorbidity`) переехали в §4.2 как D12-D21. §4.2 = 25 строк, таблица Q8 = 25 строк, D-пункты
совпадают поимённо, молчаливого выбора не осталось.

```bash
sed -n '/### 4.1./,/### 4.2./p' docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md | grep -c '^| [0-9]'   # 9
sed -n '/### 4.2./,/### 4.3./p' docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md | grep -c '^| D[0-9]'  # 25
sed -n '/\*\*Q8\./,/\*\*Q9\./p'  docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md | grep -c '^| D[0-9]' # 25
```

**F3 — закрыт, все четыре разрыва названы исполнимо и фактически верно.**

- Общий пакет `packages/terminology` по прецеденту `packages/platform-merge`: прецедент реален —
  `packages/{db-principal,operator-db-schema,platform-merge,error-tracking}`, подключены обоими
  приложениями (`apps/webapp/package.json:52-55`, `apps/integrator/package.json:31-34`) и собираются
  цепочкой `apps/integrator/package.json:10`. Запрет прямых импортов — `apps/webapp/ARCHITECTURE.md:41-45`,
  формулировка «общее выносится в пакет» процитирована точно.
- Patient-safe allowlist: `20260825T084524_close_live_acceptance_runtime_roots.sql` — allowlist ключей
  (`patient_label` есть, нового ключа нет) и второй список в `CASE WHEN … 'authenticated_client'`;
  оба места названы документом как обязательная строка миграции MWT-05. Подтверждено.
- Exact-org капабилити интегратора: `app.read_integrator_runtime_setting(text)` действительно читает
  `scope='admin' AND organization_id IS NULL` (`deploy/postgres/integrator-server-runtime-config.sql:179-208`),
  а прецедент двухветочной формы `app.read_integrator_google_calendar_setting(p_key text,
  p_organization_id uuid DEFAULT NULL)` существует в том же файле (`:215-239`) ровно в описанном виде.
  `getNotifTemplate` — единственное определение (`notifTemplatePort.ts:58`), без `organizationId`;
  `payload.organizationId` действительно уже под рукой на этом пути
  (`bookingLifecycleRoute.ts:931 runWithOrganizationPrincipal(parsed.data.payload.organizationId, …)`).
- Wiring `/book/**`: `app/book/layout.tsx` организацию не резолвит (только shell + attribution capture),
  резолв идёт постранично через `resolvePublicOrganizationBySlugRsc` (`publicOrganizationBooking.ts:98`;
  вызовы в `book/[slug]/page.tsx:26`, `book/service/page.tsx:31`, `[clinicSlug]/booking/page.tsx:34`).
  Вывод «провайдер монтируется после резолва, не в layout» верен.
- Тенантлес-граница определена: `/app` role login → Q9, глобальный админ → Q2, лендинг → Q3, legal и
  фискальный чек → класс C, контент клиники/CMS → класс B. `patient_label` уходит после bounded-миграции
  (§5.2), бессрочного параллельного пути нет.

**F1 — закрыт в названной аудитом части.** Проверено точным поиском: `PatientTabKarta.tsx:972`
(`{ key: 'exam', title: 'Осмотр' }`), `:1955` («Травмы и операции»), `app/legal/terms/page.tsx:41-42`
(«Медицинские решения…», «Сервис не заменяет очную консультацию» — прежнее утверждение о нейтральности
retracted корректно), расширенный список `/book/**` и пациентской записи, строки TG/MAX,
`modules/patient-files/ports.ts:8` (`'выписка' | 'снимок' | 'анализ' | 'фото_теста' | 'прочее'` → D25).
Отдельно проверены и подтверждены как **не** пропуски: карта визита (`NewVisitPanel.tsx` — все видимые
label/placeholder ложатся на D1,D2,D4,D5,D6,D9,D13,D23), пациентский кабинет (дневник, программы,
напоминания, запись — понятия покрыты D7,D8,D9,D16,D21,D22 и `person.*`), SMS (собственной медицинской
копии нет — идёт текст рассылки клиники, класс B), письмо и `.ics` (нейтральны, `serviceTitle` — класс B),
экспорт/печать (медицинской копии нет), `/app/patient/emergency` (редирект на CMS-раздел, класс B).

**F4 — закрыт.** MWT-01…MWT-06 все `[ ]` в плане; taskdb `#1094` — `blocked` + `⏳ЖДЁТ`
(`node /home/dev/brain/tools/taskdb.mjs find bcb "терминолог"`, `list bcb`). Текст плана исправлен:
«следующий вход — независимый аудит этой редакции», а не ответы владельца.

## Минимальный fix-round до следующего gate (docs-only)

1. **N1:** внести `modules/reminders/materializePatientReminderDeliveries.ts` в §2.2 (строка 9) и §6.2;
   завести D-пункт для понятия «бады и лекарства» (варианты для wellness) и строку в Q8; в §2.5-E снять
   утверждение, что фраза принадлежит только шаблонам ботов, и развести две её копии по владельцам
   решения (Q6 — файлы ботов, слой — копия вебаппа).
2. **N2:** внести в §2.3/§2.2/§6.1/§6.2 кодовые источники baseline
   (`recommendations/recommendationDomain.ts`, `tests/clinicalTestAssessmentKind.ts`,
   `lfk-exercises/exerciseLoadTypeReference.ts`, `infra/repos/inMemoryReferences.ts`) вместе с
   требованием трёхточечной синхронизации; поправить §3 — кодовый сид это класс A, а не B; в Q1 указать
   реальный объём каждого варианта; в §4.1 №13 назвать адрес строки в коде.
3. Пройти тем же смысловым поиском остальные модули `apps/webapp/src/modules/**`, которые сегодня в
   §2.2 попадают только в аггрегатную строку «Тексты ошибок доменных модулей» — N1 и N2 найдены именно
   там, где инвентарь опирался на аггрегат вместо перечисления владельцев строк.
4. MWT-01–MWT-03 не закрывать до следующего независимого аудита; MWT-04–MWT-06 не трогать.

## Границы прогона

Продуктовый код, миграции, БД, env, UI и тесты не менялись и не запускались. Full CI не гонялся —
docs-only inspection. До точных `rg` выполнены `code-search` запросы по `patient_label`, пациентским
runtime-настройкам, шаблонам уведомлений интегратора, публичной записи, справочникам и cross-app
пакетам. Единственное изменение этой ветки — настоящий artifact.
