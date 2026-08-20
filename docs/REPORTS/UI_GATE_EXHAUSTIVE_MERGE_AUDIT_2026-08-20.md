# Независимый аудит merge `406f1c448` — UI gate exhaustive

## Вердикт

**MUST FIX — убито 8, не поймано 0.**

Исполняемые защиты пяти branch-классов и обеих `feat`-правок в слитом коде работают и лично
подтверждены точечными fault injections. Merge всё равно не проходит заданный gate: сохранённый
branch-тест patient-card traversal был ослаблен с восьми обязательных вкладок до четырёх.

## Authority и метод

- Authority: brief независимого аудита 20.08.2026; `AGENTS.md` §10a/§10b, §24.4–§24.6;
  `runs/dev-interactive-audit/EXECUTION-MATRIX-2026-08-16.md` (`Authority: full-control-pass-brief.md.
  Executable declarations: scenarios.mjs.`).
- Повторяемое поведение проверено тестом и точечной инъекцией; полнота тест-кейсов и границы
  merge — сравнением родителей и итогового состояния.
- `full-control-pass-brief.md` в дереве `406f1c448` отсутствует: точный `rg` по `runs`, `docs` и
  `.cursor`, а также `git ls-tree -r --name-only 406f1c448` нашли только ссылку на него в matrix.
  Для этого bounded merge-аудита исполняемым oracle служили названные brief-ом
  `gate-utils.test.mjs` и `scenarios.mjs`.

## MUST FIX

### F1 — branch-условие patient-card traversal ослаблено с 8 вкладок до 4

Достижимый сценарий: gate после merge больше не требует доказательства вкладок `overview`,
`records`, `comms`, `finances`; отсутствие/поломка этих четырёх branch-деклараций не может сделать
сохранённый traversal-тест красным. Impact: merge может получить зелёный gate после потери половины
обязательного branch-набора. Нарушено явное требование brief-а «не потерять НИ ОДНО поведение ни
одной стороны» и отдельный критерий «не ослаблены ли условия».

Evidence:

- `git diff --histogram 37b9511d524cf074d24ff20ab95c9c2ecbd3932f..406f1c44867c4223a42092a7f62855091b08ba33 -- runs/dev-interactive-audit/gate-utils.test.mjs`
  показывает замену `eight patient-card tab contracts` на `current patient-card tab contracts` и
  удаление `['overview']`, `['records']`, `['comms']`, `['finances']` из `expected`.
- Это не удаление целого `test(...)`, поэтому рост общего количества тестов не компенсирует
  ослабление oracle.

Аудитор не исправлял finding.

## Fault injections

Каждая инъекция запускалась отдельно через `node --test --test-name-pattern=...` по тому же
`gate-utils.test.mjs`; каждый запуск выбрал ровно один тест, получил `tests 1`, `pass 0`, `fail 1`,
`exit 1`, после чего изменение было отменено.

| Требование | Временная поломка | Покрасневший собственный тест |
| --- | --- | --- |
| fail-closed на пробелах rendered surface | unclassified route принимался как `substantive` | `requires an explicit selector contract and one route classification` |
| route provenance | late request приписывался активной странице, а не владельцу при старте | `late request remains with A and console without a proven origin fails globally during B` |
| tenant provenance | несовпадающий `organization_id` doctor/patient принимался | `aggregate derives the shared tenant from doctor and patient while preserving global-admin null` |
| явная disposition rendered link | любой link вне bounded traversal принимался как `external_manual_only` | `rendered links require explicit safe disposition before the binary gate accepts them` |
| обход ограничен origin | снята same-origin проверка в `discoverBounded` | `bounded traversal never discovers a foreign-origin doctor patient link` |
| semantic contract ограничен route owner | static gate сканировал все product sources вместо owner/import graph | `runner static contract gate rejects a selector exported only by another route owner` |
| `c56fcd37f` analytics platform-stub | anchor возвращён к `#doctor-analytics-tabs` | `runner static contract gate rejects an invented selector while real contracts map to product primitives` |
| `f8da3953b` rendered patient identity | status glyphs снова запрещены, bare exact name | `accepts a rendered on-support marker but not another patient identity` |

Итого: **убито 8, не поймано 0**.

## Полнота тест-кейсов

Точные числа получены командами без пайпов:

| Состояние | Команда | `test(` cases |
| --- | --- | ---: |
| `feat` parent | `git grep -c '^test(' 4d71e8bc1592ff0fc901c4e8794503135991a066 -- runs/dev-interactive-audit/gate-utils.test.mjs` | 12 |
| exhaustive branch parent | `git grep -c '^test(' 37b9511d524cf074d24ff20ab95c9c2ecbd3932f -- runs/dev-interactive-audit/gate-utils.test.mjs` | 29 |
| merge | `git grep -c '^test(' 406f1c44867c4223a42092a7f62855091b08ba33 -- runs/dev-interactive-audit/gate-utils.test.mjs` | 33 |

Целые feat-тесты сохранены, exhaustive branch-тесты присутствуют, добавлено четыре случая; F1 выше
фиксирует содержательное ослабление одного сохранённого теста, которое простой census не видит.

## Границы diff

`git diff --name-status 4d71e8bc1592ff0fc901c4e8794503135991a066..406f1c44867c4223a42092a7f62855091b08ba33`
показывает только `runs/dev-interactive-audit/**` и
`docs/REPORTS/UI_GATE_EXHAUSTIVE_MERGE_2026-08-20.md`. `git diff --summary` показывает только
обычные `100644` additions (`audit-engine.mjs` и merge-report), без изменения прав. Нет `apps/**`,
`deploy/postgres/**`, `apps/webapp/db/drizzle-migrations/**` и `*.sql`.

Текущий `HEAD` новее target (`b54a83ef9`), но команда
`git diff --exit-code 406f1c44867c4223a42092a7f62855091b08ba33..HEAD -- runs/dev-interactive-audit docs/REPORTS/UI_GATE_EXHAUSTIVE_MERGE_2026-08-20.md`
вернула `0`: подсудимые файлы после target-коммита не менялись.

## Обязательные проверки

| Команда | Exit / результат |
| --- | --- |
| `node --test runs/dev-interactive-audit/gate-utils.test.mjs` | 0; 33/33 pass |
| `node --check runs/dev-interactive-audit/audit-engine.mjs` | 0 |
| `node --check runs/dev-interactive-audit/gate-utils.mjs` | 0 |
| `node --check runs/dev-interactive-audit/gate-utils.test.mjs` | 0 |
| `node --check runs/dev-interactive-audit/run.mjs` | 0 |
| `node --check runs/dev-interactive-audit/scenarios.mjs` | 0 |
| `node --input-type=module -e "import './runs/dev-interactive-audit/scenarios.mjs'"` | 0 |
| `node --input-type=module -e "import './runs/dev-interactive-audit/audit-engine.mjs'"` | 0 |
| `git diff --check` | 0 |
| `git diff --check 4d71e8bc1592ff0fc901c4e8794503135991a066..406f1c44867c4223a42092a7f62855091b08ba33` | 0 |
| `git status --short` после всех откатов, до записи этого audit artifact | 0; 0 строк |

Полный CI не запускался; push и merge в `feat` не выполнялись.
