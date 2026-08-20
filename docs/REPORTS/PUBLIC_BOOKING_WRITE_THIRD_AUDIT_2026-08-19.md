# Слепой аудит ветки публичной записи перед приземлением — третий проход

**Вердикт: FAIL.** Четыре блокера, ни один не про поведение записи: поведение подтверждено и
соответствует решению владельца. Блокеры — механические, все воспроизводятся одной командой.

Ветка `wt/public-booking-write-20260819` @ `b312a65f5` (+ мой тест `eac8ed8ee`), база сравнения
`feat/doctor-ui-rebuild`. Мнение сформировано до чтения двух прежних отчётов; расхождения с ними
названы отдельно.

---

## Сводка

| # | Находка | Класс | Чем проверял |
|---|---|---|---|
| F1 | Живое доказательство под коммитом `36a08e341` — пустое: транзакция упала на `42501`, все последующие ответы `25P02`. Вывод при этом ВЕРЕН | запись в журнале, не дефект кода | сходил посмотреть (лог PostgreSQL) + свой живой замер |
| F2 | Миграции ветки НЕ МОГУТ быть применены к DEV ни одним санкционированным маршрутом: водяной знак закрыт, объектов в базе нет | блокер | живой прогон (`devDbProof` ветки падает 3/4) |
| F3 | `generate-cli.mjs --check` красный на обеих базах: артефакт разошёлся с декларацией после merge | блокер | прогон гейта |
| F4 | `pnpm --dir apps/webapp lint` красный: `check-transaction-quota-port-boundary`. Причина — ЭТА ветка, не предсуществующая | блокер | прогон + подстановка версии файла из `feat` |
| F5 | Drizzle-схема `bookingEngine.ts` осталась на списке 0051 (2 канала), база после 0052 держит 4 | находка | сходил посмотреть |
| F6 | `COMMENT ON FUNCTION app.assert_org_patient_count_quota_available` утверждает «оба создателя её зовут» — неверно после 0053 | находка | сходил посмотреть |

Что проверено и ЧИСТО: §1 по правам (пункты 1, 2, 5 брифа), поведение лимита (пункт 3), контакты
формы (пункт 4), отсутствие лишнего (пункт 6). Подробности ниже.

---

## 1. Последняя строка прав: вывод верен, доказательство под ним — пустое

**Утверждение исполнителя `declare-enroll-root-20260819`:** снятие `REVOKE` со строки `0051:283`
безопасно, потому что `app.enroll_current_patient_in_public_booking_clinic(uuid)` транзитная, и
потому что ACL после `CREATE FUNCTION` байт-в-байт одинаков со строкой и без неё — «доказано на DEV
в изолированной `BEGIN…ROLLBACK`».

**Вывод верен. Доказательство — нет: обе его половины ничего не измерили.** Обе попытки (два
прогона, четыре сессии) упали на первом же `CREATE FUNCTION`, а «одинаковый ACL» получился потому,
что в обоих случаях не было НИКАКОГО ответа — транзакция была уже аварийной:

```
$ sudo -u postgres grep -n 'enroll_current_patient_in_public_booking_clinic' \
      /var/log/postgresql/postgresql-16-main.log
179794: 19:56:57.821 postgres@bcb_webapp_dev psql 42501 ERROR: permission denied for schema app
        STATEMENT: CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(
179874: 19:56:57.822 psql 25P02 ERROR: current transaction is aborted, commands ignored until end of transaction block
        STATEMENT: COMMENT ON FUNCTION …
179879: 25P02  STATEMENT: REVOKE ALL ON FUNCTION …(uuid) FROM PUBLIC;
179881: 25P02  STATEMENT: SELECT p.proacl FROM pg_proc … AND p.pronargs=1;   ← «доказательство» ACL
180059: 19:57:12.224 [144776] тот же 42501 на втором прогоне (вариант «без строки 283»)
```

Причина падения: роли-владельцу не выдали `CREATE ON SCHEMA app` (это делает сам `migrate-local.mjs`
временным грантом, вручную его не воспроизвели).

**Свой замер — тот же вопрос, поставленный корректно.** Два независимых среза, оба живые:

```
$ sudo -u postgres psql -d bcb_webapp_dev -Atc "select coalesce(nspname,'<all schemas>'), defaclobjtype,
    array_to_string(defaclacl,' | ') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where pg_get_userbyid(defaclrole)='app_seam_public_booking_owner';"
<all schemas>|f|app_seam_public_booking_owner=X/app_seam_public_booking_owner
   (то же самое на bersoncarebot_test)
```

и прямая проба с временным грантом и откатом — на обеих базах:

```
BEGIN;
GRANT CREATE ON SCHEMA app TO app_seam_public_booking_owner;
GRANT USAGE ON LANGUAGE plpgsql TO app_seam_public_booking_owner;
SET LOCAL ROLE app_seam_public_booking_owner;
CREATE FUNCTION app.zz_audit_probe_enroll(p_organization_id uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog AS $fn$ BEGIN RETURN 'probe'; END; $fn$;
RESET ROLE;
SELECT has_function_privilege('public', 'app.zz_audit_probe_enroll(uuid)'::regprocedure, 'EXECUTE'), proacl …;
ROLLBACK;

 app.zz_audit_probe_enroll(uuid) | public_execute = f | app_seam_public_booking_owner=X/app_seam_public_booking_owner
```

`PUBLIC` не получает `EXECUTE` ни на одну новую функцию этого владельца — снятая строка отзывала
уже нулевое право. **Публичного доступа к функции зачисления нет.** Ключевой риск закрыт.

Транзитность однопараметровой сигнатуры тоже подтверждаю независимо: `migrate-local.mjs:207` ставит
один `BEGIN;` на ВСЕ pending-миграции и один `COMMIT;` на строке 255, а `0052:178` делает
`DROP FUNCTION IF EXISTS …(uuid)`; на TEST все три миграции pending одновременно (см. §2). Сверх
этого её удалила бы сама сверка каталога: `generate.mjs:1581-1591` в каждом reconcile сносит
`DROP ROUTINE`-ом любую `SECURITY DEFINER`-функцию управляемых схем, которой нет в объявленном
списке.

**Все пять функций, которые миграции ветки оставляют в базе, покрыты генератором ПОИМЁННО:**

```
$ grep -n '^REVOKE ALL ON FUNCTION app\.<имя>.* FROM PUBLIC;' deploy/postgres/generated/privileges.bcb_webapp_dev.sql
4018  assert_org_patient_count_quota_available(uuid)
4358  create_current_patient_booking_appointments(text)
4879  enroll_current_patient_in_public_booking_clinic(uuid,text)
7027  resolve_public_booking_client_by_phone(text,text,boolean)
7117  revoke_public_booking_enrollment(uuid)
```

плюс сплошной цикл по управляемым схемам (`generate.mjs:1593-1601`), который отзывает у `PUBLIC`
вообще всё, объявлено оно или нет.

**Что с этим делать.** Кода это не касается — касается записи в очереди
(`NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, строка `declare-enroll-root-20260819`) и тела коммита
`36a08e341`: они ссылаются на замер, которого не было. Следующий читатель поверит цифрам, которых
никто не получал. Строку очереди надо поправить на реальное основание (умолчательные права роли +
сплошной цикл reconcile), а не на «ACL байт-в-байт».

---

## 2. БЛОКЕР: миграции ветки не могут доехать до DEV ни одним санкционированным маршрутом

**Замер.** На `bcb_webapp_dev` леджер уже содержит строки ровно с теми `created_at`, что стоят у
трёх миграций ветки, — а объектов этих миграций в базе НЕТ:

```
$ sudo -u postgres psql -d bcb_webapp_dev -Atc "select max(created_at), count(*) from drizzle.__drizzle_migrations;"
1800000056000|54
$ sudo -u postgres psql -d bcb_webapp_dev -Atc "select p.oid::regprocedure::text from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='app'
    and (p.proname like '%public_booking%' or p.proname like '%patient_count_quota%') order by 1;"
app.list_public_booking_form_fields()
app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)
app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)
app.read_public_booking_catalog(uuid,uuid)
app.read_public_booking_slot_snapshot(uuid,uuid,text,text)
app.resolve_public_booking_organization(uuid,uuid)
```

Все шесть — из 0047 (половина ЧТЕНИЯ, уже в `feat`). Четырёх дверей ветки
(`resolve_public_booking_client_by_phone`, `enroll_current_patient_in_public_booking_clinic`,
`revoke_public_booking_enrollment`, `assert_org_patient_count_quota_available`) в `pg_proc` нет.

**Прогон шиппящейся логики мигратора по живым леджерам** (функция `findSilentlySkippedMigrations`
взята дословно из `migrate-local.mjs:108-112`, журнал и строки леджера — настоящие):

```
=== bcb_webapp_dev
watermark=1800000056000 ledgerRows=54 journalEntries=53
pending(0): <none>
silentlySkipped(0): <none>
  0051…: when=1800000053000 pending=false hasLedgerRow=true
  0052…: when=1800000055000 pending=false hasLedgerRow=true
  0053…: when=1800000056000 pending=false hasLedgerRow=true

=== bersoncarebot_test
watermark=1800000051000 ledgerRows=50 journalEntries=53
pending(3): 0051…, 0052…, 0053…
```

То есть на DEV мигратор напечатает `already current: pending=0` поверх четырёх отсутствующих
функций. Анти-пропускной гейт (тот самый, что чинили в `wt/test-ledger-20260819`) молчит по
построению: он сравнивает `created_at`, а строки с этими `created_at` в леджере ЕСТЬ. Восстановление
`--apply-out-of-order` тоже отказано — `migrate-local.mjs:143-147` отвергает тег, которого нет в
`silentlySkipped`. Ручной `psql` мимо wrapper'а запрещён §1.

**Живое подтверждение — собственным тестом ветки:**

```
$ RUN_PUBLIC_BOOKING_WRITE_WALLS_DB=1 node --test deploy/postgres/privileges/public-booking-write-walls.devDbProof.test.mjs
not ok 1 - дверь зачисления не верит аргументу…
  error: ERROR:  function "app.enroll_current_patient_in_public_booking_clinic(uuid,text)" does not exist
not ok 2 - дверь зачисления берёт человека из контекста, а не из аргумента       (та же ошибка)
not ok 3 - выписанного и архивного клиента дверь зачисления обратно не открывает (та же ошибка)
ok 4  # tests 4 # pass 1 # fail 3
```

**Как база пришла в это состояние — измерено, а не предположено.** История журнала ветки: в
`ea7094bff` у 0051 было `when=1800000052000`, потом её перенумеровали в `1800000053000`. В леджере
DEV обе строки с ОДИНАКОВЫМ хешем `786853cc…` — миграцию применили дважды, до и после перенумерации.
Дальше объекты снёс reconcile соседней ветки: артефакт `feat` несёт цикл `DROP ROUTINE` для
`SECURITY DEFINER`-функций управляемых схем, которых нет в объявленном списке, и в нём:

```
$ git show feat/doctor-ui-rebuild:deploy/postgres/generated/privileges.bcb_webapp_dev.sql > /tmp/feat-priv.sql
$ grep -c DROP\ ROUTINE /tmp/feat-priv.sql                                        → 1
enroll_current_patient_in_public_booking_clinic       упоминаний в артефакте feat: 0
resolve_public_booking_client_by_phone                                            0
revoke_public_booking_enrollment                                                  0
assert_org_patient_count_quota_available                                          0
create_current_patient_booking_appointments                                       24
```

Ровно это и видно в базе: четыре необъявленные двери удалены, а `create_current_patient_booking_appointments`
уцелела — и уцелела ИМЕННО в редакции 0051 (`diff` тела из `pg_proc` с телом из файла: 0 строк).
Значит на общей DEV-базе любой `--execute` из worktree, стоящего на `feat`, стирает ещё не
приземлённые двери этой ветки, а леджер продолжает отвечать «применено».

**Последствие.** Приземление ветки как есть оставляет DEV навсегда без половины ЗАПИСИ публичной
воронки: путь `/api/booking/public/create/confirm` зовёт `app.resolve_public_booking_client_by_phone`,
которой в базе нет, и вернёт `create_failed`. §1 требует прямо: «Перед сведением в `feat` сверь
`when` своей миграции с `max(created_at)` обеих баз; если соседняя ветка уже подняла водяной знак
выше — назначь новый `when`». `max(created_at)` DEV = `1800000056000` = собственный `when` 0053.

**Маршрут починки** (§1 разрешает: файлы к TEST не применены): назначить трём миграциям `when` выше
`1800000056000` — тогда они станут pending и на DEV, и на TEST (у TEST водяной знак 1800000051000,
он ниже в любом случае). Переименование файлов при этом не требуется, меняется только `when` в
`meta/_journal.json` и порядок.

---

## 3. БЛОКЕР: сгенерированный артефакт прав разошёлся с декларацией

```
$ node deploy/postgres/privileges/generate-cli.mjs --check ; echo EXIT=$?
КРАСНЫЙ bcb_webapp_dev/privileges: … разошёлся с декларацией   (строка 4019)
КРАСНЫЙ bersoncarebot_test/privileges: … разошёлся с декларацией (строка 4031)
--check: расхождений 2. Перегенерируйте артефакт и закоммитьте.
EXIT=1
```

Разница ровно в одном имени: закоммиченный артефакт держит в списке `REVOKE ALL ON FUNCTION
app.assert_org_patient_count_quota_available(uuid) FROM …` роль `app_seam_public_clinic_card_owner`,
которой в декларации больше нет — её снял `cfa4e45df` («снят владелец шва визитки»), приехавший в
ветку с merge `b312a65f5`. Артефакт ветки генерировали ДО этого merge.

Атрибуция однозначна: **`feat` чист**, красная только ветка.

```
$ git worktree add /tmp/x feat/doctor-ui-rebuild && cd /tmp/x && node deploy/postgres/privileges/generate-cli.mjs --check
--check: артефакты соответствуют декларации побайтно.        EXIT=0
$ grep -c app_seam_public_clinic_card_owner deploy/postgres/generated/privileges.bcb_webapp_dev.sql
4      ← и все четыре сидят на REVOKE-строках четырёх функций, которые добавляет ЭТА ветка
```

`--check --port-context-only` при этом зелёный (EXIT=0) — разошлась только привилегийная половина.

**Последствие.** Мердж-гейт красный; выкатка на TEST ассертит точный набор прав каждой роли, а
артефакт описывает набор, которого декларация уже не производит. Починка тривиальна —
перегенерировать два файла и закоммитить, — но это правка, а не приёмка, и в скоуп аудита не входит.

---

## 4. БЛОКЕР: lint красный, и это регрессия ветки, а не предсуществующее

```
$ pnpm --dir apps/webapp lint
check-transaction-quota-port-boundary: quota-port bypass detected.
  - apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts:
    contains a quota-consuming mutation without transactionQuotaPort.withinLock
 ELIFECYCLE  Command failed with exit code 1.
```

Прежний отчёт (`declare-enroll-root-20260819`) назвал это «предсуществующим, воспроизведён на
немодифицированной ветке». **Это неверно.** Подстановка версии ровно ЭТОГО файла из `feat` в дерево
ветки делает гейт зелёным:

```
$ git checkout feat/doctor-ui-rebuild -- apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts
$ node scripts/check-transaction-quota-port-boundary.mjs   → check-transaction-quota-port-boundary: OK   EXIT=0
$ git checkout HEAD -- apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts   (дерево восстановлено)
```

На `feat` файл держит `transactionQuotaPort.withinLock` (строка 48); ветка заменила его на
`assertOrgPatientCountQuotaAvailable`, перенеся замок внутрь SQL-функции
(`pg_advisory_xact_lock` в теле `app.assert_org_patient_count_quota_available`). Атомарность,
похоже, сохранена — но репозиторий держит этот chokepoint МЕХАНИЧЕСКИ, и механику не обновили.
Гейт `--self-test` при этом исправен (4 формы обхода отвергает, каноничный писатель принимает), то
есть красный — не ложное срабатывание сломанного гейта, а честный отказ: писателя вынесли из порта.

Допустим ли новый адрес chokepoint — вопрос ведущего/владельца (см. «Вопросы владельцу»). Но
приземляться с красным lint нельзя в любом варианте ответа.

---

## 5. Гейт `check-migration-privileges` — исправен, ловит и снимавшуюся форму, и её маскировки

```
$ node scripts/check-migration-privileges.mjs             → OK (54 migration files)        EXIT=0
$ node scripts/check-migration-privileges.mjs --self-test → self-test OK (7 red, 1 green)  EXIT=0
```

Зелёный сам по себе ничего не доказывает, поэтому подсовывал настоящий файл в
`apps/webapp/db/drizzle-migrations/` и гонял гейт на нём (файл каждый раз удалялся, дерево чистое):

| подсунутая форма | гейт |
|---|---|
| снятая строка `0051:283` дословно | **красный** `REVOKE` |
| `EXECUTE 'REVOKE ALL ON FUNCTION … FROM PUBLIC'` в `DO`-блоке | **красный** `REVOKE (inside a string literal)` |
| `EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %I.%I() FROM PUBLIC', …)` | **красный** |
| `EXECUTE 'GRANT …'` / `EXECUTE 'ALTER DEFAULT PRIVILEGES …'` | **красный** |
| `EXECUTE 'REVOKE …'` внутри тела `$function$` plpgsql-функции | **красный** |
| `revoke all on function … from public;` строчными | **красный** |
| `REVOKE` с переносом строки после ключевого слова | **красный** |
| `REVOKE` сразу после `--> statement-breakpoint` и комментария-владельца | **красный** |
| `GRANT … GRANTED BY …` | **красный** |
| чистый файл без прав (контроль) | зелёный |

**Две формы гейт НЕ ловит:** `ALTER FUNCTION … OWNER TO <роль>` и `REASSIGN OWNED BY … TO …`.
Смена владельца — это смена держателя всех прав на объект, то есть формально «иное изменение прав»
из §1. **Ветка ни ту, ни другую не использует** (проверено `grep -niE 'owner to|reassign owned' по
трём миграциям — пусто), так что это не нарушение ветки, а вопрос о покрытии гейта.

---

## 6. §1 по трём миграциям целиком — чисто

- **Прав нет вообще.** `grep -niE "grant |revoke |create role|alter role|default privileges|create policy"`
  по `0051`/`0052`/`0053` — ни одного попадания (только слова `SECURITY DEFINER` и текст в комментариях).
- **Временные номера на месте у всех трёх:** `0051:2`, `0052:2`, `0053:5` — `-- TEMPORARY LOCAL
  MIGRATION NUMBER 00NN`.
- **Водяной знак — нарушен**, см. F2.
- **Индекс на горячую колонку:** новых колонок под нагрузкой миграции не добавляют (одна `ALTER TABLE
  … ADD CONSTRAINT CHECK` на `org_enrollments` и функции), требование неприменимо.
- **CHECK `org_enrollments_portal_activation_check` согласован между миграциями:** 0051 ставит список
  из двух значений, 0052 его расширяет до четырёх, 0053 пишет `public_booking_verified_email` /
  `public_booking_session` — попадают в расширенный список. Порядок внутри одной транзакции,
  разрыва нет.

---

## 7. Снятие лимита клиентов с пути записи — ПОДТВЕРЖДЕНО

Оракул — владелец 19.08: «оплаченное место не должно быть связано с записями на приём вообще никак»,
при этом «специалистов ограничивать — да, это надо».

**Чем проверял: ТЕСТОМ, и вот почему.** Живой прогон на DEV невозможен физически — дверей
зачисления в базе нет (F2), путь падает на `function … does not exist` до всякой квоты. Поэтому
поведение зафиксировано слепым тестом, написанным мной, а не автором ветки:
`apps/webapp/src/app-layer/booking/publicBookingSeatIndependence.unit.test.ts` (коммит `eac8ed8ee`).

```
$ cd apps/webapp && npx vitest run --project unit src/app-layer/booking/publicBookingSeatIndependence.unit.test.ts
 Test Files  1 passed (1)      Tests  8 passed (8)
```

Что он утверждает:

1. Публичный путь `createVerifiedPublicBooking` НИ РАЗУ не называет
   `app.assert_org_patient_count_quota_available` — ни через именованный корень, ни через SQL-слой.
   Детектор снабжён **положительным контролем**: тот же рендер того же SQL-слоя обязан показать эту
   дверь по имени, когда её действительно зовут (тест писателя карточек персонала), иначе
   утверждение «не называет» проходило бы вхолостую.
2. Клиника на потолке принимает публичную запись: даже если дверь квоты подсунуть падающей на
   `53400`, запись доходит до `createBooking`.
3. Писатель карточек ПЕРСОНАЛА квоту по-прежнему спрашивает и на потолке отказывает
   (`53400` → `StockQuotaReachedError('patient_count')`), а для уже существующей карточки не
   спрашивает.
4. Место специалиста ограничено как прежде: `decideClinicTeamQuota` на потолке даёт
   `seat_limit_reached` (когда место не продаётся) или `seat_overage_confirmation_required` (когда
   продаётся), и пропускает, пока оплаченное место свободно. Файл `transactionQuotaPort.ts` ветка
   правила только добавлением — команда сверки: `git diff feat…HEAD -- …/transactionQuotaPort.ts`
   показывает один изменённый import и +45 строк новой функции, логика мест не тронута.

**Проверка теста инъекцией дефекта** (после коммита теста, по правилу): вернул вызов квоты на
публичный путь ровно так, как это делала 0052 —

```
× never reaches the patient_count ceiling on the public write path
× books the visitor even when the clinic is at its client ceiling
Tests  2 failed | 6 passed (8)
```

— инъекция откачена, дерево чистое, тест снова 8/8. Тест ловит именно ту регрессию, ради которой
написан.

Код-сторона совпадает с тестом: `0053` пересоздаёт дверь зачисления без вызова квоты (строки 92-96:
`INSERT INTO public.org_enrollments … ON CONFLICT DO NOTHING`, обращения к
`assert_org_patient_count_quota_available` в теле нет), а `pgPatientOrganizationEnrollment.ts:56`
её зовёт.

---

## 8. Телефон и почта из формы — не теряются

Живой прогон снова невозможен по F2; проверено тестом (пункт «carries the phone and the e-mail of
the form to the booking unchanged», зелёный): `intent.contactPhone`, `intent.contactEmail` и
`intent.contactName` доезжают до `deps.patientBooking.createBooking` дословно, включая непустую
почту. Соответствует коду: `createVerifiedPublicBooking.ts:111-113`.

Отдельно проверил канал подтверждения, потому что он влияет на то, чем человек может подтвердиться:
`identifyPublicBookingPayer` возвращает СВОЙ канал в каждой ветке (`public_booking_phone_otp` /
`public_booking_verified_email` / `public_booking_session`), закрытый список двери (`0053:62-69`) и
CHECK таблицы (`0052:67-76`) содержат все три. Почта проходит наравне с телефоном.

---

## 9. Лишнего не пришло

- **Новых ролей нет.** `git diff feat…HEAD -- declaration.ts | grep -i 'owner\|role'` даёт только
  ссылки на уже существующие `app_seam_public_booking_owner` и `app_seam_org_commerce_owner`; обе
  роли живут на DEV и TEST до этой ветки.
- **Новых владельцев швов нет** — наоборот, ветка приняла merge, который один шов удалил (отсюда F3).
- **Новые файлы — все в плане:** три миграции, юнит-тест автора, `devDbProof`-тест стен, два отчёта,
  один план (`docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md`). Ничего постороннего.
- Изменения в `packages/db-principal/src/portContext.ts`, `portContextRuntime.ts` и
  `port-context/contract.sql` — одно и то же исключение (корень зачисления работает под личностным
  принципалом без заявки на арендатора, иначе круг замыкается сам на себя), проведённое во всех трёх
  местах согласованно. Логическое преобразование в `assertPrincipal` эквивалентно прежнему
  (`!(A || B)` → `!A && !B`), не расширяет допуск.

---

## 10. Мелкие находки

**F5. Drizzle-схема отстала от базы.** `apps/webapp/db/schema/bookingEngine.ts:314` описывает CHECK
как `IN ('patient_invite_email_otp', 'public_booking_phone_otp')`, а база после 0052 держит четыре
значения. Автогенератора миграций из схемы в lint нет, поэтому сегодня это молчит; следующий
`drizzle-kit generate` выпустит миграцию, СУЖАЮЩУЮ ограничение обратно до двух — и тихо выключит
каналы «подтверждённая почта» и «действующая сессия», по которым дверь зачисления уже умеет
работать. Достижимо, последствие — отказ записи для вошедшего человека и для подтвердившегося почтой.

**F6. Комментарий объекта в базе врёт.** `0052:170-172` ставит
`COMMENT ON FUNCTION app.assert_org_patient_count_quota_available(uuid) IS 'The only patient_count
ceiling: both creators of an org_enrollments row call it…'`, а 0053 второго вызывающего убирает и
комментарий не переписывает. Это не текст в репозитории, а живая строка в `pg_description`, которую
читает следующий, кто разбирается с квотой.

---

## Расхождения с прежними отчётами

1. `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, строка `declare-enroll-root-20260819`: «Доказательство на
   DEV … ACL после `CREATE FUNCTION` байт-в-байт одинаков со строкой 283 и без неё» — **замера не
   было**, обе транзакции аварийные (§1). Вывод строки верен, основание — нет.
2. Та же строка: «`pnpm --dir apps/webapp lint` красный на предсуществующем
   `check-transaction-quota-port-boundary` … воспроизведён на немодифицированной ветке» — **неверно**,
   красное вносит эта ветка (§4).
3. Та же строка честно называет ledger-drift 0051-0053 на DEV «не входило в скоуп». Это не деталь
   гигиены: drift делает ветку неприменимой к DEV навсегда (§2), и он же — причина, по которой
   «живьём» больше ничего проверить нельзя.
4. `PUBLIC_BOOKING_WRITE_BLIND_AUDIT_2026-08-19.md`, раздел «Что с находками стало»: «F1 — закрыта.
   Проверка квоты переехала в единственную функцию …, которую зовут ОБА создателя отношения» — про
   0053 там нет ни слова, читатель получит неверную картину продукта. Повторный отчёт это уже
   отметил; повторяю, потому что файл не поправлен.

---

## Вопросы владельцу

Ни один из них не заведён как работа — по каждому нет пункта в решениях владельца.

1. **Может ли chokepoint квоты жить в SQL-двери, а не в JS-порте?** Ветка перенесла замок и правило
   в `app.assert_org_patient_count_quota_available` (атомарность сохранена — `pg_advisory_xact_lock`
   берётся в той же транзакции, что и `INSERT`), но механический гейт репозитория требует
   `transactionQuotaPort.withinLock`. Либо гейт учит новый адрес, либо писатель возвращается в порт.
   Пока не решено — lint красный (F4).
2. **Должен ли гейт миграций ловить `ALTER … OWNER TO` и `REASSIGN OWNED BY`?** §1 запрещает «любое
   иное изменение прав»; смена владельца — оно. Ветка этих форм не использует, вопрос про правило.
3. **Что делать с общей DEV-базой при параллельных ветках?** Измерено (§2): reconcile из worktree на
   `feat` удаляет `SECURITY DEFINER`-двери соседней неприземлённой ветки, а её леджер продолжает
   отвечать «применено». Это воспроизводимая ловушка для любой следующей ветки с новыми дверями, а
   не разовая неудача этой.

---

## НЕ СДЕЛАНО

- **Ни одна находка не починена.** Ни `when` миграций, ни артефакт прав, ни lint, ни схема
  `bookingEngine.ts`, ни комментарий 0052 — это приёмка, а не правка; починка ведущим/исполнителем.
- **Живой сквозной прогон публичной записи на DEV не выполнялся** — физически невозможен (§2), путь
  падает раньше квоты и раньше контактов. Пункты 3 и 4 брифа закрыты тестом, не живым прогоном, и
  это названо в самих пунктах.
- **Полный `pnpm run ci` не гонялся.** Гонял точечно: lint вебаппа (красный, F4), `--check`
  генератора (красный, F3), `function-census` + `port-context-catalog` +
  `port-context-callsite-catalog` (39/39), `createVerifiedPublicBooking.unit` (4/4),
  `confirm/route.route` (3/3), `devDbProof` стен (1/4, F2), свой тест (8/8),
  `check-migration-privileges` + `--self-test` (зелёные). `typecheck` не гонял.
- **Поведение `revoke_public_booking_enrollment` (компенсация неудавшейся записи) живьём не
  проверял** — та же причина: функции нет в базе. Тело прочитано, тестом не покрыто ни автором, ни
  мной.
- **Почтовый и сессионный каналы подтверждения живьём не проверялись** ни этим проходом, ни
  прежними; проверено только, что значения проходят закрытый список двери и CHECK таблицы.
- **`bersoncarebot_test` в состоянии, пригодном для применения миграций** (водяной знак ниже всех
  трёх `when`) — но применять их я не пробовал: это изменение состояния TEST, а не аудит.
