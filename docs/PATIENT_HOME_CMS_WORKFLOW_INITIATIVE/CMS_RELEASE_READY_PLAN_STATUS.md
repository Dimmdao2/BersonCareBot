# Patient Home CMS — Release-Ready Plan (статус выполнения)

Каноническая фиксация плана «release-ready» в репозитории (ранее — внешний `.cursor/plans/…`; этот файл — **source of truth для статуса** в инициативе).

**Дата закрытия кода и CI:** 2026-04-29  
**Итог:** **PASS** по персистентности, редактору, runtime основной `/app/patient`, миграциям и root CI.

## Чеклист плана

| # | Пункт | Статус |
|---|--------|--------|
| 1 | Drizzle schema + migration `patient_home_blocks` / `patient_home_block_items`, seed пяти CMS-блоков; правки verify/drizzle.config/index | **PASS** — `db/schema/patientHome.ts`, `0009_patient_home_cms_blocks.sql` |
| 2 | Колонки `content_sections.icon_image_url` / `cover_image_url`; slug history `changed_by_user_id` + CHECK `old_slug <> new_slug` | **PASS** — schema + `0009` |
| 3 | Port `PatientHomeBlocksPort`, `pgPatientHomeBlocks`, in-memory, `createPatientHomeService`, `buildAppDeps().patientHome` | **PASS** |
| 4 | Server actions: reorder / toggle / delete / repair(refresh) / visibility / add item; без stub `bump()` | **PASS** — `settings/patient-home/actions.ts` |
| 5 | Doctor editor: данные из БД, не demo | **PASS** — `doctor/patient-home/page.tsx` |
| 6 | Inline-create: `content_sections` + строка в `patient_home_block_items` | **PASS** |
| 7 | Patient runtime: primary + secondary от CMS при видимости блока; без редизайна shell/cards | **PASS** — `app/patient/page.tsx`, `PatientHomeToday.tsx`, SOS/carousel/courses |
| 8 | Тесты (точечные) + документация LOG / ROLLBACK / FINAL_AUDIT | **PASS** — см. запись «DOC sync» в `LOG.md`, переписан `FINAL_AUDIT.md` |
| 9 | Root CI `pnpm install --frozen-lockfile && pnpm run ci` | **PASS** |
| 10 | Ручной QA `06_QA_RELEASE_PLAN.md` | **OPEN** — вне автоматического gate; зафиксировать в `LOG.md` после прогона |

## Связанные документы

- Детали реализации и остатки backlog: [`DOC_SYNC_AND_PASS_CLOSURE.md`](DOC_SYNC_AND_PASS_CLOSURE.md)
- Итоговый аудит (единый текст): [`FINAL_AUDIT.md`](FINAL_AUDIT.md)
