# Patient daily warmup UX

Документация по разминке дня на главной пациента: ротация, layout материала, quick list, feedback после оценки.

## Канон

| Тема | Документ |
|------|----------|
| Runtime (pick, API, блоки, cooldown) | [`apps/webapp/src/modules/patient-home/patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md) |
| Выполнение практики / feeling | [`apps/webapp/src/modules/patient-practice/patient-practice.md`](../../apps/webapp/src/modules/patient-practice/patient-practice.md) |
| Deeplink из напоминания | [`docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md) |
| Журнал изменений | [LOG.md](./LOG.md) |
| API (видео просмотрен) | [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) — `patient/daily-warmup/video-viewed` |
| Плеер (hook `onFirstPlaying`) | [`docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`](../ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md) |

## Ротация (кратко, 2026-05-28)

1. Главная — текущая разминка до просмотра видео (presented или последняя выполненная).
2. Push — уже «следующая» относительно главной.
3. После просмотра видео (с главной или из push) — на главной и в следующем push показывается следующая страница в ordered list блока `daily_warmup`.

Миграция: `apps/webapp/db/drizzle-migrations/0084_patient_daily_warmup_presentations.sql`.
