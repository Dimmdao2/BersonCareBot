# Публичная витрина: перепись швов, целевая форма, что снято 19.08

Оракул — `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §33.3, §33.4, §33.5 (решения владельца 19.08).
Правила исполнения — `AGENTS.md` §5, §1b, §1 «Миграции после baseline B0», §10a, §24.6.

Всё измерено на DEV (`bcb_webapp_dev`) 19.08. ПРОД не трогался, на TEST ничего не выкатывалось.

---

## 1. Перепись: что сегодня закрывает публичную витрину

### 1.1. Владельцы швов в кластере

```
select r.rolname, count(p.oid) from pg_roles r
  left join pg_proc p on p.proowner = r.oid
 where r.rolname like 'app_seam_%' group by 1;
```

**43 владельца шва** в живом кластере DEV (замер ведущего подтверждён). Из них **14 держали одну-две
функции** — то есть треть ролей заведена под один-два корня. Один из этих четырнадцати
(`app_seam_public_clinic_card_owner`) существовал ровно ради показа визитки.

Две шкалы, их нельзя путать. **Живой кластер DEV** несёт объекты ДЕСЯТКОВ параллельных веток сразу —
там у `app_seam_public_booking_owner` семь функций, потому что три из них принадлежат ветке
`wt/public-booking-write-20260819`. **Декларация ЭТОЙ ветки** после правки — **42 владельца шва**,
из них **13 с одной-двумя функциями**, и у `app_seam_public_booking_owner` ровно четыре корня.
Ниже везде, где речь о витрине, цифры — из декларации этой ветки.

### 1.2. Что из этого обслуживает витрину

Витрина = анонимный показ публичных данных клиники: визитка `/{clinic}`, медиа визитки
`/{clinic}/media/{uuid}`, первый экран воронки записи `/{clinic}/booking` (филиалы, услуги, слоты,
поля формы).

**Владельцев швов на витрине — 2** (было 3 до правки этого дня):

| Владелец | Функций | Что держит |
| --- | ---: | --- |
| `app_seam_public_slug_owner` | 7 | адрес клиники, визитка, доступность slug, два констрейнт-триггера |
| `app_seam_public_booking_owner` | 4 | резолвер арендатора, каталог, слоты, поля формы — витрина целиком |
| ~~`app_seam_public_clinic_card_owner`~~ | ~~2~~ | **снят 19.08**, см. §3 |

**Определительных функций на витрине — 11.** Семь из них — анонимное чтение, одна — запись из
кабинета, одна — проверка занятости slug при регистрации, две — констрейнт-триггеры целостности:

| Функция | Владелец | EXECUTE | Роль на витрине |
| --- | --- | --- | --- |
| `app.read_public_clinic_card(text)` | public_slug | `app_pre_session` | вся визитка |
| `app.resolve_public_organization_by_slug(text)` | public_slug | `app_pre_session` | slug → организация |
| `app.resolve_public_organization_slug(text)` | public_slug | `app_pre_session` | канонический slug/редирект |
| `app.resolve_public_booking_organization(uuid,uuid)` | public_booking | `app_pre_session` | арендатор воронки |
| `app.read_public_booking_catalog(uuid,uuid)` | public_booking | `app_tenant_service` | филиалы, услуги, специалисты |
| `app.read_public_booking_slot_snapshot(uuid,uuid,text,text)` | public_booking | `app_tenant_service` | свободные слоты |
| `app.list_public_booking_form_fields()` | public_booking | `app_tenant_service` | поля формы записи |
| `app.save_public_clinic_card(...)` | public_slug | `app_staff` | запись визитки из кабинета |
| `app.is_organization_slug_available(text)` | public_slug | `app_pre_session` | регистрация специалиста |
| `app.assert_organization_slug_alias_complete()` | public_slug | — | целостность (deferred trigger) |
| `app.assert_organization_slug_rename_complete()` | public_slug | — | целостность (deferred trigger) |

### 1.3. Объявленные корни и объём поверхности

**16 различных отношений** лежит за этими одиннадцатью дверями (лексическая верхняя граница из
`declaration.ts`, поле `relationSurfaces`):

```
app_runtime_settings · be_appointments · be_availability_rules · be_booking_form_fields ·
be_branches · be_clinic_services · be_organizations · be_schedule_blocks ·
be_specialist_service_availability · be_specialists · be_working_days · be_working_hours ·
clinic_public_directory_entries · media_files · organization_slug_claims ·
organization_slug_rename_events
```

Самая широкая дверь — снимок слотов: **11 отношений в одном корне**.

### 1.4. Ключевой замер: витрина закрыта НЕ грантами, а моделью контекста

Это главное, что даёт перепись, и оно меняет объём «целевой формы».

- `app_pre_session` (класс анонимного посетителя) держит **0 табличных и 0 поколоночных грантов** и
  **не имеет `USAGE` на схему `public`** вообще. `app_tenant_service` — `USAGE` на `public` есть,
  табличных грантов **0**.
- На каждой управляемой таблице стоит `ENABLE ROW LEVEL SECURITY` + `FORCE`, и рабочая роль,
  читающая отношение НАПРЯМУЮ, обязана нести принятый порт-контекст с назначением `relation`
  (`rev10_context_gate_*`, RESTRICTIVE). У анонимного посетителя принципала нет по определению.
- Поэтому «дверь» здесь не украшение: без неё анонимного чтения не существует физически.

**Следствие: снять дверь = не «выдать грант», а ввести публичный класс отношения, который не требует
принятого контекста.** Это правка модели REV10, а не строка привилегий.

### 1.5. Что из шестнадцати отношений действительно смешанное

| Отношение | Публичное целиком? | Чем разделяется |
| --- | --- | --- |
| `clinic_public_directory_entries` | **да**, все колонки — витрина | `is_published AND card_is_published` |
| `organization_slug_claims`, `organization_slug_rename_events` | **да** (адреса публичны) | `kind` |
| `be_organizations` | **да** (название, активность) | `is_active` |
| `be_branches` | **да** (адрес, город) | `is_active` |
| `be_clinic_services` | **да** (услуга, цена) | `is_active AND public_widget_visible AND NOT admin_manual_only` |
| `be_specialists` | **да** (имя, описание) | `is_active` |
| `be_specialist_service_availability` | **да** | `is_active` |
| `be_working_hours`, `be_working_days`, `be_availability_rules`, `be_schedule_blocks` | **вопрос владельцу**, см. §4 | — |
| `be_booking_form_fields` | частично | `visible_to_patient` |
| `app_runtime_settings` | частично | `audience` |
| **`media_files`** | **НЕТ — лежит вместе** | см. ниже |
| **`be_appointments`** | **НЕТ — за стеной** (§33.4) | — |

**`media_files` — доказательство «лежит вместе», а не мнение.** Замер на DEV: строки с
`owner_kind='organization'` включают файлы пациентов (`s3_key` вида
`patient-files/<uuid>/lead-check.txt`) наравне с логотипом визитки
(`media/<uuid>/…png`). Предикат «`owner_kind='organization'`» отдал бы анониму файлы пациентов.
Разделять эту таблицу — та самая отдельная работа по схеме из §33.5.

---

## 2. Целевая форма: публичное читается обычным чтением

Цель по §33.3: анонимная роль читает витрину ОБЫЧНЫМ `SELECT`, опубликованное от неопубликованного
отделяет предикат на строке, а не дверь с собственным владельцем.

Что для этого требуется — поимённо:

**A. Класс отношения «публичное» в модели REV10 (это и есть основная работа).**
Сегодня `rev10_context_gate_*` требует принятый порт-контекст от КАЖДОЙ рабочей роли на КАЖДОМ
отношении. Нужен объявленный класс, у которого этого RESTRICTIVE-гейта нет для анонимного класса:
читатель без принципала — законный случай, а не отказ. Без этого пункты B–D бесполезны: грант есть,
политика есть, а гейт всё равно отдаёт 0 строк и пишет отказ.

**B. Гранты генератора** (`deploy/postgres/privileges/`, НИКОГДА не миграция — §1):
- `GRANT USAGE ON SCHEMA public TO app_pre_session` — сегодня у него `USAGE` только на `app`;
- поколоночный `GRANT SELECT` анонимному классу ровно на витринные колонки девяти отношений:
  `clinic_public_directory_entries`, `organization_slug_claims`, `be_organizations`, `be_branches`,
  `be_clinic_services`, `be_specialists`, `be_specialist_service_availability`,
  `be_booking_form_fields`, `organization_slug_rename_events`.
  Колонки, а не таблицы: `be_clinic_services.admin_manual_only` и `be_booking_form_fields.visible_to_staff`
  — управляющие, наружу не идут.

**C. Политики генератора — по одной `FOR SELECT TO <анонимный класс>` на отношение.** Предикаты уже
существуют колонками (§1.5), выдумывать нечего. Обязательная форма — публикация клиники проверяется
В КАЖДОЙ политике, а не один раз в начале цепочки:
```sql
CREATE POLICY <имя> ON public.be_clinic_services AS PERMISSIVE FOR SELECT TO app_pre_session
  USING (is_active AND public_widget_visible AND NOT admin_manual_only
         AND EXISTS (SELECT 1 FROM public.clinic_public_directory_entries e
                      WHERE e.organization_id = be_clinic_services.organization_id
                        AND e.is_published));
```

**D. Проекция — нужна ровно в двух местах, и только там:**
- `media_files` → публичная проекция «файл, вписанный в опубликованную карточку»
  (`id, mime_type, s3_key, stored_path`). Иначе анонимный `SELECT` по этой таблице упирается в файлы
  пациентов. Это и есть разделение таблицы из §33.5.
- `be_appointments` → наружу не идёт ни строкой. Свободный слот считается из расписания минус
  занятое; либо остаётся один узкий корень расчёта слотов, либо появляется проекция «занятые
  интервалы без пациента» (`specialist_id, start_at, end_at`). Владелец: «человек видит только
  свободный слот».

**E. Что после этого исчезает:** пять из семи анонимных дверей
(`read_public_clinic_card`, `resolve_public_organization_by_slug`, `resolve_public_organization_slug`,
`read_public_booking_catalog`, `list_public_booking_form_fields`) становятся обычными запросами
приложения. `app_seam_public_slug_owner` остаётся только под два констрейнт-триггера и запись
визитки; `app_seam_public_booking_owner` — только под слоты и непубличную часть (телефон клиента,
зачисление). То есть **два владельца шва на витрине превращаются в ноль анонимных читающих дверей**.

**Схему в этой работе НЕ трогали** — §33.5: разделение таблиц начинается с переписи, она выше.

---

## 3. Что снято уже сейчас, без разделения таблиц

### 3.1. Снят выделенный владелец шва визитки

`app_seam_public_clinic_card_owner` — роль, заведённая 19.08 ровно ради показа визитки и названная
владельцем в §33.3 избыточной машинерией. Обе её двери переведены на уже существующий
`app_seam_public_slug_owner`.

Почему именно к нему, а не «куда-нибудь»: весь шов резолвера slug публичен ЦЕЛИКОМ — закрытых
таблиц в нём нет ни одной. Прежнее возражение («визитка растянет шов на медиа-библиотеку») снято
предикатом: `media_files` этот шов читает единственным условием «файл вписан в ОПУБЛИКОВАННУЮ
карточку», а не как библиотеку.

Изменено:
- `deploy/postgres/privileges/declaration.ts` — владелец обеих функций, роль убрана из `REV10_SEAM_OWNERS`;
- `deploy/postgres/generated/privileges.{bcb_webapp_dev,bersoncarebot_test}.sql` — перегенерированы,
  `--check` проходит побайтно; упоминаний снятой роли в артефактах **0**;
- `apps/webapp/db/drizzle-migrations/0049_…sql` — два заголовка `BCB-MIGRATION-OWNER` и два литерала
  в гейтах. Правка НА МЕСТЕ, не форвард-миграцией, и это единственный такой случай: снятую из
  декларации роль негде взять при воспроизведении `B0 + forward` с нуля, а `SET ROLE` на неё стоит в
  заголовке этого файла. Для уже применённых баз правка инертна — мигратор берёт pending по
  watermark `created_at` и хеш не сверяет (`migrate-local.mjs:120`);
- `function-census.test.mjs` — счётчики владельцев 47→46 и 46→45 с причиной;
- `clinicPublicCard.devDbProof.test.ts` — ожидаемый владелец.

**Прав в миграции не выдано и не отозвано ни одного** (§1): владельца функции и текст гейта в живой
базе переписывает шаг reconcile из сгенерированного артефакта — это проверено живьём (§3.3).

### 3.2. Роль в кластере: доказано, что ею ничего не владеет

После reconcile на DEV:
```
pg_proc      proowner = app_seam_public_clinic_card_owner  → 0
pg_class     relowner = …                                   → 0
pg_namespace nspowner = …                                   → 0
pg_type      typowner = …                                   → 0
```
`DROP OWNED BY app_seam_public_clinic_card_owner` на DEV снял всё остальное: 40 поколоночных
привилегий → 0, два `pg_default_acl` → 0, `USAGE` на `app`/`public` → снят.

`DROP ROLE` **не выполнен и выполнен быть не может сейчас**, и это не упущение:
```
ERROR: role "app_seam_public_clinic_card_owner" cannot be dropped because some objects depend on it
DETAIL: 54 objects in database bersoncarebot_test
```
Роль общая на кластер, а TEST по условию задачи не выкатывается. Роль исчезнет из кластера первым же
reconcile TEST-базы; до этого она висит без единой привилегии и без единого объекта.

**Отдельная находка для протокола:** генератор умеет РОЖДАТЬ роль и не умеет её ХОРОНИТЬ — в
артефакте нет ни одного `DROP ROLE` и ни одного `REVOKE` в адрес роли, которой в декларации больше
нет. Пока это не механизировано, снятие любой роли оставляет за собой ровно тот мусор, который
пришлось убирать здесь руками.

### 3.3. Живое доказательство на DEV

Фикстура (создана и снята): `clinic_public_directory_entries` клиники `dmitryberson` —
`card_is_published=true`, `logo_media_id` = готовый org-PNG, `description` = маркер. После проверки
восстановлено в исходное `false/NULL/NULL` (сверено с записанным до правки снимком).

Собственный dev-сервер на :5311 (`:5200` и `:5202` соседей не тронуты), анонимный `curl` без cookie:

| Что | Ответ | Что доказывает |
| --- | --- | --- |
| `/dmitryberson` (опубликована) | **200**, имя + описание + логотип | витрина отдаётся анониму |
| `/dmitryberson/booking` | **200**, первый экран | воронка отдаётся анониму |
| `/audit-unpublished-clinic` | **404** | неопубликованная клиника не показывается |
| `/race-clinic-start` (клиника опубликована, карточка выключена) | **404** | второй выключатель работает |
| `/no-such-clinic-xyz` | **404**, тело того же размера | перечислить клиники нельзя |
| `/audit-unpublished-clinic/booking` | **404** | воронка неопубликованной закрыта |
| `/dmitryberson/media/<логотип карточки>` | **307** на выдачу | публичное медиа отдаётся |
| `/dmitryberson/media/<файл пациента той же клиники>` | **404** | **стена пациента держится** |
| `/dmitryberson/media/<неконвертированный файл>` | **404** | сырое наружу не идёт |
| `/dmitryberson/media/<несуществующий uuid>` | **404**, тот же ответ | различить нельзя |
| `/api/media/<uuid>` анонимно | **401** | общий чокпоинт не ослаблен |

Разметка визитки: `organization_id`, `branchId`, `tariff`, `specialists_json` — **0 вхождений**.

Тесты: `node --test deploy/postgres/privileges/*.test.mjs` → **99 passed / 0 failed / 9 skipped**;
`generate-cli.mjs --check` → четыре артефакта совпадают побайтно;
живой `clinicPublicCard.devDbProof.test.ts` против `bcb_webapp_dev` → **2 passed** (владелец обеих
функций = `app_seam_public_slug_owner`, читает только `app_pre_session`, пишет только `app_staff`,
пересечения нет); пять затронутых webapp-тестов → **21 passed**.

### 3.4. Что ещё делал reconcile на общей DEV-базе (говорю прямо)

Артефакт прав применяется ЦЕЛИКОМ и по построению приводит базу к ОДНОЙ декларации. На DEV, где
параллельно живут десятки веток, это имеет цену, и она наступила:

- Отозвался `CONNECT` и `USAGE ON SCHEMA app` у четырёх dev-логинов — их выдаёт не закоммиченный
  артефакт, а env-рендер (`--env dev --db bcb_webapp_dev`), который я сперва не прогнал.
  **Восстановлено**, приложение проверено после восстановления.
- Отозвались гранты `app_seam_public_booking_owner` на `org_enrollments`, `user_contacts`,
  `user_identity` — они объявлены в декларации ветки `wt/public-booking-write-20260819`, не в этой.
  Вернутся первым же её reconcile.
- Четыре её функции (`enroll_current_patient_in_public_booking_clinic`,
  `resolve_public_booking_client_by_phone`, `revoke_public_booking_enrollment`,
  `assert_org_patient_count_quota_available`) на DEV отсутствуют. Мой артефакт их удалить НЕ МОГ:
  `DROP FUNCTION` в нём нет ни одного, а на необъявленную `SECURITY DEFINER`-функцию он ОТКАЗЫВАЕТ
  выкатку (`undeclared SECURITY DEFINER function`) — то есть если бы они существовали в момент
  применения, применение бы упало. Оно прошло, значит их убрали раньше и не мной.

**Это структурная опасность, а не разовая неудача:** одна общая DEV-база + артефакт прав на каждую
ветку = каждый reconcile откатывает DEV к своей ветке. Вынесено вопросом в §4.

---

## 4. Вопросы владельцу (не решал сам)

1. **Расписание клиники — публичное или нет?** `be_working_hours`, `be_working_days`,
   `be_availability_rules`, `be_schedule_blocks`. В §33.4 их нет ни в публичном списке, ни за стеной.
   Свободный слот посетитель видеть должен — но раскрытое расписание показывает и ЗАНЯТОЕ время
   (по разности). Персональных данных там нет; это про то, видно ли снаружи, насколько клиника
   загружена. Безопасный вариант по умолчанию, если ответа не будет: оставить расчёт слотов за узким
   корнем, наружу отдавать только свободные интервалы.
2. **Имена специалистов на витрине.** §33.4 называет их публичными, а сегодня их нет нигде:
   на визитке специалистов не выводится, а публичная дверь каталога не несёт идентичности
   специалиста вовсе — параметр `?specialist=` в ссылке на воронку записи молча игнорируется
   (`apps/webapp/src/app/[clinicSlug]/booking/loadBookingEntry.ts`). Это дыра между правилом и
   продуктом; чинить её — отдельная задача, я её не заводил.
3. **Публичные контакты клиники.** §33.4: место под них не заводить, клиника пишет телефон текстом.
   Сейчас на визитке есть отдельные поля `public_contact_phone`/`public_contact_email`/`public_website_url`
   и они заполняются из кабинета. Оставляем как есть или сводим в текст описания?
4. **Общая DEV-база и артефакт прав на ветку** (§3.4). Сегодня любой агент, применивший свой
   reconcile, откатывает DEV-права всех остальных веток. Нужно решение: либо reconcile на DEV делает
   только один назначенный процесс, либо у каждой ветки своя база.

---

## 5. НЕ СДЕЛАНО

- **Анонимное обычное чтение не введено.** Ни одного гранта и ни одной политики анонимному классу не
  добавлено. Причина названа замером (§1.4): мешает не отсутствие гранта, а RESTRICTIVE-гейт
  контекста на каждом отношении; это правка модели REV10, а не привилегий, и она требует решения по
  публичному классу отношения. Спроектировано в §2, не исполнено.
- **Таблицы не разделены** — прямо запрещено брифом и §33.5. `media_files` и `be_appointments`
  остаются смешанными; доказательство смешанности `media_files` — в §1.5.
- **`DROP ROLE` не выполнен** — блокирует 54 объекта в `bersoncarebot_test`, а TEST по условию не
  трогается (§3.2). На DEV роль обнулена полностью.
- **Второй владелец шва витрины (`app_seam_public_booking_owner`) не тронут.** Все четыре его корня
  в этой ветке — витрина, и слить его в `app_seam_public_slug_owner` было бы логично, но нельзя
  сейчас: его самый широкий корень (`read_public_booking_slot_snapshot`) читает `be_appointments` —
  таблицу ЗА СТЕНОЙ по §33.4. Слияние растянуло бы шов, целиком публичный сегодня, на записи на
  приём. Развязывается это разделением таблиц (§2 п. D), то есть работой из §33.5.
- **`app.list_active_booking_cities()`** — единственный корень без единого вызова в
  `apps/*/src` (проверено точным поиском по идентификатору и через `code-search --repo bcb`).
  Похоже на мёртвую дверь, но `wt/public-booking-*` ветки живы и могут её подключать — не удалял.
- **Полный CI не гонялся.** Прогнаны: весь `test:db-privileges` (99 passed), пять затронутых
  webapp-тестов (21 passed), живой dev-DB proof (2 passed), `--check` артефактов. Ни `lint`, ни
  `typecheck`, ни полный `test:webapp`.
- **На TEST ничего не выкатывалось, в `feat` не вливалось, ПРОД не трогался.**
