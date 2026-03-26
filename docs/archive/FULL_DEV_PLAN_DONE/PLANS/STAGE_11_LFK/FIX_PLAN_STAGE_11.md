# FIX_PLAN — этап 11 (ЛФК)

**Статус:** этап в текущем коде **не реализован** (нет модулей `lfk-exercises`, `lfk-templates`, `lfk-assignments`, нет миграций `030_lfk_exercises` / `031_lfk_templates_and_assignments` в актуальном виде — после этапа 10 номера миграций сдвинуты; следующие свободные файлы нужно брать из `apps/webapp/migrations/*.sql`).

## Шаги (строго по `PLAN.md` этапа 11)

1. **Миграции:** добавить новые файлы с **следующими свободными** номерами (проверить `ls apps/webapp/migrations`): схема упражнений и медиа; схема шаблонов и назначений — как в плане 11.1–11.2.
2. **`apps/webapp/src/modules/lfk-exercises/*`**, **`infra/repos/pgLfkExercises.ts`**, **`buildAppDeps.ts`** — шаг 11.3.
3. **`apps/webapp/src/app/app/doctor/exercises/*`**, **`DoctorHeader.tsx`**, **`doctorScreenTitles.ts`** — шаг 11.4.
4. **`apps/webapp/src/modules/lfk-templates/*`**, **`pgLfkTemplates.ts`**, **`buildAppDeps.ts`** — шаг 11.5.
5. **`apps/webapp/src/app/app/doctor/lfk-templates/*`**, зависимости dnd в `apps/webapp/package.json` — шаг 11.6.
6. **`apps/webapp/src/modules/lfk-assignments/*`**, **`doctor/clients/*`**, **`modules/diaries/lfk-service.ts`**, **`pgLfkDiary.ts`** — шаг 11.7.
7. Тесты и e2e — по чеклисту финального критерия этапа в `PLAN.md`.
8. Модульная документация в `modules/diaries/` и новые `*.md` для модулей — по плану.

---

Не начинать реализацию до явного выбора номеров миграций, чтобы не конфликтовать с уже существующими `030_news_and_motivation.sql` и последующими этапами.
