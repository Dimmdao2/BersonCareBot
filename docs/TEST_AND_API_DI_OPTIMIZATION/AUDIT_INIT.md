# Audit — подготовительный проход TEST_AND_API_DI_OPTIMIZATION

**Дата аудита:** 2026-04-17. **Объект:** согласованность `MASTER_PLAN.md` и `EXECUTION_RULES.md` с репозиторными правилами тестов/CI; запрет правок GitHub CI/deploy; журнал трека A после подготовительного прохода. **Метод:** сравнение текстов документов (тесты и `pnpm run ci` не запускались — см. audit hard rule в `test-execution-policy.md`).

## Verdict

**PASS** — расхождений, требующих правок инициативных документов или дозаписи журнала по результатам первичного аудита, не было. **Обновление 2026-04-17:** превентивное закрытие MF-1…MF-5 (см. «MANDATORY FIX INSTRUCTIONS — closure»); verdict **PASS** сохранён.

---

## 1) MASTER_PLAN и EXECUTION_RULES ↔ test-execution-policy и pre-push-ci

### Ссылки и разделение ролей

| Источник инициативы | Содержание | Соответствие правилам |
|---------------------|------------|------------------------|
| `MASTER_PLAN.md` | Явные ссылки на `.cursor/rules/test-execution-policy.md` и `.cursor/rules/pre-push-ci.mdc`; step/phase между коммитами; полный CI перед пушем / «как в CI» | Согласовано с приоритетом policy vs pre-push в `test-execution-policy.md` (строки 10–14) и барьером push в `pre-push-ci.mdc`. |
| `MASTER_PLAN.md` § checkpoints | Полный `pnpm run ci` перед **пушем**, не обязателен после каждого локального коммита | Согласовано с антипаттерном «полный CI после каждого изменения» в policy. |
| `MASTER_PLAN.md` § маленькие коммиты | После шага — test-execution-policy; не полный монорепо CI; перед пушем — `pnpm install --frozen-lockfile && pnpm run ci` | Дословно совпадает с `pre-push-ci.mdc` (команды) и step/phase в policy. |
| `EXECUTION_RULES.md` п. 6 | Между коммитами — `test-execution-policy.md`; полный `pnpm run ci` — сценарий **пуша** (`pre-push-ci.mdc`) | Согласовано. |
| `EXECUTION_RULES.md` § «Валидация» | Step / Phase / Full CI с определениями; full CI также при repo-уровне и явной просьбе «как в CI»; reuse | Policy допускает full CI при repo-факторах и перед push (`test-execution-policy.md`, разделы Full CI и decision rule); reuse — в policy. |

### Нюанс (зафиксирован в инициативе)

Различие **микрошаг в `apps/*`** vs **repo-scope** (shared, lockfile, корневые конфиги) перенесено в `MASTER_PLAN.md` (§ «Маленькие reviewable commits») и в `EXECUTION_RULES.md` § «Валидация» — в полном соответствии с `test-execution-policy.md` (full CI ограниченно, не после каждой точечной правки).

---

## 2) Запрет изменения GitHub CI / deploy pipeline

| Документ | Формулировка |
|----------|--------------|
| `MASTER_PLAN.md` § «GitHub CI и деплой» | Не изменять `.github/workflows/ci.yml`; не перестраивать jobs **Deploy** и связанный поток без отдельного решения команды; workflow в PR по инициативе — вне scope. |
| `EXECUTION_RULES.md` п. 6 | Не редактировать `.github/workflows/ci.yml`, job **Deploy** и связанные шаги без отдельного решения; исключения — явная запись в `LOG.md` и вне scope обычного PR. |
| Критерии выхода трека B (`MASTER_PLAN.md`) | «workflow GitHub не меняли» | Явное условие выхода. |

Итог: запрет **явный**, дублируется в плане и правилах исполнения.

---

## 3) Журнал `test-optimization/LOG.md`

Подготовительный проход (2026-04-17) зафиксирован в журнале: раздел **«2026-04-17 — preparatory pass (docs ↔ rules)»** с перечислением проверенных документов, выводом по step/phase/pre-push и по запрету workflow/deploy, отметкой об отсутствии правок кода/тестов.

Требований аудита к дополнительным правкам журнала **нет**.

---

## MANDATORY FIX INSTRUCTIONS — closure (Critical / Major)

Ниже — закрытие **critical** и **major** требований из исходного блока MANDATORY FIX (превентивное встраивание в инициативу, без изменения `.cursor/rules/*`). Статус на **2026-04-17** после правок документации.

| ID | Уровень | Тема | Статус | Где зафиксировано |
|----|---------|------|--------|-------------------|
| MF-1 | **Critical** | Источник правды: policy / pre-push; дрейф править только в `docs/TEST_AND_API_DI_OPTIMIZATION/` | **CLOSED** | `EXECUTION_RULES.md` § «Источник правил по прогонам и пушу»; `README.md` (ссылки на rules + строка про `AUDIT_INIT.md`). |
| MF-2 | **Critical** | Барьер перед пушем; не полный монорепо CI после каждого микрошага; repo-scope ≠ микрошаг | **CLOSED** | `MASTER_PLAN.md` (доп. bullet в § «Маленькие reviewable commits»); `EXECUTION_RULES.md` § «Валидация» (без изменения смысла); нюанс в § «Нюанс» этого файла. |
| MF-3 | **Critical** | Явный запрет правок `.github/workflows/ci.yml` / job **Deploy** | **CLOSED** | Без изменения смысла: `MASTER_PLAN.md` § «GitHub CI и деплой»; `EXECUTION_RULES.md` п. 6 (расширен запретом на «чинить» через workflow). |
| MF-4 | **Major** | Любой обязательный док-фикс по policy/workflow — запись в `test-optimization/LOG.md` | **CLOSED** | Запись **2026-04-17 — post-audit doc closure** в `test-optimization/LOG.md`. |
| MF-5 | **Major** | Не устранять расхождения правками pipeline / ослаблением pre-push | **CLOSED** | `EXECUTION_RULES.md` п. 6 (явное предложение после точки с запятой). |

**Verdict (после closure):** **PASS** — critical/major по таблице закрыты документами в scope инициативы.

---

## MANDATORY FIX INSTRUCTIONS — ремедиация при будущем дрейфе

Применять **только если** последующий аудит или ревью снова выявит расхождение инициативных документов с `.cursor/rules/test-execution-policy.md` или `.cursor/rules/pre-push-ci.mdc`, либо ослабление запрета на workflow/deploy.

1. **Источник правды для уровней проверок:** `.cursor/rules/test-execution-policy.md` (step / phase / full CI, reuse, аудит). Инициативные документы править **только** в каталоге `docs/TEST_AND_API_DI_OPTIMIZATION/` (в первую очередь `MASTER_PLAN.md`, `EXECUTION_RULES.md`, при необходимости `PROMPTS_EXEC_AUDIT_FIX.md` и чеклисты), чтобы восстановить дословное соответствие ссылкам и терминам из rules. Не менять `.cursor/rules/*` в рамках этой инициативы без отдельного решения команды.

2. **Барьер перед пушем:** если в тексте инициативы появится требование «гонять полный монорепо CI после каждого микрошага» или эквивалент — **обязательно** удалить/заменить формулировкой: между коммитами step/phase по policy; `pnpm install --frozen-lockfile && pnpm run ci` — перед push (и при repo-scope по policy). Зафиксировать исправление строкой в `test-optimization/LOG.md` (дата, что выровняли).

3. **GitHub CI / Deploy:** если запрет размыт или отсутствует в новом фрагменте документации — **обязательно** вернуть явный запрет: не редактировать `.github/workflows/ci.yml`, не менять job **Deploy** и связанный поток без отдельного решения команды; для инициативы — вне scope. При исключении (крайний случай) — запись в соответствующий `LOG.md` и вынесение за пределы обычного PR инициативы, как в `EXECUTION_RULES.md` п. 6.

4. **Журнал:** любой обязательный док-фикс по пп. 2–3 сопровождать краткой записью в `test-optimization/LOG.md` (дата, ссылка на коммит при наличии, суть правки).

5. **Не делать:** «чинить» несогласованность через правки workflow, добавление deploy-шагов или ослабление pre-push только ради зелёного CI в документах — это **запрещено** политикой инициативы.
