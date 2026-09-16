# Аудит `wt/delivery-metering` (`ebb5c1dca`) — счётчик отданных HLS-байт и битрейт исходника

Тип: **ВЗГЛЯД с живым прогоном** (тесты вторичны). План владельца, против которого гейт:
[`docs/_TODO/VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md`](../_TODO/VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md),
пункт 3 чек-листа. Канон: `AGENTS.md` §24 — аудит гейт, не генератор скоупа.

Живой прогон шёл против **реального DEV S3** (`bersonservices-private`) и реальной DEV-базы
(`bcb_webapp_dev`, rollback-only preflight). Инъекции в код автора сделаны и откачены, md5 сверены.

---

## Вердикт по требованиям

| # | Требование владельца | Вердикт |
|---|---|---|
| 1 | Счётчик отданных байт по (сутки, организация, пациент, видео, качество) | **FAIL** — цифра считается верно, но на TEST/PROD она физически не доезжает до таблицы: нет host-артефакта расписания, собственный deploy-гейт репозитория отказывает, шаг CI `test:scripts` красный |
| 2 | Счётчик не имеет права мешать выдаче | **PASS** — доказано живьём тремя инъекциями отказа: сегмент уходит байт-в-байт |
| 3 | Колонка битрейта исходника на `media_files`, заполняется при успешном транскоде | **PASS** — цепочка замкнута, привилегии не расширены, живой preflight PASS |

---

## Требование 1 — FAIL

### 1.1 Что работает: формула байт верна, проверено на живом S3 (не на моке)

Тесты автора мокают S3 целиком, поэтому они доказывают только «код берёт поле `contentLength`».
Прогнал настоящий `handleHlsDeliveryProxyRequest` против настоящего объекта в DEV-бакете, слил тело
ответа и сравнил три числа: заголовок `Content-Length`, фактически слитые байты, записанное счётчиком.

```
FULL:         status=200 CL=952784 delivered=952784 objectSize=952784 recorded=952784 quality=480p
RANGE-CLOSED: status=206 CL=100000 CR=bytes 0-99999/952784  delivered=100000 recorded=100000
RANGE-OPEN:   status=206 CL=52784  CR=bytes 900000-952783/952784 delivered=52784 recorded=52784
MASTER:       status=200 bodyBytes=229 recorded=229 quality=master
VARIANT:      status=200 bodyBytes=199 recorded=199 quality=480p
MISSING:      status=404 rows=0
```

Утверждение автора подтверждается: на 206 записывается длина **отданного диапазона**, а не размер
объекта (100000 против 952784). Ошибочные ответы (404) не пишут ничего — `finishError` возвращает
раньше точки учёта. Разметка качества из пути тоже совпала с реальной раскладкой воркера
(`media/<id>/hls/480p/seg_000.ts`, `media/<id>/hls/master.m3u8`).

### 1.2 БЛОКЕР: расписания сброса не существует — байты никогда не попадут в таблицу

`backgroundJobManifest.ts:319` объявляет задание `media_delivery_bytes_flush` с
`scheduleOwner: 'host_cron'`, `environments: ['prod','test']`, `required: true`. Соответствующих
host-артефактов в `deploy/host/cron.d/` **нет** — ни prod, ни test. Собственный гейт репозитория:

```
$ node deploy/host/background-jobs-cli.mjs --check
background-jobs-cli --check: manifest и host artifacts разошлись
  • нет обязательного artifact deploy/host/cron.d/bersoncarebot-media-delivery-bytes-flush.cron.template (задание media_delivery_bytes_flush, среда prod)
  • нет обязательного artifact deploy/host/cron.d/bersoncarebot-test-media-delivery-bytes-flush.cron.template (задание media_delivery_bytes_flush, среда test)
EXIT=1
```

На родительском коммите тот же гейт зелёный — регрессию вносит именно `ebb5c1dca`:

```
$ (git archive ebb5c1dca^ | tar -x -C $T && cd $T && node deploy/host/background-jobs-cli.mjs --check)
background-jobs-cli --check: OK (24 artifacts из ...backgroundJobManifest.ts)
PARENT EXIT=0
```

Чем это грозит. Этот `--check` — **гейт деплоя**, он стоит в `deploy/host/deploy-test.sh:423`,
`deploy/host/deploy-prod.sh:198` и `deploy/host/deploy-webapp-prod.sh:140`: ветку в нынешнем виде
**нельзя выкатить** — деплой оборвётся. А если артефакт дописать руками мимо `--write`, то без
установленной строки `/etc/cron.d` сброса не происходит вообще: посчитанные байты живут только в
памяти процесса и умирают при каждом рестарте. Требование 1 в этом виде не даёт владельцу ни одной
строки данных.

Тот же гейт — шаг CI. `pnpm test:scripts` (фаза 2 `scripts/ci-steps.mjs`) красный:

```
$ pnpm test:scripts
# tests 125   # pass 124   # fail 1
not ok 1 - поставляемые artifacts совпадают с manifest (иначе host получает вчерашнее расписание)
```

Полный CI на ветке, соответственно, не зелёный. В сообщении коммита это не отражено: там названы
«Generator --check/--census green» — это гейт **привилегий**, другой инструмент.

Исправление механическое: `node deploy/host/background-jobs-cli.mjs --write` + коммит двух
сгенерированных шаблонов. Пункт плана есть (п. 3), значит это работа, а не вопрос владельцу.

### 1.3 Потолок 9362 строк, за которым сброс ломается навсегда

`hlsDeliveryByteMeterFlush.ts:21-46` пишет **весь** батч одним `INSERT ... VALUES` без нарезки.
Замерил, сколько bind-параметров реально порождает этот запрос:

```
rows=1000  OK params=7000
rows=9362  OK params=65534  exceedsPgBindLimit=false
rows=9363  OK params=65541  exceedsPgBindLimit=true      ← предел PostgreSQL 65535
rows=20000 THROWS RangeError: Maximum call stack size exceeded   ← drizzle падает ещё до БД
```

7 параметров на строку. С 9363 ключей запрос отвергает PostgreSQL, с ~20000 — падает сам drizzle.
Ключевое: обработчик отказа (`hlsDeliveryByteMeterFlush.ts:75-79`) **возвращает батч обратно в
буфер**. Значит, перевалив 9362 ключа, тик падает, всё возвращается, на следующем тике ключей
столько же или больше — и так навсегда. Буфер после этого не осушить ничем, кроме рестарта процесса,
который стирает все накопленные байты.

Достижимость прямо следует из §1.2: расписания нет, буфер копится сутками. При сегодняшнем масштабе
прода (замер плана: 926 открытий, 26 пользователей, 78 видео в августе) это недели-месяцы; при
негативном сценарии самого плана (100 врачей, 4216 открытий на врача в месяц) ключей на сутки
десятки тысяч — потолок пробивается в первый же день, если сброс хоть ненадолго встанет.

Память как таковая не страшна — замерил 5000 ключей → +4347 КБ кучи (~890 Б на ключ), 9362 ключа
это ~8 МБ. Опасен не объём, а то, что механизм осушения за этой чертой мёртв по построению.

Пространство ключей ограничено реальностью, не клиентом: строка появляется только на успешном
ответе, а он требует существующего объекта в бакете и пройденной авторизации, поэтому произвольных
`quality`/`media` пациент в буфер не занесёт.

### 1.4 Повторная запись после «неудачного» тика удваивает байты

Сброс аддитивен (`bytes_total = bytes_total + excluded.bytes_total`) — проверил сгенерированный SQL,
он корректен и цель `ON CONFLICT` совпадает с уникальным индексом один в один:

```sql
insert into "media_playback_delivery_daily" (...) values ($1..$7)
on conflict ("bucket_date","organization_id","user_id","media_id","quality")
do update set "request_count" = "media_playback_delivery_daily"."request_count" + excluded.request_count,
              "bytes_total"   = "media_playback_delivery_daily"."bytes_total"   + excluded.bytes_total
```

Но аддитивный upsert **не идемпотентен**, а `flushHlsDeliveryByteMeterBestEffort` возвращает батч в
буфер по любой ошибке. Классический случай — statement timeout или обрыв соединения **после** того,
как сервер закоммитил: клиент видит ошибку, строки уезжают в requeue и на следующем тике
прибавляются второй раз. Цифра в отчёте владельца оказывается выше реальной, и понять это по самой
таблице невозможно. Ни тест, ни комментарий этот размен не называют — в доке
(`hlsDeliveryByteMeterFlush.ts:55-57`) requeue подан только как защита от потери.

### 1.5 Оборванная загрузка засчитывается целиком

`hlsDeliveryProxy.ts:316-322` пишет `streamed.contentLength` **до** того, как тело начнёт течь
(`bindHlsProxyStreamToClientAbort` вызывается строкой ниже, 324). Если плеер отвалился, записан весь
сегмент, а ушла его часть. Два живых замера:

```
ABORT:     status=200 reallyRead=3445 objectSize=952784 recorded=952784   ← оборвал после первого чанка
PRE-ABORT: status=200 CLheader=952784 actuallyDelivered=0 recorded=952784 ← клиент отвалился до тела
```

При этом `bindHlsProxyStreamToClientAbort` честно отменяет чтение из S3 (`upstream.cancel`, строки
10-16 и 21-27), то есть ни пациент, ни счёт Selectel этих байт не видят — видит их только наша
таблица. Плеер обрывает сегмент штатно: при смене ступени, при перемотке, при закрытии страницы.

Чем это грозит счёту и человеку. Для «себестоимости» перекос умеренный (обычно один сегмент на
просмотр, ~4% при среднем ролике). Для второй заявленной цели пункта 3 плана — **досматриваемости**
(«отданные байты против сколько было бы при полном просмотре») — перекос систематический и
направленный: он двигает метрику к 100% и прячет ровно тот сигнал, ради которого её заводят.
Сильнее всего врут пациенты группы D из замера плана (1-9 открытий: открыл и закрыл) — у них
записывается почти полный сегмент каждой ступени, которую плеер успел пощупать.

⚠️ Оговорка по скоупу, решение за владельцем: в самом плане критерий приёмки пункта 3 записан как
«сходимость суммы байт с размерами сегментов в бакете» — это как раз то, что даёт нынешний подсчёт
по `Content-Length`. Брифом этого аудита требуется «длина ОТДАННОГО». Это расхождение двух
формулировок, а не самовольный скоуп: **вопрос владельцу — что считаем, обещанные байты или
фактически ушедшие.**

### 1.6 Разрез «по каждому видео» — на месте

Ключ `(bucket_date, organization_id, user_id, media_id, quality)` с уникальным индексом и отдельным
индексом `idx_media_playback_delivery_daily_media_bucket (media_id, bucket_date DESC)` —
подчёркнутое владельцем «статистика по каждому видео» закрыто. Ступень берётся из пути сегмента,
а не из БД, что и даёт реальную выданную ступень, а не предполагаемую.

### 1.7 Сутки считаются в UTC

`hlsDeliveryByteMeter.ts:41-43` — `utcDayBucket` режет по UTC, колонка `bucket_date` типа `date`.
Владелец в MSK (UTC+3), поэтому три часа каждых московских суток (00:00-03:00) попадают в
предыдущую строку таблицы. На месячных суммах не видно, на посуточном разрезе — 12,5% смещения.
Соседняя `media_playback_stats_hourly` хранит `bucket_hour timestamptz` и от часового пояса не
зависит, здесь же часовой пояс зашит. **Вопрос владельцу:** сутки московские или UTC — в плане
часовой пояс не задан.

---

## Требование 2 — PASS

Три инъекции отказа прямо в код автора, каждая — живой прогон настоящего прокси против настоящего
S3, с проверкой длины реально отданного тела:

| Что уронил | Где | FULL 200 | RANGE 206 | Плейлист |
|---|---|---|---|---|
| ничего (контроль) | — | 200, 952784 Б | 206, 10000 Б | 200, 199 Б |
| бросок в счётчике **вне** его собственного try | `hlsDeliveryByteMeter.ts:57` | 200, 952784 Б | 206, 10000 Б | 200, 199 Б |
| бросок в вычислении ключа | `hlsDeliveryByteMeter.ts:34` `meterKey` | 200, 952784 Б | 206, 10000 Б | 200, 199 Б |
| бросок в разборе качества из пути | `hlsProxyPath.ts:56` `hlsArtifactQualityFromPath` | 200, 952784 Б | 206, 10000 Б | 200, 199 Б |

Байты уходят человеку в полном объёме во всех случаях. Работает та самая заплатка, которую автор сам
нашёл: `recordHlsDeliveryBytesSafely` (`hlsDeliveryProxy.ts:37-43`) оборачивает **весь** вызов вместе
с вычислением аргументов, а не только тело `recordHlsDeliveryBytes`.

Структурно свойство тоже держится, и это важнее теста: `hlsDeliveryProxy.ts` тянет из учёта ровно
один модуль (`hlsDeliveryByteMeter`), а тот импортирует только логгер — **на тракте выдачи нет ни
одного импорта БД**. Сама запись синхронная, без I/O, одна операция над `Map` (O(1)), поэтому
«замедлить» ей тоже нечем. Отказ БД живёт в отдельном маршруте обслуживания и до запроса за
сегментом дотянуться не может по построению.

Единственная теоретическая щель: если бросит сам `logger.error` внутри catch'а
`recordHlsDeliveryBytesSafely`, исключение уйдёт наружу и внешний обработчик превратит ответ в 502.
Для pino это не сценарий из жизни; называю для полноты, работой не считаю.

---

## Требование 3 — PASS

Цепочка замкнута целиком, проверил по всем звеньям:

1. воркер меряет: `apps/media-worker/src/processTranscodeJob.ts:563` (`sourceProbe.bitrateBps`) →
   отправляет в `doneHls` (`:715`);
2. маршрут принимает: `api/internal/media-worker/control/route.ts:27` — zod-поле
   `sourceBitrateBps` (int, >= 0, <= 2147483647, nullable, optional);
3. репозиторий пробрасывает: `pgMediaWorkerControl.ts:200-202`, отсутствие значения = поле не
   попадает в payload;
4. дверь БД пишет: ветка `done_hls` функции `app.record_media_transcode_job_outcome` через
   `COALESCE` — старое значение не затирается, `NULL` штатен;
5. колонка: `media_files.source_bitrate_bps integer` + `CHECK (IS NULL OR >= 0)` + COMMENT.

Живой rollback-only preflight против именованной DEV воспроизвёл заявление автора — утверждение
проверено, а не принято на слово:

```
$ bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
...CREATE FUNCTION ... ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=174 ...
migrate-dev preflight: PASS
EXIT=0
```

---

## Права БД — расширения доступа нет

Сгенерированные артефакты разошлись с родителем на 521/485 строк, и это выглядит пугающе. Разобрал:
это **сплошная перенумерация политик** (вставка новой таблицы в упорядоченный список сдвигает
суффиксы `rev10_*_111` на `_112` и далее). Сравнение с нормализованными номерами оставляет ровно
27 строк, и все они — блок самой новой таблицы:

```
$ git show ebb5c1dca^:<файл> | sed -E 's/"(rev10_[a-z_]+)_[0-9]+"/"\1_N"/g' | sort > old
$ git show ebb5c1dca:<файл>  | sed -E 's/.../' | sort > new
$ diff old new | grep -v 'delivery_daily|source_bitrate' | wc -l   → 27, все про новую таблицу
```

- `media_playback_delivery_daily`: `ENABLE` + `FORCE ROW LEVEL SECURITY`, `REVOKE ALL FROM PUBLIC` и
  от всех прочих ролей, `GRANT SELECT,INSERT,UPDATE,DELETE` **только** `app_operational_maintenance`,
  плюс RESTRICTIVE `rev10_context_gate_*` и PERMISSIVE-политика с тем же
  `current_user = 'app_operational_maintenance'`. Ни `app_staff`, ни `app_patient` доступа не имеют.
  INSERT/UPDATE, которых нет у соседних телеметрийных таблиц, обоснованы: у этой таблицы вообще нет
  писателя на запрос, пишет только обслуживающий job.
- Блок `DO $bcb$ ... GRANT USAGE, SELECT ON SEQUENCE` ограничен
  `WHERE d.refobjid = 'public.media_playback_delivery_daily'::regclass` — чужих последовательностей
  не касается, а у новой таблицы их и нет (serial-колонок нет).
- `source_bitrate_bps` в грантах `media_files` ничего не расширил. Проверил механически: вырезал имя
  колонки из всех GRANT-строк `media_files` в обеих версиях по всем трём базам — файлы совпали
  побайтно. Колонка добавлена ровно в три места: SELECT и UPDATE для
  `app_seam_patient_lfk_media_owner` (нужны definer-функции) и INSERT для `app_staff`.
- `node deploy/postgres/privileges/generate-cli.mjs --check` → артефакты соответствуют декларации
  побайтно, все три базы.

---

## Четвёртая таблица телеметрии — обоснование проверено на фактах, а не на слово

| | `media_playback_stats_hourly` | `media_playback_delivery_daily` |
|---|---|---|
| Ключ | `(organization_id, bucket_hour, delivery)` — `schema.ts:2159-2163` | `(bucket_date, organization_id, user_id, media_id, quality)` |
| `delivery` | `CHECK IN ('hls','mp4','file')` — вид доставки, не качество | `quality` — метка ступени из пути |
| Метрика | `resolved_count` — счётчик резолвов | `request_count` + `bytes_total` |
| Ретенция | 90 дней (`PLAYBACK_HOURLY_STATS_RETENTION_DAYS`) | 400 дней (`MEDIA_PLAYBACK_DELIVERY_DAILY_RETENTION_DAYS`) |

Грейн, метрика и ретенция разные — свести одним параметром действительно нельзя, обоснование автора
подтверждается. Ретенция подключена в ту же транзакцию purge, что и три соседа, без второго
планировщика (`playbackHourlyRetention.ts`), и удаляет напрямую, как уже делают три соседние таблицы
под той же maintenance-политикой.

⚠️ План говорит «суточная таблица весит копейки и **может жить вечно** — она же и закрывает отчёт
врачу „как пациент занимался за год“». Автор поставил 400 дней. Год отчёт закрывает, «вечно» — нет.
**Вопрос владельцу**, не работа.

---

## Что краснеет, а что нет

Тесты автора реагируют на все три инъекции: `meter` → 9 падений, `key` → 7, `quality` → 6.

**Поломка, не покрасившая ничего.** Заменил аддитивный upsert на перезапись
(`excluded.bytes_total` вместо `... + excluded.bytes_total`) — это стирало бы накопленные за сутки
байты на каждом тике, оставляя в таблице только последние пять минут:

```
=== author tests with OVERWRITE-instead-of-ADD upsert ===
 Test Files  3 passed (3)
      Tests  11 passed (11)
```

Причина: `hlsDeliveryByteMeterFlush.unit.test.ts` мокает drizzle целиком (`getDrizzle: () => fakes.db`),
поэтому форма записи в БД не проверяется ничем — ни аддитивность, ни совпадение цели `ON CONFLICT`
с уникальным индексом. Я проверил и то и другое отдельно через `toSQL()` (см. §1.4), результат
корректный — но это держится на вычитке, а не на гейте.

Ещё не покрыто тестами: размер батча (§1.3), двойной счёт после requeue (§1.4), пересчёт при обрыве
клиента (§1.5), часовой пояс суток (§1.7).

---

## Побочное

- **`hlsDeliveryByteMeter.ts` git считает бинарным файлом.** В нём один нулевой байт (смещение 1654,
  строка 36) — разделитель ключа в `meterKey`. Из-за него `git show`/`git diff`/PR выдают
  `Bin 0 -> 4408 bytes` вместо кода: файл, несущий всю логику счётчика, не виден ни в одном ревью
  диффа. Разделитель как таковой корректен; дёшево заменить на печатный (например `|` с
  экранированием) и вернуть файл в читаемые.
- **`check-new-table-rls-coverage` не знает новой таблицы.** Гейт был красным и до коммита
  (`lfk_exercise_load_types` из другой ветки), но коммит добавляет вторую позицию:
  `missing RLS descriptor/classification: public.lfk_exercise_load_types, public.media_playback_delivery_daily`.
  Фактическая RLS у таблицы есть (`FORCE`, политики), не хватает записи в descriptor-модели
  `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs`. В цепочку CI этот гейт не входит.
- **`deploy/HOST_DEPLOY_README.md` не тронут** — новый внутренний маршрут
  `POST /api/internal/media-delivery-bytes/flush` не попал в перечисление эндпоинтов
  `INTERNAL_JOB_SECRET` (строка 646) и в раздел про playback-телеметрию (строка 451). Пара к §1.2.
- **Пациент, числящийся в двух клиниках, не считается вообще.** `recordHlsDeliveryBytes` выходит
  при пустом `organizationId` (`hlsDeliveryByteMeter.ts:66`), а `getCurrentDbPrincipalOrganizationId`
  для пациента отдаёт организацию только если она уже выбрана. На маршруте HLS
  (`api/media/[id]/hls/[[...path]]/route.ts:29`) `getCurrentSession()` зовётся без подсказки, и
  `resolveActiveOrganizationForPatient` при нескольких активных зачислениях без запомненного выбора
  возвращает `organization_selection_required` — байты такого пациента молча пропадают. Сегодня, при
  одной клинике, это ноль; при SaaS-масштабе, ради которого счётчик и заводится, — тихая дыра в
  счёте. Решение (писать ли `NULL`-организацию или считать иначе) в плане не описано — **вопрос
  владельцу**.
- Имя уникального индекса `media_playback_delivery_daily_org_user_media_quality_uidx` не упоминает
  `bucket_date`, хотя колонка в индексе первая. Косметика.

---

## НЕ ПРОВЕРЕНО

1. **Сброс против живой БД.** Миграция на DEV не применялась (только rollback-only preflight), а
   прямое чтение `bcb_webapp_dev` закрыто mTLS + RLS без порт-контекста. Поэтому не проверены
   вживую: реальный `INSERT`/`ON CONFLICT` под ролью `app_operational_maintenance`, прохождение
   RESTRICTIVE `require_accepted_context` на этом маршруте и фактическое удаление по ретенции.
   Вывод о правах сделан по сгенерированным артефактам и по симметрии с соседним
   `media-playback-stats/retention`, который работает сегодня, — это разбор, не живой прогон.
2. **Сутки живого DEV-трафика с суммированием по бакету** — автор сам вынес это в «НЕ СДЕЛАНО».
   Я не воспроизводил: работающего живого трафика на DEV нет, а единственный DEV-сервер на `:5200`
   занят другим чекаутом (`/home/dev/dev-projects/BersonCareBot`), забирать порт у соседней сессии
   не стал. Вместо этого — побайтная сверка на реальных объектах S3 (§1.1), которая доказывает
   формулу строже, чем суточная сумма.
3. **Полный CI целиком не гонялся.** Отдельно прогнаны: `pnpm test:scripts` (КРАСНЫЙ, 1/125),
   `pnpm --dir apps/webapp typecheck` (чисто), тесты автора (25/25 зелёные),
   `generate-cli.mjs --check` (зелёный), `background-jobs-cli --check` (КРАСНЫЙ),
   `check-new-table-rls-coverage` (красный, частично унаследованно). `lint`, `test`, `test:webapp`
   целиком, `build`, `audit` не запускались.
4. **Поведение при смене суток под нагрузкой** (ключи предыдущего UTC-дня в буфере одновременно с
   новыми) — разобрано по коду, живьём не воспроизводилось.
5. **Реальный плеер** (hls.js/Safari) на этот тракт не запускался: проверялись ответы прокси, а не
   поведение клиента, выбирающего ступень.

---

## Гигиена аудита

Все инъекции откачены, рабочее дерево чистое:

```
$ git status --porcelain     → пусто
$ md5sum -c /tmp/audit-md5-before.txt
apps/webapp/src/app-layer/media/hlsDeliveryByteMeter.ts: OK
apps/webapp/src/app-layer/media/hlsProxyPath.ts: OK
apps/webapp/src/app-layer/media/hlsDeliveryProxy.ts: OK
apps/webapp/src/app-layer/media/hlsDeliveryByteMeterFlush.ts: OK
```

Временные probe-файлы (`zzAudit*.unit.test.ts`) удалены. В DEV-базу ничего не записано: единственная
DB-команда — rollback-only preflight. В S3 только чтение (`ListObjectsV2`, `GetObject`).
