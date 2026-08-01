# Ч1 — upload acceptance report

## Фактический census

Команда до правки:

```bash
rg -l --glob 'route.ts' 'presignPutUrl|s3CreateMultipartUpload|request\.formData\(\)' apps/webapp/src/app/api | sort
```

дала 6 путей: `media/upload`, `media/presign`, `media/multipart/init`, doctor instance
`media-presign`, patient program-submission `presign`, doctor patient `files`.

После правки дверь на всех шести подтверждает команда:

```bash
rg -l --glob 'route.ts' 'prepareMediaUpload|validateBufferedMediaUpload' apps/webapp/src/app/api | sort | wc -l
```

Результат: `6`.

## Lifecycle

| Поток | До | После |
| --- | --- | --- |
| Proxy CMS | маршрут сам проверял magic и сразу создавал ready | intent `proxy` + shared received result на буфере |
| CMS / individual / submission | pending → HEAD exists → ready | pending → HEAD exact length/type + range prefix signature → branded received → ready |
| Multipart | metadata HEAD → ready | metadata HEAD + shared received result → ready |
| Patient files | `patient_files` + linked `media_files.ready` до PUT | pending, не list/quota; PUT → confirm received-door → atomic ready/quota |

## Red / green

- `uploadValidation.test.ts`: declared one byte / actual three bytes → `received_size_mismatch`; wrong stored type and bad signature → 415-class errors; patient submission PDF/over-cap rejected.
- Direct object checking reads HEAD plus `bytes=0-511`; it does not download a 3 GiB object.
- Patient-files client does not close/refresh as success without a URL, successful PUT, and successful confirm.

## Structural gate

```bash
node apps/webapp/scripts/check-media-upload-door.mjs
node apps/webapp/scripts/check-media-upload-door.mjs --self-test
```

Обычный gate зелёный. Self-test зелёный и доказывает красный исход для seventh intake, direct ready primitive, relative raw-storage import, dynamic raw-storage import и SDK import.

## Проверки

```bash
pnpm --filter @bersoncare/db-principal build
pnpm --filter @bersoncare/platform-merge build
pnpm --filter @bersoncare/operator-db-schema build
pnpm --filter @bersoncare/error-tracking build
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec vitest run --project fast src/modules/media/uploadValidation.test.ts
node apps/webapp/scripts/check-media-upload-door.mjs --self-test
node /home/dev/dev-projects/BersonCareBot/node_modules/prettier/bin/prettier.cjs --check <changed paths>
git diff --check
```

Все перечисленные выше команды зелёные на рабочем дереве после `pnpm install --offline --ignore-scripts`.

## НЕ СДЕЛАНО

- Независимый blind audit и owner acceptance Ч1; чекбокс плана намеренно не менялся.
- Ч1б cleanup: orphan после S3→DB failure, abandoned single-PUT и object cleanup после invalid confirm не входят в эту правку.
- Полноценные mocked route acceptance tests для всех шести route ещё не добавлены; старые тесты из `wt-testsuite2` используют отклонённый API `acceptUpload` и не перенесены как оракул.
