# Ч2 — media delivery chokepoint: отчёт bounded worker

## Измерение и diff

- Исправленный baseline `71d0218a4`: 7 GET-поверхностей media delivery, 5 копий ACL-цепочки и один
  legacy public-URL fallback в `doctorIntakeDetailResponse.ts`. Число 21 — import census S3 facade,
  не число выдач человеку; «4 обхода» не является delivery-bypass census.
- Добавлена единая дверь `app-layer/media/authorizeMediaDelivery.ts`: organization-scoped access row →
  явный platform-LFK resolver только после miss → submission ACL. Её результат узкий:
  `allowed(row, allowPlatformBase)` / `not_found` / `forbidden`.
- Ровно пять HTTP handlers переведены на неё: base media, preview, playback, HLS и playback events.
  Их route-specific HTTP mapping, cache, 307 redirect, Range и HLS semantics не объединялись.
- `doctorIntakeDetailResponse.ts` больше не импортирует `@/infra/s3/client` и не выдаёт `s3PublicUrl`.
  Private S3 продолжает получать TTL presign; прежняя misconfigured семантика — пустой URL плюс runtime log.
- `scripts/check-media-delivery-chokepoint.mjs` подключён к `apps/webapp` lint: он запрещает прямой импорт
  трёх ACL primitives из route handlers и `@/infra/s3/client` из `modules/**`/`app/api/**`.

## Проверки

| Команда                                                                                                                                                                                                                                                                                        | Итог                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm --dir apps/webapp exec vitest run src/app-layer/media/authorizeMediaDelivery.unit.test.ts src/app-layer/media/resolveMediaPlaybackPayload.unit.test.ts 'src/app/api/media/[id]/mediaDeliveryChokepoint.route.test.ts' src/modules/online-intake/doctorIntakeDetailResponse.unit.test.ts` | PASS — 4 files, 12 tests                                                                    |
| `node scripts/check-media-delivery-chokepoint.mjs --self-test`                                                                                                                                                                                                                                 | PASS — green route; planted sixth-route bypass and module→infra S3 import each exit nonzero |
| `node scripts/check-media-delivery-chokepoint.mjs`                                                                                                                                                                                                                                             | PASS                                                                                        |
| `pnpm exec prettier --check <changed files>`                                                                                                                                                                                                                                                   | PASS                                                                                        |
| `pnpm --dir apps/webapp lint`                                                                                                                                                                                                                                                                  | PASS                                                                                        |
| `pnpm --dir apps/webapp typecheck`                                                                                                                                                                                                                                                             | PASS                                                                                        |
| `git diff --check -- <Ч2 paths>`                                                                                                                                                                                                                                                               | PASS                                                                                        |

## Поведение, удерживаемое проверками

- foreign/not-found access does not reach base-media S3 redirect; same-org row reaches the common door;
  submission uploader and doctor/admin pass, while another patient fails; platform base requires explicit resolver.
- Base MP4 remains private `307` with dynamic presign TTL; preview/playback/HLS/events do no downstream work
  before the common door; HLS-disabled remains `503`, and Range reaches the HLS proxy only after the door.
- An untrusted HLS key resolves to protected MP4 without S3 presign. Online-intake uses private TTL presign,
  while an absent private configuration emits no public URL.

## НЕ СДЕЛАНО

- Независимый blind audit и его acceptance остаются за оркестратором; поэтому Ч2 в плане намеренно не отмечен.
- Не утверждается DB/RLS/TEST runtime proof. `patient_files`, upload/multipart/cleanup/purge и media worker
  не включались в media_files delivery door.
- Commit `#1082` и чистое дерево не получились из-за внешнего состояния: Git не может создать
  `/home/dev/dev-projects/BersonCareBot/.git/worktrees/bcb-wt-ch2-media-delivery/index.lock`, потому что
  filesystem смонтирована `ro`. Полный `git diff --check` также блокируется предсуществующим `.env.example`
  special file (`unsupported file type`); scoped check Ч2-путей прошёл. Предсуществующие env-изменения не
  трогались и не должны войти в Ч2-коммит.
