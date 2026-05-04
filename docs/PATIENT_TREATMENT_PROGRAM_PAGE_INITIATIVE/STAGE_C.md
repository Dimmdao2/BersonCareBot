# STAGE_C — §1.1b visual redesign + stage route

## Цель

Привести detail-страницу к эталонному дизайну `ROADMAP_2` §1.1b и вынести полное тело этапа на отдельный маршрут `stages/[stageId]`.

## Модель агента

- Основная: `claude-4.6-sonnet-medium-thinking`.
- `composer-2` — допустим для вспомогательных подшагов (отдельные компоненты, static assets), но **не как sole-agent** на весь этап C.

## Предусловие

- Stage B закрыт и закоммичен.
- `Collapsible` из `@/components/ui/collapsible` присутствует в проекте (Phase 1 SHADCN alignment ✅).

## Существующие и новые файлы в scope

| Файл | Статус |
|------|--------|
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` | существующий — основные правки |
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx` | существующий — minor loader updates |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx` | существующий — **должен оставаться зелёным** (при необходимости обновить под новую структуру, не удалять) |
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.nudgeResilience.test.tsx` | существующий — **должен оставаться зелёным** |
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx` | **новый** RSC — создать |
| `apps/webapp/src/app-layer/routes/paths.ts` | существующий — добавить `patientTreatmentProgramStage` |
| `apps/webapp/src/shared/ui/patientVisual.ts` | существующий — добавить `patientStageTitleClass`; при необходимости `patientSurfaceProgramClass` |
| `apps/webapp/src/app/globals.css` | существующий — **только** если не хватает существующих `--patient-surface-*` токенов |
| `apps/webapp/public/patient/ui/play.svg` (или аналогичный путь) | **новый** статический ассет |

## Out of scope (запрещено)

- Любые изменения БД, схемы, портовых контрактов.
- Возврат процентных метрик.
- Booking wizard или расширение доменной модели.
- Добавление в `globals.css` произвольных hex-цветов — только семантические `--patient-surface-*` токены.
- Удаление или ослабление существующих тестов без продуктового обоснования.

## Подэтапы (декомпозиция)

| Шаг | Что сделать | Критерий готовности |
|-----|-------------|---------------------|
| C1 | Hero-карточка: badge «МОЙ ПЛАН», badge «Этап X из Y», заголовок, индикатор «● План обновлён», CTA «Открыть план» + иконка Play из статического ассета | Hero использует `patientSurfaceInfoClass` / `patientSurfaceProgramClass`; ассет загружается через `next/image` или `<img>` |
| C2 | Карточка «Следующий контроль» (`PatientProgramControlCard`): дата, подпись, CTA «Выполнить тесты» и «Записаться на приём» | Карточка рендерится только при `controlLabel != null`; поверхность через `patientSurfaceWarningClass` |
| C3 | Этап 0 в `Collapsible` из `@/components/ui/collapsible`, закрыт по умолчанию | `open` default `false`; trigger открывает/закрывает без ошибок |
| C4 | Текущий этап: превью-карточка + заголовок + subtitle из `goals`/`objectives` + CTA «Открыть этап» → `stages/[stageId]` | Полного inline `PatientInstanceStageBody` на detail нет |
| C5 | Точка входа «История тестирования» вместо развёрнутого списка результатов тестов | На detail одна кнопка/ссылка; детали UX фиксируются в `LOG.md` при реализации |
| C6 | Компактный список предыдущих этапов: `CheckCircle2` + название + дата если `completedAt` есть + `ChevronRight` → `stages/[stageId]` | Список с переходом; дата показывается только если поле доступно |
| C7 | Новый RSC `stages/[stageId]/page.tsx`: загрузка detail программы, поиск этапа по `stageId`, рендер `PatientInstanceStageBody`, back-link на detail | Страница открывается; back-link корректен; 404 если `stageId` не найден |
| C8 | `patientTreatmentProgramStage(instanceId, stageId)` в `paths.ts` | Все новые ссылки используют единый path helper |
| C9 | Убедиться, что `PatientTreatmentProgramDetailClient.test.tsx` и `nudgeResilience` тест зелёные (обновить под новую структуру при необходимости) | Все существующие тесты зелёные |
| C10 | Прогнать целевые проверки | Зелёные lint / typecheck / tests |
| C11 | Обновить `LOG.md` | Зафиксированы решения по UX «История тестирования», путь статического ассета |

## Проверки

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs src/app-layer/routes src/shared/ui
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

## Коммит-гейт этапа

- После `EXEC -> AUDIT -> FIX` этапа C: **только commit**, без полного `ci`.
- Формулировка в логе: `Stage C closed`.
