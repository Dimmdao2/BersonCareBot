# Промпты для авто-агентов (copy-paste)

Контекст инициативы:

- Master plan: `docs/TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md`
- Правила исполнения: `docs/TEST_AND_API_DI_OPTIMIZATION/EXECUTION_RULES.md`
- Discovery: `docs/TEST_AND_API_DI_OPTIMIZATION/DISCOVERY_REPORT.md`
- Трек A (тесты): `docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/` — `PLAN.md`, `INVENTORY.md`, `BASELINE.md`, `CHECKLIST.md`, `LOG.md`, `RISKS.md`
- Трек B (DI / import-boundary): `docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/` — те же имена файлов
- Индекс: `docs/REPORTS/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md`

Общие правила для всех запусков:

1. Два трека **не смешивать** в одном PR: сначала закрывается трек A, checkpoint, затем трек B (см. `MASTER_PLAN.md`).
2. Проверки между коммитами — `.cursor/rules/test-execution-policy.md`: **step** (таргетированный Vitest / узкий lint-typecheck) → при закрытии логического пакета в одном приложении **phase** (полный `pnpm test:webapp` или `pnpm test` с корня — по факту изменений). **Не** запускать `pnpm run ci` после каждого микрошага.
3. **Пуш в remote** — только после успешного `pnpm install --frozen-lockfile && pnpm run ci` (`.cursor/rules/pre-push-ci.mdc`). Повторно тот же `ci` без новых изменений кода не гонять.
4. **Аудит** (раздел Audit validation в test-execution-policy): первый шаг — дифф, scope, reuse уже выполненных прогонов; **не** начинать аудит с полного CI или «прогоним всё».
5. **GitHub CI и деплой:** не менять `.github/workflows/ci.yml`, job Deploy и связанный поток. Деплой на хост — только как следует из текущего процесса после merge; отдельно пайплайн не «чинить».
6. Интеграционная конфигурация: не добавлять новые env для ключей/URI интеграций — канон `system_settings` (см. правила репозитория). Эта инициатива не меняет продуктовое поведение.
7. После каждого EXEC/FIX обновляй соответствующий журнал: `test-optimization/LOG.md` и/или `api-di-boundary-normalization/LOG.md`.
8. Каждый файл аудита из этого документа обязан содержать раздел **`MANDATORY FIX INSTRUCTIONS`**:
   - нумерованный список обязательных фиксов;
   - severity (`critical` | `major` | `minor`);
   - затронутые области (пути/модули);
   - критерий done.
9. Любой FIX после AUDIT обязан закрыть все **`critical`** и **`major`** из `MANDATORY FIX INSTRUCTIONS` соответствующего отчёта.

Файлы отчётов аудита (создавай в каталоге инициативы):

| Назначение | Файл |
|------------|------|
| Готовность доков/правил перед работой по коду | `docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_INIT.md` |
| Закрытие трека A (тесты), перед первым пушем | `docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_A.md` |
| **Pre-deploy** перед пушем после трека A (merge → обычный deploy) | `docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_PRE_DEPLOY_A.md` |
| Закрытие логического кластера трека B | `docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_B_CLUSTER.md` (перезаписывай или веди версии в git — по договорённости команды) |
| **Pre-deploy** перед пушем после трека B / всей инициативы | `docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_PRE_DEPLOY_B.md` |
| Сквозной итог перед merge в main / закрытием ветки | `docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_FINAL.md` |

---

## INIT — EXEC (сверка планов и правил, без кода)

```text
Выполни подготовительный проход инициативы TEST_AND_API_DI_OPTIMIZATION.

Вход:
- docs/TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md
- docs/TEST_AND_API_DI_OPTIMIZATION/EXECUTION_RULES.md
- .cursor/rules/test-execution-policy.md
- .cursor/rules/pre-push-ci.mdc

Сделай:
1) Убедись, что в документах инициативы нет требования гонять полный монорепо CI после каждого микрошага; зафиксированы step / phase / full CI только перед пушем.
2) Убедись, что явно записан запрет правок GitHub workflow / deploy job.
3) Код и тесты не меняй. При противоречии док ↔ rules — минимально поправь только файлы в docs/TEST_AND_API_DI_OPTIMIZATION.

Обнови test-optimization/LOG.md краткой записью (дата, что проверено).

Итог в ответ агенту:
- findings
- gate verdict: PASS | REWORK_REQUIRED
```

## INIT — AUDIT

```text
Проведи аудит подготовительного прохода инициативы TEST_AND_API_DI_OPTIMIZATION.

Проверь:
1) MASTER_PLAN и EXECUTION_RULES согласованы с test-execution-policy и pre-push-ci.
2) Запрет изменения GitHub CI/deploy pipeline явно есть.
3) Журнал test-optimization/LOG.md обновлён, если были правки.

Сохрани отчёт:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_INIT.md

Добавь раздел MANDATORY FIX INSTRUCTIONS.
```

## INIT — FIX

```text
Исправь замечания из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_INIT.md

Scope: только документация в docs/TEST_AND_API_DI_OPTIMIZATION/.
Закрой все critical и major из MANDATORY FIX INSTRUCTIONS.
Обнови test-optimization/LOG.md.
Тесты и pnpm run ci не запускай, если не трогал код (только markdown).
```

---

## TRACK A — EXEC (инвентарь overlap, без удаления тестов)

```text
Выполни работу по треку A (test optimization): инвентарь и overlap.

Вход:
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/PLAN.md
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/INVENTORY.md
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/LOG.md

Сделай:
1) Для каждого in-process сценария webapp: дублирует ли colocated route-тесты или даёт многошаговую ценность — обнови INVENTORY.md (уменьшай долю unknown/likely там, где уже сравнил содержимое).
2) Прод-код не меняй. Тесты не удаляй на этом шаге.
3) Проверки: не требуются, если нет изменений кода; при правках только markdown — без CI.

Итог:
- summary изменений в INVENTORY.md
- gate verdict: PASS | REWORK_REQUIRED
```

## TRACK A — AUDIT (инвентарь)

```text
Проведи аудит инвентаря трека A.

Проверь:
1) INVENTORY.md отражает классификацию и статус overlap там, где выполнялось сравнение.
2) Нет преждевременных удалений тестов без mapping (на этом шаге удалений быть не должно).
3) Критичные семейства из PLAN.md не «сняты» с покрытия планом работ.

Сохрани отчёт:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_A.md

Добавь MANDATORY FIX INSTRUCTIONS (если замечания только к докам — укажи severity соответственно).
```

## TRACK A — FIX (после AUDIT инвентаря)

```text
Исправь замечания из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_A.md

Scope: трек A, документация и при необходимости INVENTORY.md.
Закрой critical и major.
Обнови test-optimization/LOG.md.
```

---

## TRACK A — EXEC (один кандидат: удаление или слияние дубликата)

```text
Выполни один шаг трека A: один заранее согласованный кандидат (в журнале есть обоснование low-value и план replacement).

Вход:
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/PLAN.md
- docs/TEST_AND_API_DI_OPTIMIZATION/EXECUTION_RULES.md
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/LOG.md

Сделай:
1) Меняй только тесты (и при необходимости конфиг Vitest в scope трека A без изменения семантики CI jobs в GitHub).
2) Зафиксируй в LOG.md mapping: old → replacement + краткое обоснование.
3) Проверки: step-level — таргетированный Vitest по затронутым файлам и смежным route-тестам; полный pnpm test:webapp — только если закрываешь крупный пакет и это следующий блок phase.
4) pnpm run ci на этом шаге не запускай.

Итог:
- changed files
- checks run (команды)
- gate verdict
```

## TRACK A — AUDIT (после пакета микро-шагов или одного крупного изменения)

```text
Проведи аудит текущего состояния трека A после серии EXEC-шагов.

Следуй .cursor/rules/test-execution-policy.md: сначала дифф, scope, что уже гонялось; не начинай с полного CI.

Проверь:
1) Нет удалённых тестов без mapping в LOG.md.
2) Семейства контрактов из PLAN.md по-прежнему покрыты.
3) Нет смешивания с треком B в том же коммите/PR.
4) Добавь рекомендацию: нужен ли phase-level полный pnpm test:webapp сейчас (если с последнего полного прогона менялись тесты webapp).

Сохрани отчёт (можно дополнять тот же файл или вести историю — зафиксируй в отчёте дату):
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_A.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## TRACK A — FIX

```text
Исправь замечания из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_A.md

Scope: только трек A.
Закрой critical и major.
Выполни недостающие проверки по уровню из test-execution-policy (step или phase).
pnpm run ci не запускай, если нет оснований из отчёта или pre-push сценария.
Обнови test-optimization/LOG.md.
```

---

## TRACK A — PHASE (полный прогон webapp по необходимости)

```text
Выполни phase-level проверку для webapp по треку A.

Условие: после последнего полного pnpm test:webapp менялись тесты webapp — или AUDIT_TRACK_A.md явно требует phase.

Сделай:
1) Из корня репозитория: pnpm test:webapp (или эквивалент из apps/webapp).
2) При изменении только integrator-тестов — полный pnpm test с корня.
3) pnpm run ci не запускай.

Запиши в test-optimization/LOG.md: дата, команда, итог, краткий summary Vitest.
```

---

## PRE-DEPLOY AUDIT A (перед пушем после закрытия трека A)

```text
Проведи pre-deploy аудит для изменений трека A перед пушем в remote (merge далее запустит привычный GitHub CI → deploy по процессу команды).

Вход:
- docs/TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/CHECKLIST.md
- docs/TEST_AND_API_DI_OPTIMIZATION/test-optimization/LOG.md
- docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_A.md (последняя версия)
- git diff, git status

Проверь:
1) Трек B не затронут в этом diff (только тесты / доки инициативы при необходимости).
2) Нет изменений .github/workflows и семантики CI jobs.
3) Все удаления/слияния тестов имеют mapping в LOG.md.
4) Критичные контракты из PLAN.md закрыты тестами.
5) Выполни: pnpm install --frozen-lockfile && pnpm run ci — один раз для gate перед пушем; зафиксируй результат в отчёте.

Сохрани:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_PRE_DEPLOY_A.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## PRE-DEPLOY FIX A

```text
Исправь замечания из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_PRE_DEPLOY_A.md

Закрой critical и major.
Обнови test-optimization/LOG.md.
Повтори недостающие проверки; затем снова pnpm install --frozen-lockfile && pnpm run ci если менялся код или конфиг, влияющий на gate.
Подтверди readiness к пушу (без изменения GitHub workflow).
```

---

## TRACK B — EXEC (один кластер из api-di-boundary PLAN)

```text
Выполни один кластер трека B (API DI / import-boundary) по:
docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/PLAN.md

Сделай:
1) Меняй webapp route handlers, app-layer, modules и тесты, нужные для HTTP parity.
2) Зафиксируй parity (статусы, ключи JSON, подпись, идемпотентность) в api-di-boundary-normalization/LOG.md.
3) Проверки: step — typecheck/lint apps/webapp при необходимости; Vitest по изменённым route.test.ts и связанным файлам. pnpm run ci не запускай.

Итог:
- cluster id (как в PLAN.md)
- changed files
- checks run
- gate verdict
```

## TRACK B — AUDIT (кластер)

```text
Проведи аудит только что выполненного кластера трека B.

Проверь:
1) Нет новых прямых @/infra импортов в route.ts сверх согласованных исключений.
2) Бизнес-логика не раздулась в route.ts.
3) Parity задокументирован в LOG.md трека B.

Сохрани отчёт (дополни или создай новую запись с датой внутри файла):
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_B_CLUSTER.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## TRACK B — FIX

```text
Исправь замечания из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_B_CLUSTER.md

Scope: только затронутый кластер трека B.
Закрой critical и major.
Проверки: step/phase по test-execution-policy; без pnpm run ci без необходимости.
Обнови api-di-boundary-normalization/LOG.md.
```

---

## TRACK B — PHASE (полный webapp по необходимости)

```text
Выполни phase-level для webapp после существенного куска трека B.

Условие: несколько маршрутов/модулей изменены с последнего полного pnpm test:webapp.

Сделай:
1) pnpm test:webapp из корня (или эквивалент).
2) pnpm run ci не запускай.

Запиши в api-di-boundary-normalization/LOG.md: дата, команда, итог.
```

---

## PRE-DEPLOY AUDIT B (перед пушем после закрытия трека B / всей инициативы)

```text
Проведи pre-deploy аудит перед финальным пушем после трека B (и при необходимости docs sync из MASTER_PLAN).

Вход:
- docs/TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md
- docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/CHECKLIST.md
- docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/LOG.md
- docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_TRACK_B_CLUSTER.md (последние записи)
- apps/webapp/src/app/api/api.md, apps/webapp/src/app-layer/di/di.md (если менялись)
- git diff, git status

Проверь:
1) Исключения import-policy перечислены и согласованы.
2) Документация API/DI не противоречит коду (точечно).
3) Нет правок GitHub workflow.
4) Выполни: pnpm install --frozen-lockfile && pnpm run ci; зафиксируй в отчёте.

Сохрани:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_PRE_DEPLOY_B.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## PRE-DEPLOY FIX B

```text
Исправь замечания из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_PRE_DEPLOY_B.md

Закрой critical и major.
Обнови api-di-boundary-normalization/LOG.md и при необходимости доки из MASTER_PLAN.
Повтори pnpm install --frozen-lockfile && pnpm run ci при изменениях кода/конфига.
Readiness к пушу; workflow GitHub не менять.
```

---

## FINAL AUDIT (перед merge в main / закрытием ветки)

```text
Проведи финальный сквозной аудит инициативы TEST_AND_API_DI_OPTIMIZATION.

Вход:
- docs/TEST_AND_API_DI_OPTIMIZATION/MASTER_PLAN.md
- docs/TEST_AND_API_DI_OPTIMIZATION/EXECUTION_RULES.md
- оба LOG.md треков
- AUDIT_INIT.md, AUDIT_TRACK_A.md, AUDIT_PRE_DEPLOY_A.md, AUDIT_TRACK_B_CLUSTER.md, AUDIT_PRE_DEPLOY_B.md (что применимо к ветке)
- git diff main...HEAD
- git status --short --branch

Проверь:
1) Трек A и B не смешаны неконтролируемо; метрики/выводы по времени тестов не списаны на не тот трек.
2) Нет потери критичных контрактов; mapping для удалённых тестов полон.
3) Остаточные @/infra в route.ts только из allowlist.
4) Доки из MASTER_PLAN синхронизированы или явно отложены с rationale в LOG.
5) CI перед последним пушем был green (evidence в PRE_DEPLOY отчётах или явная ссылка на коммит).

Сохрани:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_FINAL.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## FINAL FIX

```text
Исправь все critical и major из:
docs/TEST_AND_API_DI_OPTIMIZATION/AUDIT_FINAL.md

Обнови оба LOG.md треков и при необходимости docs/REPORTS/TEST_AND_API_DI_OPTIMIZATION_INDEX_2026-04-16.md.
Прогони pnpm install --frozen-lockfile && pnpm run ci.
Итог: changed files, gate verdict, готовность к merge.
```

---

## Порядок использования (кратко)

INIT (EXEC → AUDIT → FIX) → циклы TRACK A (EXEC по микрошагам → при необходимости AUDIT/FIX и PHASE) → **PRE-DEPLOY A (AUDIT → FIX, push)** → циклы TRACK B (EXEC → AUDIT → FIX, иногда PHASE) → **PRE-DEPLOY B (AUDIT → FIX, push)** → при необходимости догрузка доков → **FINAL AUDIT → FINAL FIX**.

Повторяй блоки **TRACK A — EXEC** и **TRACK B — EXEC** столько раз, сколько отдельных коммитов/кандидатов/кластеров в плане; **PRE-DEPLOY** вставляй перед каждым пушем, который отдаёт изменения в remote после закрытия соответствующего трека.
