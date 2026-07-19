# Execution log

Append-only журнал. Планирование не переводит ни один implementation stage в `doing`.

## 2026-07-19 — initiative authored

- Прочитаны core docs, plan/orchestration rules, SaaS sequence/roadmaps, активные логи и taskdb.
- Зафиксированы защищённые active scopes: D3/D4, S4/S5, billing, TEST fixes, Product UX и Doctor DNA.
- Подтверждено: Security CI решения уже сохранены коммитом `7a3b0a840f` и taskdb `#881`, но jobs/configs ещё
  отсутствуют.
- На dev-хосте найдены Gitleaks/Semgrep/Trivy/Garak; ZAP script отсутствует. Это не production inventory.
- Подтверждён канонический `deploy/postgres/postgres-backup.sh`: unified dump, retention и health tick уже есть;
  DR-план усиливает его, а не создаёт второй backup path.
- Создан отдельный roadmap без изменения активных планов и без production mutations.
- В taskdb созданы draft-задачи `#898–904`, все с `auto_ok=false`; `#881` синхронизирован техническим уточнением
  по ZAP hosted-runner allow-window.

Проверки планирования записываются отдельной следующей записью после независимого аудита и link validation.

## 2026-07-19 — owner direction: recoverable account deletion

- Владелец зафиксировал обязательный product invariant для `PR-03`: удаление аккаунта не удаляет клиентские
  данные и файлы немедленно; сначала действует recovery window с возможностью реактивации, затем контролируемый
  purge/anonymize.
- Предварительный product target окна — 90 дней. Точная retention matrix и legal exceptions остаются открытой
  частью `G-03`; это уточнение не подменяет owner+legal acceptance и не разрешает ранний DB/API/job implementation.
- Техническая выгрузка данных отложена из первого deletion/retention slice и остаётся будущей DSAR capability.
- Изменение синхронизировано только с существующими `PR-03` и `OWNER_AND_LEGAL_GATES`; новый roadmap/task не создан.
- Последующее уточнение владельца: purge не может быть тихим. До него обязательны несколько email reminders и
  возможность скачать export bundle с исходными файлами практики/пациентов и исходными видео; внутренние HLS-
  производные/previews/служебные transcripts не считаются отдельными пользовательскими originals.
- Recovery/reminder/export/purge policy должна быть отражена в оферте/договоре и privacy policy. Export остаётся
  технически отложенным до `PR-03`, но без него необратимый purge не может быть включён.
- Large-export UX может быть реализован после первого production launch в пределах recovery window. Для объёмов в
  несколько гигабайт требуется возобновляемая/частичная загрузка или эквивалентный надёжный механизм; до его
  готовности purge остаётся выключенным, а 90-дневный target не запускает удаление автоматически.

## 2026-07-19 — independent audit correction round 1

- Первый auditor process упал по capacity; повторный read-only аудит выполнен отдельным plan reviewer.
- Исправлен major: `G-05`/уведомление РКН перенесено в немедленный PR-01; добавлен `G-05A` interim containment
  для новых health-data purposes/vendors/org onboarding до legal decision.
- Исправлен major: consent, data rights/retention, clinical audit и governance/incidents разделены на самостоятельные
  stages/tasks `#907/#905/#908/#906` с отдельными checks/audit. Первичные draft-задачи `#902–904` заменены
  задачами `#907–909`, чтобы их основной block не содержал устаревшие имена файлов.
- Исправлены minor: официальный URL портала РКН и явный allowed/out-of-scope gate во всех stage manifests.
- Correction re-audit: PASS после исправления stale stage references.
- Validation: 18 файлов инициативы прошли relative-link check; `git diff --check` clean; taskdb blocks/paths
  сверены после замены первичных draft-задач.
