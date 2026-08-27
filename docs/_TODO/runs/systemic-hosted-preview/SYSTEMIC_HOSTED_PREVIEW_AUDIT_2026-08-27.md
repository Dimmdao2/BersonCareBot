# Независимый аудит systemic hosted-video preview — 27.08.2026

## Candidate

- Product candidate: `4e3a8a0b4` (обязан присутствовать в истории).
- Pre-audit base: `90a83bd84` (обязан присутствовать в истории).
- Аудируемый merged HEAD: `234f3e7c5ca1da721e0571027cca75bff47f7313`.
- Актуальный `feat/doctor-ui-rebuild`, включённый в HEAD: `0fa69f371f403ed5a91680ee2657067b12301f8b`.

## Слепой kill-set

Этот список зафиксирован по owner-authority и brief до чтения worker-authored тестов, production diff и раздела
worker fault injections.

| # | Named fault | Метод | Итог |
|---|---|---|---|
| 1 | Сохранение YouTube/VK hosted-video не создаёт или не переиспользует pending cover в той же транзакции. | Acceptance + fault injection | TBD |
| 2 | Две клиники с одной ссылкой получают одну общую строку либо внутри одной клиники создаётся дубль. | Acceptance + fault injection | TBD |
| 3 | Реальный разрешённый write-path hosted-video обходит enqueue. | Перепись write-path + acceptance/fault injection | TBD |
| 4 | Worker оставляет вечный pending, бесконечно ретраит или отмечает успех при ошибке fetch/S3/DB. | Acceptance + fault injection | TBD |
| 5 | Private/deleted/unsupported/нет VK token неверно разделены на terminal/retryable либо превращены в тихий успех. | Acceptance + fault injection | TBD |
| 6 | Redirect/origin/MIME/размер/таймаут допускают SSRF или произвольные/неограниченные байты; VK secret попадает в клиент/логи. | Взгляд + acceptance/fault injection | TBD |
| 7 | Provider thumbnail URL попадает в doctor/patient HTML/JSON вместо нашей `/api/media/.../preview/...`. | Acceptance + fault injection | TBD |
| 8 | Служебные cover rows видны в медиатеке врача. | Acceptance + fault injection | TBD |
| 9 | Удаление/замена последней ссылки оставляет бесконечно растущую служебную строку и S3-объекты без owner/retention/purge-пути. | Взгляд + acceptance при наличии публичного поведения | TBD |
| 10 | Hosted/local расходятся по state machine либо doctor/patient трактуют статус по-разному. | Acceptance + fault injection | TBD |
| 11 | Миграция ломает строки/права, содержит GRANT/POLICY, не имеет owner/verify, создаёт опасный индекс, расходится со schema/generated privileges или не проходит rollback-only preflight named DEV. | Статические гейты + sanctioned rollback-only preflight | TBD |
| 12 | Новая функциональность добавляет raw SQL, второй DB-проход или дублирующую дверь вопреки §5. | Взгляд + архитектурные гейты | TBD |
| 13 | Добавлены новая таблица, новый cron/worker или параллельный storage lifecycle вместо расширения существующих. | Взгляд + итоговая схема/manifest | TBD |
| 14 | Re-save failed cover не даёт осмысленный повтор, а ready cover скачивается заново. | Acceptance + fault injection | TBD |

## Команды и результаты

Первичный независимый прогон `systemic-hosted-preview-audit-2-20260827` завершился системным обрывом
после 31:51 и не оставил финальный verdict. Его сырой поток сохранён:

- `/home/dev/brain/runs/codex-raw/2026-08-27T22-00-01-304Z-systemic-hosted-preview-audit-2-20260827.jsonl`;
- `/tmp/systemic-hosted-preview-audit-2-20260827.log`.

До обрыва аудитор завершил inspection и оставил два независимых acceptance-теста. На исходном
candidate команда

```bash
pnpm exec vitest run src/infra/repos/pgTreatmentProgramHostedPreview.acceptance.test.ts \
  src/shared/lib/hostedVideoThumbnailRedirect.acceptance.test.ts
```

дала два красных файла: список шаблонов врача не звал общую лестницу для `hosted_video`, а сетевой
клиент успевал последовать за запрещённым redirect до проверки адреса.

Исправление `28555e17d` проверено ведущим:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/hostedVideoThumbnailRedirect.acceptance.test.ts \
  src/shared/lib/hostedVideoThumbnail.unit.test.ts \
  src/infra/repos/pgTreatmentProgramHostedPreview.acceptance.test.ts \
  src/infra/repos/catalogMediaLadderLookup.unit.test.ts \
  src/infra/repos/mediaPreviewWorker.unit.test.ts \
  src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts
```

Результат: `6` файлов, `56` тестов — PASS. `pnpm --dir apps/webapp typecheck` — PASS.
`pnpm --dir apps/webapp lint` — PASS, включая `check-no-new-raw-sql`, migration privileges/order и
media-door gates.

## Обязательные границы

- Raw-SQL boundary: первичный аудит нашёл новые прямые SQL-запросы; `28555e17d` перевёл их на Drizzle,
  `check-no-new-raw-sql` зелёный. Нужна независимая итоговая инспекция diff.
- Orphan cleanup: первичный аудит подтвердил отсутствие перехода сирот в существующий purge. В
  `28555e17d` существующий purge сначала ограниченно ставит в `pending_delete` только cover без ссылки
  из текущего упражнения и без ссылки из выданной пациенту immutable-программы. Нужен rollback-only
  preflight миграции и независимая инспекция тела/прав.
- Migration/privileges: статические migration privilege/order gates зелёные; DEV preflight ещё не
  выполнен.
- SSRF/token secrecy: запрещённый redirect теперь проверяется до следующего сетевого запроса;
  независимый acceptance-тест зелёный. VK token остаётся серверным dependency.
- Doctor/patient delivery: список шаблонов врача и уже назначенная пациенту программа обновляют
  hosted-cover через общую лестницу; acceptance-тесты зелёные. Живая приёмка ещё не выполнена.

## Findings первичного прохода

1. **FAIL:** новые hosted-cover запросы обходили обязательный Drizzle-путь сырым SQL.
2. **FAIL:** orphan cover не имел перехода в существующую машину `pending_delete` → purge.
3. **FAIL:** список шаблонов врача отбрасывал `hosted_video` до общей лестницы превью.
4. **FAIL:** автоматический redirect мог отправить запрос на запрещённый адрес до проверки
   фактического `Response.url`.

Все четыре исправлены в `28555e17d`; это запись исправления, а не самостоятельный независимый PASS.

## Вердикт

`FAIL → FIXED, RE-AUDIT PENDING` — первичный аудитор оборван системой; финальный verdict должен дать
короткий независимый re-audit четырёх findings и новой orphan-cleanup поверхности.
