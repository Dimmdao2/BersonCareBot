# Ч2 — bounded fix: structural gate должен видеть любой HTTP route

## Роль, authority и oracle

Ты bounded worker. До действий прочитай `AGENTS.md` (§5, §7, §9, §10/§10a/§10b, §24),
`docs/ORCHESTRATION_BINDINGS.md`, `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч2,
`docs/_TODO/runs/briefs/CH2_MEDIA_DELIVERY_CHOKEPOINT_BRIEF.md` и
`docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_BLIND_AUDIT_REPORT.md` целиком. Работай только в выданной
ветке; DB/server/DEV/TEST/PROD/deploy/push запрещены.

Источник оракула: Ч2 — «Готово = одна дверь ACL для пяти handler'ов, structural gate с self-test и отсутствие
public-URL fallback». Владелец требует не оставлять рядом форточку: новый HTTP route не может выдать media object
через storage/repository primitives мимо `authorizeMediaDelivery`.

## Уже принято и не переписывается

Product `72cbfa172`, blind audit `9c5bdda54`, первый bounded fix `1e7a808f8` и report normalization
`3a3e94695` уже находятся в `wt/single-entry-integration`. Пять behavior routes, общий ACL door и удаление public
fallback приняты; их не менять. Семь ранее найденных import-form bypasses уже покрыты и должны остаться зелёными.

## Один достижимый остаток

Текущий graph начинается только из `/app/api/media/[id]/**` и `modules/media/**`. Поэтому planted authenticated
route под другим prefix, например `/app/api/files/[id]/route.ts`, может импортировать переименованный app-layer
helper, который вызывает `getMediaAccessRow` + `presignGetUrl` без `assertMediaPlaybackAccess`; оба действующих
gate проходят. Это та же выдача чужого submission внутри клиники, а не новый scope.

Исправь только существующий `scripts/check-media-delivery-chokepoint.mjs` и сохранённый gate oracle. Любой
`apps/webapp/src/app/api/**/route.ts` и любой `apps/webapp/src/modules/**` файл должны быть graph roots **только
для обнаружения достижимого delivery sink/bypass**. Не требуй `authorizeMediaDelivery` от маршрутов, которые
вообще не выдают media, и не блокируй upload/multipart, preview generation worker, delete/purge/storage
maintenance. Не добавляй второй scanner, allowlist, authorization service, route, table или product behavior.

## Acceptance — полный checkbox Ч2 для этого fix

- Пять существующих handlers по-прежнему используют одну дверь; product behavior не изменён.
- Новый saved fixture: route под другим API prefix → renamed helper → `getMediaAccessRow` + `presignGetUrl` без
  двери даёт nonzero; удаление fault восстанавливает green.
- Все семь предыдущих bypass fixtures дают nonzero; upload/background-delete и обычный unrelated route остаются
  green.
- `node scripts/check-media-delivery-chokepoint.mjs --self-test` и обычный gate PASS.
- `apps/webapp/src/app-layer/media/mediaDeliveryChokepointGate.unit.test.ts` PASS без expected-red.
- Четыре Ch2 behavior suites остаются green; typecheck, targeted ESLint и scoped `git diff --check` green.
- В audit report добавить одну bounded-fix секцию с exact командами и `killed/missed`; первоначальный FAIL и
  предыдущий fix evidence не переписывать. Чекбокс Ч2 пока не закрывать — closure делает lead.

Один содержательный commit с `#1082`, чистое дерево. Самоотчёт не является аудитом; после коммита lead лично
повторит этот сохранённый oracle. Новый blind-pass по уже известному классу не нужен.
