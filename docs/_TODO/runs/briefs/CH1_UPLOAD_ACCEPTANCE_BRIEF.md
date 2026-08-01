# Ч1 — файл становится ready только через двухстадийную проверку

## Роль и authority

Ты bounded worker. Прочитай `AGENTS.md` по маршруту: §5, §7, §9, §10/§10a/§10b и §24; соседние
`modules/media/*.md`/contracts. Authority — `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч1. Только выданная
ветка; DB/server/DEV/TEST/PROD/deploy/push не трогать.

Источник оракула: Ч1 — «`ready` недостижим без validated received-object result, все шесть путей на двери,
structural gate с self-test запрещает седьмой обход». Контекстные политики сохраняются: generic CMS 3 GiB;
proxy 50 MiB из-за buffering; individual exercise — video subset; patient submission — image/video 250 MiB;
patient files — existing generic allowlist и фактический per-file cap.

## Человеческий разрыв

Врач может заявить `patient_files.sizeBytes=1`, загрузить существенно больший/неподдерживаемый объект и получить
готовую запись, которая занимает в квоте один байт. При сбое presign/PUT запись уже `ready`, UI трактует отсутствие
upload URL как успех. Generic и individual confirm проверяют лишь существование S3 object, а direct-to-S3 пути
доверяют клиентскому Content-Type: повреждённый/подменённый файл становится `ready` и ломает preview/transcode.

Точный актуальный intake census:

```bash
rg -l --glob 'route.ts' \
  'presignPutUrl|s3CreateMultipartUpload|request\.formData\(\)' \
  apps/webapp/src/app/api | sort
```

Шесть путей: `media/upload`, `media/presign`, `media/multipart/init`, doctor instance `media-presign`, patient
program-submission `presign`, doctor patient `files`.

## Не брать старую ветку целиком

`/home/dev/dev-projects/bcb-wt-testsuite2`, коммиты `58718d5a5`/`3e0de03df`, — только источник идей/готовых
route tests. Не cherry-pick: прежний `acceptUpload` оставил proxy route вне двери, принимал policy от caller,
допускал `as`-обходы и не проверял фактически сохранённый object; eslint denylist пропустил 19 из 22 audit probes
и не имел self-test. Сохрани полезное только если оно проходит требования ниже.

## Обязательный scope

1. Одна существующая область `modules/media`, без нового upload-domain/service/table:
   - intent validation: filename, declared MIME/size, именованный policy ID из закрытого registry;
   - received-object validation: exact length, stored Content-Type и magic/signature первых байтов;
   - текущий proxy magic-byte код переиспользовать/перенести, не копировать;
   - arbitrary `{allowedMime,maxBytes}` от route запрещён: policy выбирается известным ID.
2. Для direct-to-S3 использовать существующие HEAD и минимальный range/body read. Не скачивать 3 GiB ради сигнатуры.
3. Все шесть intake routes проходят intent-door. Proxy проходит received-door на буфере до acceptance. Generic,
   individual, multipart, patient submission и patient-files становятся `ready` только после received-door над
   реально сохранённым object.
4. `doctor/patients/[userId]/files` перевести с преждевременного `ready` на существующий
   `media_files.pending → confirm → ready` lifecycle. UI после успешного PUT обязан вызвать confirm; отсутствие
   presign/PUT/confirm не показывается как готовый файл и не считается использованной квотой. Переиспользуй
   существующие routes/ports, где это возможно; новый экран и новая таблица запрещены.
5. Acceptance/ready primitive принимает узкий branded result received-door. Route не может передать сырые
   `{mimeType,size}`. Дополнительно один AST/import gate с self-test запрещает:
   - прямой вызов ready/acceptance repository primitive вне единственного adapter;
   - storage write/presign/complete из route/server action в обход upload door, включая alias/relative/dynamic
     import и сырой S3 SDK;
   - новый seventh intake route без door marker/call.
   Не делать ratchet allowlist для существующих обходов: все шесть переводятся сейчас. Background preview,
   delete/purge и GET delivery не считать upload intake.
6. Сохрани все текущие auth/org/patient/entitlement gates и JSON/status semantics, кроме необходимых новых
   413/415/invalid-object отказов и исправления ложного успеха patient-files.

## Явно вне этого worker

Ч1б из плана: orphan cleanup при S3→DB failure, abandoned single-PUT pending/object и удаление object после
invalid patient confirm. Не маскировать эту отдельную commit/abort работу внутри Ч1, кроме минимального rollback,
без которого собственная новая confirm-ветка оставляет регрессию.

## Acceptance tests

Переиспользуй route tests; оракул не брать из старой реализации.

- patient-files unsupported MIME → 415, over cap → 413, без folder/DB/presign side effects;
- declared 1 byte + larger HEAD → reject; не ready и квота не обойдена;
- presign/PUT/confirm failure → UI не сообщает успех, запись не видна как ready;
- generic и individual confirm отвергают actual size/type mismatch;
- multipart сохраняет exact length/header/metadata checks и добавляет signature mismatch;
- patient submission отвергает signature mismatch; неиспользуемый `declaredSizeBytes` либо используется, либо
  удаляется из контракта осознанно;
- proxy сохраняет empty/MIME/size/magic behavior;
- wrong role/org/patient по-прежнему denied до storage;
- gate self-test: planted seventh route, direct ready primitive, relative/dynamic/SDK write каждый дают nonzero;
  чистое дерево зелёное.

## Проверки и сдача

Точные targeted route/unit commands; gate обычный + `--self-test`; `pnpm --dir apps/webapp typecheck`, targeted
lint/prettier, `git diff --check`. Один содержательный commit `#1082`, чистое дерево. Отчёт:
`docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_ACCEPTANCE_REPORT.md` с command-backed counts, lifecycle before/after,
red/green cases, gate self-test и `НЕ СДЕЛАНО`. Галочку Ч1 не ставить — после worker идёт независимый blind audit.
