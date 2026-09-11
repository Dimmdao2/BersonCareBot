# Независимый аудит `wt/cold-source` (`3cffbcd4c`) — отдельный бакет сырых загрузок (М7)

**Классификация: ВЗГЛЯД с живым прогоном.** Проверялось не «написан ли код», а в какой бакет физически
уезжают байты человека и откуда их потом читают. Живой прогон — DEV MinIO `fs.bersonservices.ru`,
настоящие бакеты `bersonservices-raw` / `bersonservices-private`, настоящий ffmpeg, настоящие
`prepareMediaUpload` / `presignPutUrl` / multipart / `processTranscodeJob` / `buildImageStandardRendition`.

Гейт — план владельца `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`, раздел **М7**, и
`docs/_TODO/VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` п. 5, и ТОЛЬКО они (AGENTS.md §24).

## Вердикт

| № | Требование владельца | Вердикт |
|---|---|---|
| 1 | Отдельный бакет `S3_RAW_BUCKET`, объявленный везде, где объявлен `S3_PRIVATE_BUCKET` | **PASS** |
| 2 | Ключ начинается с организации; в БД ровно то, что в бакете, без двух правд | **PASS с одной оговоркой** (см. F-6) |
| 3 | Загрузка пишет в сырой бакет: presign, multipart, видео пациента | **PASS** |
| 4 | Перекодировщики: исходник из сырого, вывод в бакет выдачи; оригинал картинки остаётся | **PASS** |
| 5 | Фолбэка нет нигде; отсутствие переменной — громкая ошибка конфигурации | **PASS по коду, FAIL по защите** (F-5, F-7) |
| 6 | Не сломано существующее | **FAIL — F-1, F-2, F-3, F-4** |

**Ветку в этом виде нельзя приземлять.** F-1 делает недостижимыми ВСЕ уже лежащие исходники
библиотеки в момент деплоя; F-2 открывает сырой бакет наружу ровно той дверью, которую М7 обязан был
закрыть; F-3 и F-4 означают, что удаление медиа и полная зачистка пользователя перестают удалять байты
и при этом рапортуют успех.

## Метод

Второй `next dev` не поднимался (AGENTS.md §1a — единственный Turbopack на `:5200` из основного дерева).
Живой прогон шёл в процессе через НАСТОЯЩИЕ модули с НАСТОЯЩИМ S3: временные vitest-хэрнессы
(`m7AuditLive*.unit.test.ts` в `apps/webapp` и `apps/media-worker`) звали `prepareMediaUpload`,
`presignPreparedUpload`, `beginPreparedMultipartUpload`, `processTranscodeJob`,
`buildImageStandardRendition`, `s3DeleteObject`, `s3AbortMultipartUpload`, `presignGetUrl` без моков
хранилища; фальшивым был только контрольный шов БД у воркера. Хэрнессы удалены,
`git status --porcelain` пуст. Состояние DEV MinIO восстановлено ровно как было:
`bersonservices-raw` — 0 объектов и 0 незавершённых загрузок, `bersonservices-private` — 5979 объектов.

Независимая сверка каждого утверждения — `mc` (отдельный клиент, не код приложения).

---

## Требование 1 — отдельный бакет, объявленный везде: PASS

`S3_RAW_BUCKET` заведён в обеих схемах env и обязателен в обеих:
`apps/webapp/src/config/env.ts:189` + `isS3MediaEnabled` (`env.ts:379`), `apps/media-worker/src/env.ts:51`
(`z.string().min(1)`).

Сверка «где объявлен `S3_PRIVATE_BUCKET` — там и `S3_RAW_BUCKET`» прогоном по всему дереву:

```
$ grep -rn "S3_PRIVATE_BUCKET" --include="*" . | grep -v node_modules | grep -v .next
```

Живых (не архивных, не отчётных) мест семь, и все семь закрыты: `apps/webapp/.env.example:86`,
`apps/webapp/src/config/env.ts`, `apps/media-worker/src/env.ts`, `apps/media-worker/src/main.ts:69`,
`deploy/HOST_DEPLOY_README.md:445,507,664`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md:151,154,166,263`,
`deploy/host/bootstrap-c4-test-env.mjs:74,96` (и `MEDIA_COPY_KEYS`, и `MEDIA_REQUIRED_KEYS`).

**`deploy/env/*.example` из брифа проверены поимённо и пропуском НЕ являются:** ни один из четырёх
(`.env.webapp.prod.example`, `.env.webapp.dev.example`, `webapp/.env.prod.example`,
`webapp/.env.dev.example`) не объявляет ни одной `S3_*` переменной вообще — `grep -n "S3_"` по каждому
пуст. `deploy/env/README.md:107` делегирует контракт media-worker прямо в `apps/media-worker/src/env.ts`,
который переменную требует.

Compose нового прода (`deploy/docker/docker-compose.yml:147,170`) берёт env у `media-worker` из
`${THERAPYSTO_ENV_DIR}/media-worker.prod` целиком, отдельных `S3_*` строк в compose нет ни у одной
службы — добавлять там нечего.

Живая проверка, что воркер без переменной НЕ СТАРТУЕТ:

```
$ node --experimental-strip-types /tmp/m7/envtest.mjs     # S3_PRIVATE_BUCKET задан, S3_RAW_BUCKET удалён
THROWS: [ | { | "expected": "string", | "code": "invalid_type", | "path": [ | "S3_RAW_BUCKET"
```

Операционное следствие, которое надо назвать вслух перед деплоем: на хосте в `webapp.prod` и
`media-worker.prod` переменной ещё нет, и это правильно приводит к отказу старта, а не к тихой работе.
Порядок для владельца: сначала строка в env-файлы, потом выкладка.

---

## Требование 2 — ключ начинается с организации: PASS

Живая загрузка настоящего файла через настоящую дверь (`prepareMediaUpload` → `presignPutUrl` → PUT):

```
PREPARED {"key":"11111111-2222-4333-8444-555555555555/media/b4a137e3-…/AUDIT-M7-photo.jpg",
          "bucket":"bersonservices-raw","target":"library","kind":"raw"}
PRESIGN_HOST_PATH /bersonservices-raw/11111111-…/media/b4a137e3-…/AUDIT-M7-photo.jpg
PUT_STATUS 200
```

Независимо, `mc`:

```
$ mc ls --recursive bcbdev/bersonservices-raw
[…] 2.2MiB 11111111-…/media/088ce707-…/AUDIT-M7-video.MOV
[…]  14KiB 11111111-…/media/b4a137e3-…/AUDIT-M7-photo.jpg
$ mc ls --recursive bcbdev/bersonservices-private/11111111-…/    # в горячем этого префикса нет
(пусто)
```

Папка верхнего уровня — организация, ровно как просил владелец («каждая папка — организация», объём
читается обходом бакета). В `media_files.s3_key` кладётся ровно эта строка: и презайн-дверь
(`mediaUploadAdapter.ts:108`), и прямая загрузка (`s3MediaStorage.ts:147`) строят ключ одним
`s3RawObjectKey` и пишут его же в строку. Двух правд про объект `s3_key` нет.

**Оговорка F-6 (ниже): для картинки строка после превью-воркера говорит `mime_type = image/webp`, а
объект по `s3_key` — исходный JPEG/HEIC.** Активного вреда сейчас нет (М6 отдаёт
`application/octet-stream`, библиотечная выдача не подставляет mime в подпись), но это ровно «две
правды», и канон, который эта же ветка написала, утверждает обратное.

Патент-цель не тронута, как и решено: `PREPARED_PATIENT {"key":"media/0a4049ec-…/AUDIT-M7-sub.mp4",
"bucket":"bersonservices-private","target":"patient","kind":"hot"}`.

---

## Требование 3 — загрузка пишет в сырой бакет: PASS

Все пять дверей, зовущих `prepareMediaUpload`, получили `organizationId`
(`api/media/presign`, `api/media/multipart/init`, `api/patient/media/program-submission/presign`,
`api/doctor/patients/[userId]/files`, `api/doctor/treatment-program-instances/[instanceId]/media-presign`);
шестая дверь — прокси-загрузка `api/media/upload/route.ts:171` — идёт через `MediaStoragePort.upload`
→ `s3MediaStorage.ts:147`, тоже на сыром ключе.

Multipart проверен живьём целиком (create → presign part → PUT → complete):

```
PREPARED_MP {"key":"11111111-…/media/088ce707-…/AUDIT-M7-video.MOV","bucket":"bersonservices-raw","kind":"raw"}
PART_PUT_STATUS 200
```

Присланное пациентом видео: `storageTargetFor` (`mediaUploadAdapter.ts:78`) отправляет
`patient-program-submission` в `patient`, а `sourceStorageKindFor` даёт ему `hot` — то есть пациентский
путь не тронут вовсе, как и записано в решении.

---

## Требование 4 — перекодировщики: PASS

### Видео: исходник из сырого, лестница и постер в горячий

Настоящий `processTranscodeJob`, настоящий ffmpeg, настоящие бакеты, настоящий 640×480 MOV:

```
DONE_HLS masterKey=11111111-…/media/088ce707-…/hls/master.m3u8
         posterKey=11111111-…/media/088ce707-…/poster/poster.jpg
         qualities=[360p 416, 480p 480]  duration=27
```

`mc`, независимо:

```
=== HOT bucket, this media ===        === RAW bucket, this media ===
hls/360p/{index.m3u8,init.mp4,seg_000…003.m4s}   AUDIT-M7-video.MOV   ← 2.2MiB, цел
hls/480p/{…}  hls/master.m3u8  poster/poster.jpg
```

Ни одного байта лестницы в сыром бакете, ни одного байта исходника в горячем. Исходник после успеха
НЕ удалён (решение 11.09 для библиотеки).

### Картинка: рендишн в горячий, оригинал остаётся в сыром

Настоящий `buildImageStandardRendition` с настоящим sharp и настоящим S3:

```
RENDITION {"standardKey":"media/b4a137e3-…/standard.webp","mimeType":"image/webp","sizeBytes":7082,…}
STANDARD_IN_HOT= true    STANDARD_IN_RAW= false
$ mc ls bcbdev/bersonservices-raw/11111111-…/media/b4a137e3-…/
[…] 14KiB AUDIT-M7-photo.jpg      ← оригинал на месте
```

Удаление оригинала вырезано целиком: `s3DeleteObject` больше не импортируется в
`mediaPreviewWorker.ts`, `supersededOriginalKey` удалён из
`imageStandardRendition.ts`. `UPDATE` больше не трогает `s3_key` и `size_bytes`
(`mediaPreviewWorker.ts:325-340`) — то есть счётчик остаётся на размере ИСХОДНИКА, что и есть решение
владельца «хранить и считать только размер исходников».

### Присланное пациентом видео — удаление на месте и в правильном бакете

`processProgramSubmissionTranscode.ts:140-155` удаление сохранено, автор его не «починил» заодно.
Бакет верный: удаление идёт в `ctx.bucket`, а для `patient`-цели `storageFor` и `sourceStorageFor`
(`main.ts:73-76`) дают ОДНО И ТО ЖЕ хранилище — и при заданном `PATIENT_S3_BUCKET`, и без него.
Скачивание при этом переведено на `ctx.source` (строка 69), что для `patient` тот же объект.

---

## Требование 5 — фолбэка нет: PASS по коду, FAIL по защите

### Фолбэка действительно нет — доказано поломкой, а не чтением

Исходник перенесён из сырого бакета в горячий ПОД ТЕМ ЖЕ КЛЮЧОМ, наряд перезапущен:

```
$ mc cp bcbdev/bersonservices-raw/$K bcbdev/bersonservices-private/$K && mc rm bcbdev/bersonservices-raw/$K
ERR transcode unexpected error {"httpStatusCode":404,"name":"NoSuchKey"}
JOB_RETRY The specified key does not exist.
```

Воркер упал громко, хотя точный ключ лежал в горячем бакете. Тихого «не нашёл — возьму из горячего» нет.

### Но ЭТОТ запрет не защищён ничем — F-5

Инъекция ровно того фолбэка, который владелец запретил дословно, — одна строка в
`apps/webapp/src/infra/s3/client.ts:65`:

```diff
-    return kind === 'raw' ? { ...libraryHot, bucket: env.S3_RAW_BUCKET } : libraryHot;
+    return kind === 'raw' ? { ...libraryHot, bucket: env.S3_RAW_BUCKET || libraryHot.bucket } : libraryHot;
```

**139/139 тестов остались зелёными.** Такая же инъекция на стороне воркера (`main.ts:76`,
`sourceStorageFor` для `library` возвращает `library` вместо `raw`) — **114/114 зелёными**. То есть
единственное правило, которое владелец сформулировал категорически, не краснит ни один тест ни в
вебаппе, ни в воркере. Новый тест автора
(`processTranscodeJob.unit.test.ts:522` «исходник читается из сырого бакета») проверяет ФИКСТУРУ
собственного хэрнесса, а не `main.ts`: у `main.ts` тестов нет вовсе.

### Отсутствие переменной вне production — не громкая ошибка, F-7

В production `config/env.ts:424` бросает — PASS. Вне production (`NODE_ENV !== 'production'`, то есть
DEV и любой локальный прогон) отсутствие `S3_RAW_BUCKET` не бросает: `isS3MediaEnabled` просто
становится `false`, и всё медиа тихо уходит в режим «S3 не настроен» — загрузка отвечает `501
s3_not_configured` (`api/media/presign/route.ts:28`), выдача уходит в память/404. Это не фолбэк на
горячий бакет, поэтому буква требования не нарушена, но названо это должно быть: DEV-хост, где строку
в env забыли, после этой выкладки молча лишается всей медиа-подсистемы вместо сообщения о конфигурации.

---

## Требование 6 — не сломано существующее: FAIL

### F-1 (БЛОКЕР). Все уже лежащие исходники становятся недостижимыми в момент деплоя

`sourceStorageKindFor` (`apps/webapp/src/infra/s3/client.ts:98`) выводит бакет ИСКЛЮЧИТЕЛЬНО из
`storage_target` строки:

```ts
return target === 'library' ? 'raw' : 'hot';
```

Ни строка, ни ключ не несут факта «этот объект уже перенесён». Поэтому для КАЖДОЙ существующей
библиотечной строки — а её объект лежит в горячем бакете по старому ключу без организации — код
начинает ходить в сырой бакет, где его нет. Галочка плана «Перенос уже лежащих оригиналов в сырой
бакет» не отмечена, и бриф прямо требовал проверить, «что код не притворяется, будто их уже
перенесли». Притворяется.

Живой прогон на НАСТОЯЩЕМ существующем объекте DEV
(`media/13f59608-d609-4df2-88dd-bc3cd798e176/…MOV`, лежит в горячем с 22.05):

```
LEGACY row storage_target=library -> kind= raw  bucket= bersonservices-raw
LEGACY_PLAYBACK          status= 404  path= /bersonservices-raw/media/13f59608-…/…MOV
LEGACY_ORIGINAL_DOWNLOAD ok= false    reason= missing_object
SAME_OBJECT_IN_HOT       ok= true     len= 2349022     ← байты живы, просто в другом бакете
```

Масштаб на DEV, посчитан обходом бакета:

```
total под media/: 5570 · артефакты hls/poster: 5331 · standard.webp: 15
ИСХОДНИКОВ, которые становятся недостижимыми: 224
```

На проде это, по замеру 11.09 из плана метеринга, **20 660 403 695 B ≈ 19,24 ГиБ исходников
библиотеки** — все.

Что именно ломается у человека: `GET /api/media/[id]` (и «Скопировать URL» медиатеки, и progressive
fallback плеера) → 404; скачивание исходника М6 → 404; превью-воркер по непревьюшенной строке →
`s3_get_object_empty` и уход в backoff; наряд на пересборку видео → `NoSuchKey` и retry до отказа;
публичная карточка клиники (`[clinicSlug]/media/[mediaId]/route.ts:44`, где `kind` проставлен
явно) → её картинка пропадает. Уцелевают только: HLS-выдача (лестница читается из горячего по
`hls_master_playlist_s3_key`), постеры, превью-JPEG и картинки, у которых `standard_rendition_at`
уже проставлен — их `resolveDeliverableMediaObject` уводит на `media/<id>/standard.webp` в горячем.
На DEV это 15 объектов `standard.webp` против 224 исходников.

### F-2 (БЛОКЕР). Выдача НАУЧИЛАСЬ ходить в сырой бакет — это противоположно пункту плана

План владельца, М7, галочка вторая, дословно: «выдача (`authorizeMediaDelivery`, HLS-прокси) физически
не умеет туда ходить — из сырого бакета не выдаётся ничего, кроме явного скачивания исходника (М6)».
Именно на эту галочку М6-аудит 10.09 сослался, снимая свою: три старые двери отдают часовую
пересылаемую подпись на `s3_key`.

Реализовано обратное: `getMediaS3KeyForRedirect` (`s3MediaStorage.ts:1214`, возврат на `:1232`) теперь возвращает
`kind: 'raw'`, а `api/media/[id]/route.ts:31` честно передаёт его в `presignGetUrl`. То есть дверь,
которая раньше подписывала горячий бакет, теперь подписывает СЫРОЙ. Стены нет: в
`authorizeMediaDelivery.ts` нет ни слова про `StorageKind` — `playback` и `raw_original` различаются
только правом, не хранилищем.

Живой прогон ровно того, что делает `redirectPresignedOr503`:

```
TTL_SECONDS 3600
SIGNED_BUCKET_PATH /bersonservices-raw/11111111-…/media/088ce707-…/AUDIT-M7-video.MOV
ANON_FETCH status= 206  content-type= video/quicktime  bytes= "\0\0\0\x1cftypmp42"
```

Часовая пересылаемая подпись на сырой объект, настоящий mime, `206` и байты `ftypmp42` — БЕЗ единой
cookie. Это тот же вывод, к которому пришёл М6-аудит, только теперь он указывает в бакет, который
по замыслу владельца («снаружи к нему доступа тоже нет») должен быть закрыт наглухо. Комментарий
автора в `[clinicSlug]/media/[mediaId]/route.ts:42` это признаёт вслух («рендишн-осведомлённость этой
двери следующий этап»), но галочка плана от этого закрытой не становится.

### F-3 (БЛОКЕР). Удаление медиа перестаёт удалять байты и рапортует успех

`purgePendingMediaDeleteBatch` (`s3MediaStorage.ts:1525`) зовёт `s3DeleteObject(key, claim.storageTarget)`
без `kind` — а дефолт `kind` у всех функций `infra/s3/client.ts` равен `'hot'`. В `keysToDelete`
(`collectS3KeysForMediaPurge:1443`) лежит и `row.s3_key`, который для `library` теперь в СЫРОМ бакете.
S3 `DeleteObject` по несуществующему ключу возвращает успех, поэтому шаг «удалить» проходит, строка БД
удаляется, воркер считает работу выполненной.

Живой прогон ровно того вызова:

```
PURGE_SIM raw_before= true  delete_threw=false  raw_after= true
```

Два соседних дефекта того же корня:
* `s3AbortMultipartUpload(session.s3Key, session.uploadId, claim.storageTarget)` (`:1491`) отменяет
  загрузку в ГОРЯЧЕМ бакете, пока она висит в сыром. Живьём: создана настоящая multipart-загрузка в
  raw, вызван штатный abort — `ABORT_IN_HOT threw= null`, а `mc ls --incomplete bcbdev/bersonservices-raw`
  показывает её на месте. Это ровно тот класс мусора, из-за которого разбирали 19,5 ГБ в счёте
  Selectel, и наш собственный джоб — единственное, что его убирает (lifecycle у Selectel не работает).
* `s3StandardImageKey(mediaId)` в `keysToDelete` НЕ попадает вовсе — `collectS3KeysForMediaPurge` про
  колонку `standard_rendition_at` не знает. До М7 рендишн лежал в `s3_key` и удалялся; теперь удалённая
  картинка навсегда остаётся в горячем бакете как `media/<id>/standard.webp`.

### F-4 (БЛОКЕР). Строгая зачистка пользователя тоже не удаляет и тоже рапортует успех

`strictPlatformUserPurge.ts:164` → `deleteS3ObjectsWithPerKeyResults(keys, target)` →
`s3DeleteObject(key, target)` (`client.ts:608`) — тот же дефолт `'hot'`. Ключи `media_files.s3_key`
для `library` живут в сыром. Каждый такой ключ вернётся `{ ok: true }`, `s3Failures` останется пустым,
и строгая зачистка — та, что существует ровно ради гарантии «файлов больше нет», — отчитается полной,
оставив загруженные человеком файлы в сыром бакете.

### F-4a. Установка иконки приложения ломается на первой же загрузке

`orgAppIconRenditions.ts:70` берёт источник через `getMediaS3KeyForRedirect` (который возвращает
`{key, target, kind}`) и роняет `kind` на пол:

```ts
const source = await s3GetPrivateObjectBuffer(object.key, object.target);
```

`brandingActions.ts:67` зовёт это СИНХРОННО сразу после загрузки, до того как превью-воркер успел
сделать рендишн, — значит `standard_rendition_at` ещё `null`, `getMediaS3KeyForRedirect` отдаёт сырой
ключ с `kind: 'raw'`, а чтение идёт в горячий. Врач получает `app_icon_source_unavailable` на каждой
попытке поставить иконку.

---

## Находки вне шести требований

### F-5, F-7 — см. требование 5 выше.

### F-6. Канон, который написала эта ветка, расходится с её же кодом

`docs/ARCHITECTURE/SECURITY_CANON.md` (новый абзац «Текущая модель (М7, 10-11.09.2026)») утверждает:
«UPDATE НЕ трогает `s3_key`/`size_bytes`/**`mime_type`** оригинала». Код
(`mediaPreviewWorker.ts:326`) `mime_type` трогает: `mime_type = ${outcome.mimeType}` → `image/webp`,
пока по `s3_key` лежит исходный JPEG/HEIC. Опасность конкретная: следующий этап прочтёт канон и
построит на «mime строки = mime объекта» что-нибудь, что отдаёт `s3_key` с mime из строки.

Тот же абзац и абзац-пометка выше называют сырой бакет «бакет, из которого код физически не умеет
отдавать» и «недостижим» — F-2 показывает живьём, что умеет и достижим. То же неверное утверждение
второй раз: `docs/ARCHITECTURE/SERVER CONVENTIONS.md:170` — «Из этого бакета не отдаётся НИЧЕГО, кроме
явного скачивания исходника специалистом». Отдаётся: `GET /api/media/[id]` подписывает его на час.

### F-8. Стена доверия к ключам артефактов расширена без единого теста

`packages/shared-contracts/src/hlsStorageLayout.ts` переписал три предиката
(`isCanonicalMediaRootForId`, `isTrustedHlsArtifactS3Key`, `isTrustedPosterS3Key`), разрешив ОДИН
произвольный ведущий сегмент. Он не сверяется с организацией строки — «произвольный» здесь буквально:

```
true   org-prefixed, the M7 shape      -> <orgId>/media/<id>/hls/master.m3u8
true   the patient-files namespace     -> patient-files/media/<id>/hls/master.m3u8
true   arbitrary junk as the prefix    -> ..%2f/media/<id>/hls/master.m3u8
false  two extra segments              -> a/b/media/<id>/hls/master.m3u8
```

Эксплуатации на сегодня не нашёл — `mediaId` в ключе всё равно обязан совпасть со строкой. Но это
стена, решающая, можно ли отдать наружу произвольный объект по `hls_master_playlist_s3_key` /
`poster_s3_key`, и **тестов у неё нет ни одного** — `grep` по всему дереву не находит ни одного теста,
который зовёт хоть один из трёх предикатов, ни до ветки, ни после.

---

## Поломки, не покрасившие НИЧЕГО (6 инъекций, откачены, md5 сверены)

| # | Что сломано | Красное |
|---|---|---|
| INJ1 | `client.ts:65` — сырой бакет откатывается на горячий, когда переменная пуста (**дословно запрещённый владельцем фолбэк**) | **0 из 139** |
| INJ4 | `main.ts:76` — воркер читает исходник из горячего вместо сырого (тот же фолбэк со стороны воркера) | **0 из 114** |
| INJ5 | `processProgramSubmissionTranscode.ts:140` — присланное пациентом видео НИКОГДА не удаляется (отмена решения владельца 11.09) | **0 из 114** |
| INJ6 | там же — удаление нацелено в `ctx.source` вместо `ctx.bucket` | **0 из 114** |
| INJ2 | `client.ts:99` — `sourceStorageKindFor` всегда `'hot'` (фича выключена целиком) | 1 из 139 |
| INJ3 | `client.ts:165` — из сырого ключа убрана папка организации (смысл М7 для владельца) | 1 из 139 |

INJ5 особенно стоит внимания: удаление присланного пациентом видео уже ломалось однажды и
чинилось коммитом `b1e1ad9d1` этой же волны — и после починки его по-прежнему не держит ни один тест.

md5 всех четырёх тронутых файлов сверены до и после, совпадают; `git status --porcelain` пуст.

## Гейты автора — перепроверены, зелёные

```
apps/media-worker: tsc --noEmit exit 0 · 15 файлов, 114/114
apps/webapp:       tsc --noEmit exit 0 · 19 файлов, 139/139 (src/infra/s3, src/app-layer/media,
                   mediaPreviewWorker.unit, src/modules/media, src/app/api/media)
```

Зелёные гейты здесь не значат ничего: ни одна из четырёх блокирующих находок не видна ни одному тесту.

## НЕ ПРОВЕРЕНО

* **Живой HTTP-прогон через дверь вебаппа с настоящей сессией.** AGENTS.md §1a разрешает ровно один
  `next dev` на `:5200` из основного дерева, и он занят кодом `feat`; второй сервер не поднимался.
  Все двери проверены в процессе вызовом настоящих модулей с настоящим S3, но не через HTTP-слой,
  сессию и RLS. Это остаётся на живую приёмку после landing.
* **`processMediaPreviewBatch` целиком (с транзакцией и UPDATE).** Прямого доступа к DEV-БД у аудитора
  нет (RLS требует подписанного org-контекста), поэтому картиночный путь доказан на уровне S3
  (`buildImageStandardRendition` с настоящими sharp и бакетами), а SQL-часть прочитана, но не
  исполнена.
* **`purgePendingMediaDeleteBatch` и `strictPlatformUserPurge` целиком.** F-3 и F-4 доказаны живым
  прогоном ровно тех S3-вызовов, которые они делают (`s3DeleteObject(key, target)`,
  `s3AbortMultipartUpload(key, uploadId, target)`), с настоящими объектами в настоящих бакетах, но не
  прогоном самих воркеров с БД.
* **Прод-Selectel.** Ни одна команда к проду не отправлялась; `saas-s3-cold` не трогался.
* **Полный CI.** Гонялись только media-worker целиком и затронутые наборы вебаппа.
* **Кросс-организационные и пациентские сессии, поведение `PATIENT_S3_BUCKET` в разделённом виде.**
  На DEV `PATIENT_S3_BUCKET` не задан, поэтому ветка «пациентское хранилище отдельное» проверена
  чтением кода, а не прогоном.
