# Ч2 — одна дверь доступа к media_files и удаление public-URL fallback

## Роль и authority

Ты bounded worker. Прочитай `AGENTS.md` по маршруту: §5, §7, §9, §10/§10a/§10b, §19 и §24; соседние module
docs для media/online-intake. Authority — `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч2. Работа только в
выданной ветке. DB/server/DEV/TEST/PROD/deploy/push не трогать.

Источник оракула: Ч2 — «Последствие обхода — выдача байтов без проверки принадлежности. Готово = единая дверь
выдачи + гейт на обход»; `AGENTS.md` §19 — «Режим доставки задаёт только `GET /api/media/[id]/playback` и
внутренняя логика fallback при сбое HLS».

## Исправленный замер и человеческий разрыв

Не реализуй старую арифметику «21 потребитель / 4 обхода» буквально. Read-only remeasure на `71d0218a4` доказал:

- 21 — все importers S3 facade, включая upload/multipart/cleanup/worker/purge; это не 21 выдача человеку;
- HTTP GET-поверхностей выдачи — 7;
- пять `/api/media/[id]/**` handler'ов копируют одну цепочку
  `getMediaAccessRow` + `resolvePlatformLfkMediaAccess` + `assertMediaPlaybackAccess`;
- текущего доказанного пути выдачи `media_files` без ACL нет, но шестую копию ничто не запрещает;
- `modules/online-intake/doctorIntakeDetailResponse.ts` при отсутствии private S3 может вернуть бессрочный
  `s3PublicUrl`, то есть проверивший маршрут превращает доступ в публичный URL без TTL.

Работа: сделать копирование ACL невозможным и убрать единственный достижимый public-URL fallback. Не оборачивать
background preview worker, storage adapter, purge, upload PUT и отдельный домен `patient_files` в media_files-door.

## Обязательный scope

1. Добавь один use-case/helper в существующее семейство `apps/webapp/src/app-layer/media/**`, который получает
   org-scoped media row, применяет platform-LFK exception и `assertMediaPlaybackAccess`, и возвращает узкий typed
   результат. Session/principal и route-specific HTTP mapping остаются тонкими снаружи.
2. Переведи ровно пять handler'ов:
   - `app/api/media/[id]/route.ts`;
   - `preview/[size]/route.ts`;
   - `playback/route.ts`;
   - `hls/[[...path]]/route.ts`;
   - `playback/events/route.ts`.
   Сохрани существующие status-code/cache/range/HLS semantics; не унифицируй ответы ценой behavior change.
3. В `modules/online-intake/doctorIntakeDetailResponse.ts` удали direct infra import и `s3PublicUrl` fallback.
   Private S3 → TTL presign; иначе явный `null`/существующая misconfigured semantics без публичного URL. Не
   перестраивай online-intake домен.
4. Один механический gate с self-test, например `scripts/check-media-delivery-chokepoint.mjs`, подключённый к
   существующему lint/CI path:
   - routes не импортируют напрямую три ACL primitives вне общей двери;
   - `modules/**` и `app/api/**` не импортируют `@/infra/s3/client`;
   - planted sixth-route bypass и planted module→infra S3 import дают nonzero;
   - не делать allowlist новых обходов и не сканировать background/storage/delete paths как HTTP ACL.
5. Тем же коммитом исправь строку Ч2 плана: фактический замер — 7 GET surfaces, 5 копий ACL, 1 legacy public URL;
   исходные 21/4 были import census, а не delivery-bypass census. Галочку не ставить до независимого аудита.

## Тесты

Переиспользуй существующие route tests. Добавь только недостающие behavior cases, если без них не удерживается
изменённое поведение:

- общая дверь: foreign-org/not-found не достигает S3; same-org достигает; submission uploader и doctor/admin
  допускаются, другой patient нет; platform base только через явный resolver;
- base MP4 сохраняет 307, private/no-cache, dynamic TTL и Range-preserving semantics;
- preview/playback/HLS работают только после общей двери; HLS-disabled 503 и untrusted artifact key не достигают S3;
- online-intake: private config presign; no private config не выдаёт public URL;
- `patient_files` list/detail не переписывать; их отдельную org/patient/file дверь только прогнать регрессией,
  если готовый targeted test существует.

Не писать source-text unit tests рядом с продуктом: механический запрет живёт в gate + self-test.

## Проверки и сдача

- точные targeted test commands;
- `node scripts/check-media-delivery-chokepoint.mjs --self-test` и обычный gate;
- `pnpm --dir apps/webapp typecheck`, релевантный lint/prettier, `git diff --check`;
- один содержательный commit `#1082`, чистое дерево;
- отчёт `docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_CHOKEPOINT_REPORT.md`: команды/counts, diff, behavior,
  self-test red/green, `НЕ СДЕЛАНО`.

Не заявлять, что все 21 S3 imports — delivery, что `patient_files` и `media_files` один ресурс, либо что RLS/TEST
доказаны.
