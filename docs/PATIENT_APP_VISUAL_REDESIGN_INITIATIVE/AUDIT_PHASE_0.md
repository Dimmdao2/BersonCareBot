# AUDIT — Phase 0 (Patient App Visual Redesign)

Дата: **2026-04-29**. Режим: **AUDIT** (только документы; app-код не менялся; full CI не запускался).

Источники проверки: `README.md`, `MASTER_PLAN.md`, `00_INVENTORY_PLAN.md`, `PLAN_INVENTORY.md`, `LOG.md`, `VISUAL_SYSTEM_SPEC.md` инициативы.

---

## 1. Verdict: **PASS WITH MINOR NOTES**

Phase 0 выполнен по смыслу: есть `PLAN_INVENTORY.md` с привязкой к реальным путям, явный GO/NO-GO для Phase 1, риски и разбиение фаз. Критичных пробелов, блокирующих старт Phase 1 при условиях из inventory, нет.

Замечания не повышают до **FAIL**, потому что они касается **расхождения нормативного spec с деревом** и **устаревшей строки в LOG**, а не отсутствия инвентаризации или нарушения правил инициативы по scope/CI/slug/doctor.

---

## 2. Mandatory fixes

**Нет обязательных исправлений**, без которых нельзя считать Phase 0 принятым или начинать Phase 1 по правилам инициативы.

Условия старта Phase 1 уже зафиксированы в `PLAN_INVENTORY.md` §11 (создание отсутствующих файлов, не расширение scope на nav/header, пререквизит для Phase 3+) — это **gate для EXEC**, а не дефект Phase 0.

---

## 3. Minor notes

1. **`VISUAL_SYSTEM_SPEC.md` §4** — колонка «Текущее состояние» описывает стек (bottom nav, `PatientHomeToday*`, `patientHomeCardStyles.ts`, целевой `navigation.ts`), которого **нет** в дереве, зафиксированном в `PLAN_INVENTORY.md`. Spec остаётся валидным как **целевое** описание и карта имён файлов после merge; как единственный источник «что сейчас в репо» — вводит в заблуждение. Рекомендуется позже **документальный** PR: обновить §4 под фактический baseline или добавить явную пометку «состояние на ветке X / после merge Y».

2. **`LOG.md`**, блок «Session sanity check» — утверждение, что **`PLAN_INVENTORY.md` отсутствует**, после создания inventory **устарело**; при следующем редактировании `LOG.md` лучше одной строкой пометить, что артефакт Phase 0 добавлен (не блокер для Phase 1).

3. **`README.md`** инициативы в «Принципе реализации» перечисляет `PatientBottomNav.tsx` и `patientHomeCardStyles.ts` как точки входа — для текущего baseline это **целевые** точки; `PLAN_INVENTORY` это уже объясняет. При желании убрать путаницу — короткая сноска в README «пути появятся в Phase 1–2 / после merge».

4. **`VISUAL_SYSTEM_SPEC.md` §1.1 / runtime** — упоминание главной из `patient_home_blocks` / CMS может не совпадать с **текущей** легаси-сборкой в `page.tsx` до переноса модели; визуальная инициатива не меняет data-модель — EXEC должен опираться на **фактический** data-path кода, а не только на абзац spec (согласуется с `PLAN_INVENTORY` §1).

5. Нормативные ссылки **`PATIENT_HOME_REDESIGN_INITIATIVE/README.md`** и **`CONTENT_PLAN.md`** в дереве могут отсутствовать (`PLAN_INVENTORY` §0); это не ломает Phase 1, но снижает удобство cross-check runtime-ограничений — восстановление из ветки/archive по желанию команды.

---

## 4. Readiness for Phase 1

| Критерий | Оценка |
|----------|--------|
| Inventory опирается на реальные файлы | **Да** — перечислены `AppShell.tsx`, `PatientHeader.tsx`, `navigation.ts`, `globals.css`, отсутствие `PatientBottomNav`, легаси `page.tsx`, тесты `PatientHeader` / `navigation`, отсутствие `AppShell.test.tsx` и home `*.test`. |
| App-код в Phase 0 не менялся | **Да** — по заявлению и смыслу Phase 0 / inventory. |
| Scope Phase 1 достаточно узок для Composer 2 | **Да** — `globals.css` (токены в patient-scope), фон patient `AppShell` без max-width, опционально `button-variants` / patient-helper, **создание** `patientHomeCardStyles.ts` (или `patientHomeVisual.ts`), **создание** smoke `AppShell.test.tsx`; явный запрет трогать header/nav/navigation и max-width. |
| Тесты / проверки не чрезмерны | **Да** — не требуется full CI после шага; целевые targeted тесты и typecheck/lint по политике README / MASTER_PLAN. |
| Нет призыва гонять full CI после каждого шага | **Да** — README §«Проверки», MASTER_PLAN §10 / Phase 5. |
| Нет плана хардкода slug из CONTENT_PLAN | **Да** — MASTER_PLAN §3; VISUAL_SYSTEM_SPEC §1.2, §10.4; inventory не предлагает slug-based визуал. |
| Нет утечки scope на doctor/admin redesign | **Да** — Phase 1 исключает doctor variant и чужие layout; риск только через общие `button-variants` / `:root` — отмечен как blast radius, не как расширение scope. |

**Итог:** Phase 1 **готов к EXEC** при соблюдении условий из `PLAN_INVENTORY.md` §11 и чеклиста `01_FOUNDATION_PLAN.md`.

---

## 5. Model recommendation for Phase 1

**Composer 2** — по умолчанию для Phase 1 (tokens, scoped CSS, узкий `AppShell`, новые helper-файлы, один smoke-тестовый файл).

Эскалация **Codex 5.3** — только если два подряд неудачных прохода по Tailwind v4 / `@layer` / patient-scope в `globals.css` или по безопасному расширению `cva` в `button-variants.ts`.

**GPT 5.5** — не требуется для Phase 1 при текущем аудите; резерв на согласование spec §4 с деревом после merge (см. minor notes).

---

*Архивные PROMPT'ы `PATIENT_HOME_REDESIGN_INITIATIVE` и `.cursor/plans/phase_3_patient_home_*` / `phase_4.5_patient_home_*` не исполнялись.*
