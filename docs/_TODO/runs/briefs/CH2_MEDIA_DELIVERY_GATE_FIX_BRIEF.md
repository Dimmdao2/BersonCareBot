# Ч2 — fix-round structural gate после независимого FAIL-аудита

## Роль, канон и oracle

Ты bounded worker. До действий прочитай `AGENTS.md` (§5, §7, §9, §10/§10a/§10b, §24),
`docs/ORCHESTRATION_BINDINGS.md`, Ч2 в плане и audit report. Authority —
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч2. Только выданная ветка; DB/server/DEV/TEST/PROD/deploy/push
не трогать.

Источник оракула: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч2 — «Готово = одна дверь ACL для пяти
handler'ов, structural gate с self-test и отсутствие public-URL fallback».

## Что уже принято и не переписывается

Продуктовый commit `72cbfa172` по behavior/scope корректен: пять handler'ов используют одну дверь, session/org/
patient gates и status/cache/range/playback semantics сохранены, online-intake public fallback удалён. Не менять
эту поверхность без красного acceptance. Fix-round только по G1 из
`docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_BLIND_AUDIT_REPORT.md`.

## Один MUST FIX

Существующий `check-media-delivery-chokepoint.mjs` ловит прямой named import, но пропускает семь достижимых
форм: dynamic import, namespace import, re-export shim, relative infra S3 import, raw AWS S3 SDK из route,
raw AWS S3 SDK из module и переименованный app-layer helper, который читает org row и presign-ит объект без
submission ACL. Последний сценарий отдаёт другому пациенту в той же клинике чужую submission.

Расширить один существующий gate, не строить второй scanner и не добавлять allowlist обходов. Анализ обязан
нормализовать alias/relative пути, import/export/dynamic/namespace формы и учитывать достижимый import graph от
HTTP route/module до delivery sink. Raw S3 read/presign/SDK delivery из route/module мимо общей двери запрещены.
Upload/multipart, preview generation worker, delete/purge и storage maintenance — отрицательные контроли, а не
delivery bypass; gate не должен их блокировать.

## Acceptance — тот же независимый kill-set

- Сохранённый красный oracle
  `apps/webapp/src/app-layer/media/mediaDeliveryChokepointGate.unit.test.ts` зеленеет: все семь bypass fixtures
  дают nonzero, upload/background-delete negative control остаётся green.
- `node scripts/check-media-delivery-chokepoint.mjs --self-test` доказывает red→green для всех обещанных форм,
  а обычный вызов зелёный.
- Четыре behavior suites аудитора остаются зелёными: 4 файла / 18 тестов; вместе с gate acceptance нет
  expected-red.
- Typecheck, targeted ESLint, scoped `git diff --check`; full lint честно может оставаться blocked только
  соседним tariff raw-SQL файлом, его не трогать.

Не добавлять новый authorization service, route, таблицу или media behavior. Обновить audit report секцией
fix-round с точными командами и killed/missed count. Один содержательный commit с `#1082`, чистое дерево;
галочку Ч2 не ставить — оркестратор повторяет acceptance и решает land.
