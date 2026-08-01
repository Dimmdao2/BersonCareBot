# Ч2 — bounded correction: S3 bypass из любого module root

Ты bounded worker. Прочитай `AGENTS.md` §5/§7/§9/§10/§24, Ч2 в
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, предыдущий blind report и commits `1e7a808f8`/`ea908c23e`.
Работай только в выданной ветке; DB/server/DEV/TEST/PROD/deploy/push и product handlers запрещены.

Источник оракула: Ч2 — «structural gate с self-test» для одной media ACL door; переименование URL-prefix или
module namespace не должно открыть выдачу S3 object без `authorizeMediaDelivery`.

## Один доказанный остаток

`ea908c23e` сделал все `modules/**` graph roots, но `inspectNode` запрещает direct infra S3/raw SDK только когда
сам файл удовлетворяет `isMediaModule(rel)` (`modules/media/**`). Поэтому временный файл
`apps/webapp/src/modules/online-intake/__ch2_delivery_probe.ts`, импортирующий `s3PublicUrl` из
`@/infra/s3/client`, дал `node scripts/check-media-delivery-chokepoint.mjs` → `gate_exit=0` примерно за 90s.
Файл удалён, дерево чистое. Alternate-prefix route fault уже убит и не переписывается.

Исправь только существующий scanner, saved gate oracle и append-only секцию audit report. Для любого достижимого
`modules/**` graph node direct infra S3/raw AWS SDK delivery должен быть запрещён так же, как для `modules/media`;
upload/multipart, preview worker, delete/purge и storage maintenance остаются negative controls. Не добавлять
allowlist, второй scanner, product route/service/table или новую дверь.

## Acceptance

- Permanent fixture `modules/online-intake/newDelivery.ts` → internal helper/direct `@/infra/s3/client` (или raw
  AWS SDK) даёт nonzero; removal возвращает green.
- Alternate-prefix route → renamed helper остаётся nonzero; все прежние 7 fixtures nonzero.
- Unrelated module/route и upload/background-delete controls green.
- Self-test, ordinary gate, saved unit, four unchanged behavior suites, typecheck, targeted ESLint, scoped
  diff-check green.
- Report называет итог нового двухсценарного closure: killed 2/2, missed 0; исходный blind FAIL не переписывать.

Один commit `#1082`, чистое дерево. Чекбокс Ч2 не закрывать; lead повторит оба saved faults. Новый blind audit не
нужен, это correction по уже доказанному классу.
