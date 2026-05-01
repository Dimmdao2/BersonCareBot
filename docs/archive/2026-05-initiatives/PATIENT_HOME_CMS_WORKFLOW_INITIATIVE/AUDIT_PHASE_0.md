# AUDIT — Phase 0 (AUDIT_UX_CONTRACT)

Аудит результата Phase 0 против `00_AUDIT_UX_CONTRACT_PLAN.md` (чеклист, deliverables, completion criteria). Дата аудита: 2026-04-29.

## 1. Verdict

**Pass with notes** (не `blocked`).

Deliverables Phase 0 выполнены: `BLOCK_EDITOR_CONTRACT.md` содержит полную таблицу по всем пяти кодам блоков с требуемыми колонками; `LOG.md` содержит запись Phase 0 EXEC. Completion criteria из phase file («contract doc complete and self-consistent», «ready to start Phase 1 without ambiguity» по **целевой** модели инициативы) выполнены **с оговоркой**: часть чеклиста Phase 0 не может быть закрыта буквально из‑за отсутствия файлов в текущем дереве репозитория (см. раздел 4).

## 2. Mandatory fixes

**К содержанию контракта и критичным противоречиям с `MASTER_PLAN.md` / `README.md` инициативы — обязательных исправлений не выявлено.**

Обязательные **последующие** действия (не правка Phase 0 задним числом, а условие «полного» закрытия чеклиста на ветке с целевым кодом):

1. После появления `apps/webapp/src/modules/patient-home/blocks.ts` и резолверов — повторить пункт чеклиста «Allowed target types are aligned with `blocks.ts`» и при расхождении обновить `BLOCK_EDITOR_CONTRACT.md` (как уже обещено в заметках контракта).
2. После появления путей `settings/patient-home/*`, `doctor/patient-home/page.tsx`, `patientHomeResolvers.ts`, `patientHomeUnresolvedRefs.ts` — повторить обзор **всех** файлов из phase plan и уточнить в контракте колонки **empty runtime** / **missing target** по фактическому коду, если он отличается от нормативного `MASTER_PLAN.md`.

**FIX (2026-04-29):** пункты 1–2 вынесены в исполняемый чеклист в `BLOCK_EDITOR_CONTRACT.md` (раздел «Обязательная повторная верификация (AUDIT_PHASE_0 §2, FIX)»), чтобы обязательство аудита не терялось между ветками.

До выполнения этого чеклиста на ветке с целевым кодом Phase 0 остаётся **документально завершённым в условиях частичного дерева** — это согласуется с записью в `LOG.md` (`pass with notes`).

## 3. Minor notes

- Колонка **inline create status** смешивает нормативные значения (`partial` / `full`) с поясняющим текстом в скобках — читаемо, но при автоматизации метаданных лучше вынести пояснения в отдельный столбец или глоссарий.
- Для `sos` в **missing target** упомянуты «fallback-маршруты по продуктовым правилам» — это оставляет пространство для уточнения в Phase 1+, когда появится единый резолвер; риск неоднозначности низкий, если опираться на `MASTER_PLAN.md` при реализации.
- В **Input Docs (mandatory)** phase 0 перечислены `PATIENT_HOME_REDESIGN_INITIATIVE/README.md`, `LOG.md`, `AUDIT_PHASE_9.md` — в каталоге `docs/PATIENT_HOME_REDESIGN_INITIATIVE/` сейчас есть только `VISUAL_SYSTEM_SPEC.md`; EXEC зафиксировал замену части чтения на него и на правила `.cursor/rules/*`. Для строгого соответствия phase-формулировке стоит при появлении redesign-артефактов в репозитории дополнить LOG короткой addendum-записью «mandatory redesign docs прочитаны».
- Запись инициализации в `LOG.md` всё ещё с `Branch: TBD` — косметика, не влияет на Phase 0 deliverables.

## 4. Checklist coverage

Сопоставление с секцией **Phase Checklist** в `00_AUDIT_UX_CONTRACT_PLAN.md`:

| Пункт | Статус | Комментарий |
| --- | --- | --- |
| Reviewed all mandatory docs. | **Частично** | Полностью покрыты документы инициативы CMS-workflow. Три файла из `PATIENT_HOME_REDESIGN_INITIATIVE` (README, LOG, AUDIT_PHASE_9) в дереве **отсутствуют**; использован доступный `VISUAL_SYSTEM_SPEC.md` + правила из `.cursor/rules` (как в LOG Phase 0). |
| Reviewed all listed code files. | **Частично** | Список из phase file (doctor/settings + `blocks.ts` + resolvers/unresolved) в дереве **отсутствует**. Просмотрены реальные аналоги поведения главной: `patient/page.tsx`, `PatientHomeToday.tsx`, `PatientHomeSituationsRow.tsx`, `PatientHomeSubscriptionCarousel.tsx`; расхождение с целевой CMS-моделью явно описано в `BLOCK_EDITOR_CONTRACT.md`. |
| Contract table covers all `PatientHomeBlockCode`. | **Да** | Пять строк: `situations`, `daily_warmup`, `subscription_carousel`, `sos`, `courses`. |
| Allowed target types are aligned with `blocks.ts`. | **Условно да** | `blocks.ts` отсутствует; выравнивание выполнено с `MASTER_PLAN.md` §1.1 с явным дисклеймером в контракте. Строгая формулировка чеклиста («с `blocks.ts`») будет закрыта при появлении файла (см. §2). |
| Empty/runtime behavior documented honestly. | **Да** | Указаны правило §2.1, исключение для `daily_warmup`, и разделение целевого контракта vs легаси `page.tsx`. |
| Missing-target behavior documented. | **Да** | По строкам таблицы: пропуск в резолве, админ-диагностика, repair/CMS. |
| `LOG.md` updated. | **Да** | Запись `2026-04-29 — Phase 0 — EXEC`. |

**Deliverables:** `BLOCK_EDITOR_CONTRACT.md` — да; обновление `LOG.md` — да.

**BLOCK_EDITOR_CONTRACT required table:** все перечисленные в phase file поля присутствуют как колонки таблицы (`can manage items` как `yes` — эквивалент yes/no).

## 5. Readiness to Phase 1

**Готовность к Phase 1 по документам и контракту: да** — таблица и `MASTER_PLAN.md` дают достаточно опорных точек для метаданных, лейблов и превью (scope Phase 1 в `MASTER_PLAN.md`).

**Готовность к Phase 1 EXEC в этом же дереве кода: условная.** По `LOG.md` следующий шаг уже оговорен: работа на ветке `patient-home-cms-workflow-initiative` и/или после мержа кода редактора (`settings/patient-home/*`, модуль метаданных). Пока целевые файлы Phase 1 из `01_DIAGNOSTICS_LABELS_PLAN.md` отсутствуют, исполнение Phase 1 сводится к переносу ветки или к вводу заготовок файлов — это вне результата Phase 0, но аудитор должен явно различать **readiness по спецификации** и **readiness по репозиторию**.

Итог: переходить к Phase 1 **с точки зрения контракта и плана** можно; начинать **код** Phase 1 на текущем дереве — только после появления соответствующих путей или после смены ветки с полным набором файлов, с повторной верификацией чеклиста Phase 0 там, где это критично (`blocks.ts`, resolvers).
