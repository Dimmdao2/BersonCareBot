# Независимый re-audit systemic hosted-video preview — 28.08.2026

## Candidate

- Аудируемый HEAD: `eaf6fd59567f716383f5774b5f0b2e813014e189`.
- В истории присутствует обязательный fix `28555e17d`.
- HEAD — последний merge `feat/doctor-ui-rebuild` в эту ветку (`eaf6fd595`); родительская актуальная вершина
  `feat/doctor-ui-rebuild` — `9759fecf3`.
- Это короткий re-audit уже локализованных findings, не новый blind-audit и не product fix.

## Итоговый re-audit kill-set

Первичный kill-set и его red→green evidence сохранены в предыдущей редакции и owner-записи. Этот проход не
составляет новый список: повторно проверены только четыре исходных finding и обязательная миграционная граница из
brief.

| Исходный finding | Метод | Итог |
| --- | --- | --- |
| New hosted-cover DB write шёл новым raw-SQL/обходным путём. | Взгляд на diff и Drizzle write-path; `check-no-new-raw-sql`. | PASS: `enqueueHostedVideoCover` использует Drizzle transaction и `onConflictDoUpdate`; новый raw-SQL gate зелёный. Второй DB-путь не появился. |
| Orphan cover не входил в общий purge. | Взгляд на function/privileges/purge call и existing lifecycle test. | Поведение PASS: root ограниченно переводит только unreferenced cover в `pending_delete`; current exercise reference и immutable snapshot исключают строку. Но migration privilege artifact ниже делает общий verdict FAIL. |
| Doctor template list отбрасывал hosted-video до общей ladder. | Existing acceptance test для doctor list и assigned patient snapshot. | PASS: test подтверждает common `catalogMediaLadderLookup` и наш `/api/media/.../preview/sm` для обеих поверхностей. |
| Redirect отправлял запрос на forbidden origin до проверки. | Existing acceptance test и взгляд на fetch door/imports. | PASS: fetch идёт с `redirect: 'manual'`; test подтверждает отсутствие запроса к `169.254.169.254`. `hostedVideoThumbnail` импортирует только server worker; VK token берётся как restricted/redacted system setting и не логируется. |

Новая SECURITY DEFINER-функция визуально корректно объявлена: owner `app_seam_patient_lfk_media_owner`, context
`app_operational_media_worker`, purpose `media.hosted-cover.orphan-stage`, typed arg `integer`, bounded `1..50`,
relation surfaces для `media_files`, `lfk_exercise_media` и immutable `treatment_program_instance_stage_items`;
EXECUTE объявлен только для media worker. Миграция содержит owner/verify markers и не содержит `GRANT`, `REVOKE`
или `POLICY`.

## Команды и результаты

```bash
pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/hostedVideoThumbnailRedirect.acceptance.test.ts \
  src/shared/lib/hostedVideoThumbnail.unit.test.ts \
  src/infra/repos/pgTreatmentProgramHostedPreview.acceptance.test.ts \
  src/infra/repos/catalogMediaLadderLookup.unit.test.ts \
  src/infra/repos/mediaPreviewWorker.unit.test.ts \
  src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts
```

PASS — 6 файлов, 56 тестов.

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
node scripts/check-no-new-raw-sql.mjs
node scripts/check-migration-privileges.mjs
bash apps/webapp/scripts/check-drizzle-migration-order.sh
git diff --check feat/doctor-ui-rebuild..HEAD
```

PASS. Lint включает raw-SQL, infrastructure-boundary, migration-privileges/order и media-door gates. Diff к
текущему `feat/doctor-ui-rebuild` не затрагивает соседние doctor UI paths и не содержит whitespace errors.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

FAIL — оба committed generated privilege artifacts расходятся с `declaration.ts`: на строке 1130 вместо
`app.stage_orphan_hosted_video_covers_for_purge(integer)` остаётся
`app.start_current_patient_test_attempt(uuid,uuid)`.

Rollback-only DEV migration preflight и live/TEST worker proof намеренно не запускались аудитором: это отдельные
lead-owned gates, исключённые из isolated audit.

## Findings

1. **FAIL — generated privileges не синхронизированы с новой SECURITY DEFINER-функцией.**
   Достижимый сценарий: любой кандидат, проходящий обязательный generated-privileges reconcile/check, получает
   расхождение для обеих сред и останавливается до landing. Impact: миграция не проходит требуемый static
   privilege gate, а generated artifact не описывает новый EXECUTE surface media worker. Нарушено `AGENTS.md` §1
   «Перед приземлением миграции — разбор её прав»: новая функция должна быть полностью объявлена и приехать через
   privilege generator. Production code и generated artifacts этим аудитом не менялись.

Остальные четыре исходных product findings закрыты на текущем HEAD приведёнными targeted evidence; этот finding
не является повторным finding о raw SQL, orphan reachability, common ladder или SSRF redirect.

## Вердикт

Первичный независимый verdict: **FAIL.** Единственный finding — несинхронизированный generated privileges
artifact.

### Исправление единственного finding ведущим

Finding механический и полностью локализован, поэтому по `AGENTS.md` §24.6 отдельный новый blind-audit не
запускался. Ведущий выполнил штатную пересборку и точную побайтовую сверку:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --check
```

PASS — оба `privileges.*.sql` обновлены, все четыре managed artifacts совпадают с declaration побайтно.

Отдельный lead-owned migration gate также выполнен из точного candidate checkout:

```bash
bash deploy/host/migrate-dev.sh --preflight \
  --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

PASS — четыре pending migration скомпилированы под declared statement owners на именованной
`bcb_webapp_dev` и полностью откатились; DEV-данные и ledger не менялись.

Итог после исправления единственного finding: **PASS (independent findings + lead-verified mechanical
correction).** Отдельно остаётся только live/TEST media-worker proof после landing/deploy; здесь он не заявлен.
