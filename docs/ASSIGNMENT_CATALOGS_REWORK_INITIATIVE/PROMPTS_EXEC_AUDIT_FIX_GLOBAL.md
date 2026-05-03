# ASSIGNMENT_CATALOGS_REWORK_INITIATIVE — Composer prompts (copy-paste)

Контекст инициативы:

- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/MASTER_PLAN.md` (в т.ч. **§9 Git / CI**)
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/PRE_IMPLEMENTATION_DECISIONS.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_B1_PLAN.md` … `STAGE_B7_PLAN.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG_TEMPLATE.md`
- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXECUTION_AUDIT_TEMPLATE.md`
- `docs/APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`

Файлы аудитов (создаются по мере прохождения):

- `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_B1.md`
- … `AUDIT_STAGE_B7.md`
- (опционально) `AUDIT_GLOBAL.md`, `AUDIT_PREPUSH_POSTFIX.md`

---

## Общие правила для всех запусков

1. Перед EXEC прочитать **`PRE_IMPLEMENTATION_DECISIONS.md`** и этапный `STAGE_Bn_PLAN.md`; не противоречить зафиксированным решениям без обновления документов.
2. Цикл каждого этапа: **`EXEC → AUDIT → FIX`**. Следующий **Bn+1** только после закрытого FIX по текущему (или явно задокументированного defer critical/major в AUDIT).
3. **Порядок B** не строго линейный как A: см. зависимости в `MASTER_PLAN.md` §3 (B1 поперечный; B7 после B3+B4; параллель B2/B4/B5 осторожно из-за конфликтов файлов/CI).
4. Архитектура: `modules/*` только через ports/DI; route handlers тонкие; новые таблицы/запросы — Drizzle; интеграции — не в env (правила репозитория).
5. **CI между коммитами** — строго по `.cursor/rules/test-execution-policy.md`:
   - **Запрещено** запускать `pnpm run ci` / `pnpm check` после каждого маленького шага или «ради коммита».
   - **Разрешено (step-level):** таргетный `eslint`, `vitest run <файл|паттерн>`, `tsc --noEmit` по затронутой области (`apps/webapp` и др. по факту изменений).
   - **Phase-level** при крупном закрытии куска этапа: полный `pnpm test:webapp` (или `pnpm --dir apps/webapp test` без аргументов), если менялся весь контур webapp этапа.
   - **Повторный** полный CI без новых изменений кода не гонять (reuse в том же policy).
6. **Перед пушем** — полный барьер по `.cursor/rules/pre-push-ci.mdc`:

   ```bash
   pnpm install --frozen-lockfile
   pnpm run ci
   ```

   Если полный `ci` упал: сначала **упавший шаг** или узкий тест-файл, затем хвост **`pnpm run ci:resume:after-*`** из корневого `package.json` — **не** перезапускать весь `ci` на каждой итерации правки до зелёного хвоста; перед фактическим push снова полный `ci` (как в pre-push-ci).
7. **Git — коммиты:** после каждого завершённого **EXEC** или **FIX** по этапу (зелёные целевые проверки + обновлённый `LOG.md`; для FIX — закрыты critical/major в AUDIT или defer с обоснованием) — **один коммит** с осмысленным сообщением (например `feat(doctor-catalogs): B1 catalog filters`, `fix(doctor-catalogs): B2 audit …`).
8. **Git — пуш:** по умолчанию **не** пушить после каждого этапа; рекомендуемый ритм — **после закрытия B3, B6 и B7** (не чаще одного пуша на три закрытых этапа в середине волны: блок B1–B3, блок B4–B6, затем B7). Досрочный пуш — только по **явной** команде пользователя «пуш» / push; перед ним всё равно полный CI из п.6.
9. После каждого EXEC/FIX обновлять `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md` по `LOG_TEMPLATE.md`.
10. Каждый AUDIT содержит **MANDATORY FIX INSTRUCTIONS** с severity: `critical` / `major` / `minor`.
11. Не менять `.github/workflows/*` без явного решения команды.

---

## B1 — EXEC

```text
Выполни stage B1 инициативы ASSIGNMENT_CATALOGS_REWORK_INITIATIVE.

Вход:
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_B1_PLAN.md
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/MASTER_PLAN.md §9
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/PRE_IMPLEMENTATION_DECISIONS.md
- docs/APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md §3 B1

Сделай:
1) Добавь публикационный статус в `test_sets` (draft/published) через миграцию + backfill + индекс/constraint.
2) Расширь doctorCatalogListStatus: две оси query (pub × arch), legacy-маппинг старых status= ссылок.
3) Добавь shared UI фильтров (CatalogStatusFilters или согласованный путь): рядом селекты `active/archived` и `all/draft/published`.
4) Подключи к спискам ЛФК, шаблонов программ и test_sets.
5) Unit-тесты на парсер/маппинг и smoke по ТЗ.
6) Целевые eslint/vitest/tsc — НЕ полный pnpm run ci.
7) Обнови LOG.md; сделай коммит (см. MASTER_PLAN §9).
```

## B1 — AUDIT

```text
Проведи аудит stage B1.

Проверь: парсер URL, legacy-ссылки, три списка (ЛФК/шаблоны/test_sets), корректность колонки **`test_sets.publication_status`** (и типа `TestSet.publicationStatus`), регресс archive/usage где затронуто.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_B1.md
Добавь MANDATORY FIX INSTRUCTIONS (critical/major/minor).
```

## B1 — FIX

```text
Выполни FIX по docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_B1.md.

1) Закрой critical и major.
2) Minor — исправь или defer в AUDIT с обоснованием.
3) Целевые проверки B1; НЕ полный ci.
4) Обнови LOG.md; коммит (MASTER_PLAN §9).
```

---

## B2 — EXEC

```text
Выполни stage B2 (включая B2.5) инициативы ASSIGNMENT_CATALOGS_REWORK_INITIATIVE.

Вход: STAGE_B2_PLAN.md, PRE_IMPLEMENTATION_DECISIONS.md, ASSIGNMENT_CATALOGS_REWORK_PLAN.md §3 B2.

Сделай:
1) Drizzle колонки + measure_kinds + API + CreatableComboboxInput + ClinicalTestForm + фильтры списка + backfill scoring.
2) Зафиксируй контракт scoring в типах/валидаторах (schema_type и fallback в raw_text).
3) Q2: только каталог, без инстансного UX qualitative.
4) Целевые проверки; НЕ pnpm run ci.
5) LOG.md + коммит.
```

## B2 — AUDIT

```text
Аудит B2:
1) схема additive и обратная совместимость;
2) backfill scoring_config -> scoring/raw_text;
3) форма всех schema_type;
4) combobox + create error paths;
5) API measure_kinds;
6) фильтры region + assessmentKind;
7) зафиксировать evidence (файлы/тесты/смоук).

Сохрани: AUDIT_STAGE_B2.md + MANDATORY FIX INSTRUCTIONS.
```

## B2 — FIX

```text
FIX по AUDIT_STAGE_B2.md; critical/major закрыты; целевые проверки; LOG.md; коммит.
```

---

## B3 — EXEC

```text
EXEC B3: редактор наборов тестов как LFK (dnd-kit как в TemplateEditor), comment на item, диалог библиотеки, UUID textarea удалить полностью (Q5). B1 уже учтён для списков.

Целевые проверки; НЕ полный ci. LOG + коммит.
```

## B3 — AUDIT / FIX

```text
AUDIT B3 → AUDIT_STAGE_B3.md + MANDATORY FIX INSTRUCTIONS.
FIX → закрыть critical/major; LOG; коммит. После закрытия B3 — рекомендуемый пуш-чекпоинт (с полным ci перед push, MASTER §9).
```

---

## B4 — EXEC / AUDIT / FIX

```text
EXEC B4:
1) рекомендации — поля по PRE_IMPLEMENTATION (domain остаётся, UI «Тип», регион, тексты);
2) без merge старых domain с новыми в одной миграции;
3) проверить пересечение фильтров type + region и сценарии archive/unarchive.

Затем AUDIT B4 → AUDIT_STAGE_B4.md + MANDATORY FIX INSTRUCTIONS.
Затем FIX → LOG; коммит.
```

---

## B5 — EXEC / AUDIT / FIX

```text
EXEC B5:
1) сначала классифицируй «глаз»: UX-ожидание или state-bug;
2) ЛФК UX pass (список/карточка/CTA) + фильтры B1;
3) проверь синхронизацию статуса между list и editor сразу после action.

AUDIT B5:
- явно укажи, что именно было проблемой (UX vs state);
- проверь publish/archive/restore цепочку;
- проверь list/editor status parity.
Сохрани: AUDIT_STAGE_B5.md + MANDATORY FIX INSTRUCTIONS.
FIX → LOG; коммит.
```

---

## B6 — EXEC / AUDIT / FIX

```text
EXEC B6: сначала pre-check текущего кода конструктора после закрытия A и фиксация baseline в LOG; затем визуальный pass (превью, layout, CTA, модалка); НЕ удалять A1/A3 блоки; НЕ менять assign/snapshot.

AUDIT B6 → AUDIT_STAGE_B6.md + MANDATORY FIX INSTRUCTIONS.
FIX → LOG; коммит. После закрытия B6 — рекомендуемый пуш-чекпоинт (полный ci перед push).
```

---

## B7 — EXEC / AUDIT / FIX

```text
EXEC B7:
1) сначала собери audit-матрицу контейнеров (template/local/copy/ui/read) и зафиксируй в LOG;
2) universal comment по STAGE_B7 + PRE_IMPLEMENTATION (в т.ч. local_comment на lfk_complex_exercises);
3) patient слой — без отдельного большого редизайна: обязательны корректные read/fallback данные и точечный рендер комментариев в уже существующих блоках; новые крупные patient-компоненты только при прямой необходимости для DoD.

AUDIT B7:
- приложи матрицу покрытия контейнеров;
- проверь copy/override/clear/fallback;
- отдельно подтвердить, что `bodyMd` не смешан с comment.
Сохрани: AUDIT_STAGE_B7.md + MANDATORY FIX INSTRUCTIONS.
FIX → LOG; коммит. Финальный пуш ветки — только после полного pnpm run ci (pre-push-ci).
```

---

## Global audit (опционально)

```text
Сводный аудит B1–B7 после закрытия B7: кросс-регресс doctor catalog routes, нет ли дублирования с PROGRAM_PATIENT_SHAPE вне согласованного scope.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md
```

## Pre-push postfix (если полный ci нашёл хвосты)

```text
Исправь хвосты из полного pnpm run ci перед пушем; используй ci:resume:* между итерациями; в конце полный ci зелёный.

Сохрани: docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_PREPUSH_POSTFIX.md
```
