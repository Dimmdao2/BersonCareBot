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

## 2026-07-19 — real PROD, encryption and migration plan expansion

- Выполнен read-only audit текущего PROD и Selectel S3 без вывода значений секретов/ПДн. Зафиксированы: plain
  ext4 root и swap; PostgreSQL/secret/log/backup data на root; 93 plaintext dumps с небезопасными modes; private,
  но не client-side encrypted S3; disabled versioning/Object Lock; root/deploy/systemd/firewall/audit gaps.
- Добавлен обезличенный [`CURRENT_PROD_BASELINE_2026-07-19.md`](CURRENT_PROD_BASELINE_2026-07-19.md). Provider-side
  physical encryption оставлено `unknown` до письменного ответа Selectel.
- Добавлен [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md): конкретные действия `O-01…O-12`, сроки, evidence, тикет Selectel,
  brief внешнему специалисту и запреты на ручной in-place/cutover flow.
- Добавлен `CRYPTO-01`: threat/key ADR, versioned envelope, S3 multipart/HLS client-side encryption, legacy migration,
  selected DB field/settings protection и key rotation/recovery.
- Добавлен `INFRA-01`: новый параллельный encrypted VPS, disposable reboot/recovery proof, dark target, phased
  cutover/rollback, secret rotation и decommission старого host/copies.
- Исправлен недостижимый Selectel S3 gate: Bucket Encryption, Lifecycle и Public Access Block не считаются
  поддерживаемыми AWS controls; plan требует client-side encryption, actual anonymous deny, application retention,
  version-aware deletion и отдельный backup Object Lock proof.
- Legal audit усилил `G-02`: обычный checkbox не объявляется достаточным письменным согласием на health data;
  форму/ЭП/основание/представителей/legacy data до кода определяет юрист. Добавлены `G-04A`, `G-06A`, `G-13`, `G-14`.
- Уточнено: 24/72 workflow относится не к любому event, а к применимой установленной неправомерной/случайной
  передаче/доступу с нарушением прав; добавлен ГосСОПКА gate. 90 days/reminders/resumable export отмечены как
  product/contract commitments, не буквальное требование 152-ФЗ.
- Active SaaS/Product UX/billing/DNA/FIO plans и логи не менялись. `CRYPTO-01`/`INFRA-01` остаются sub-stages
  `#898/#900/#901` до owner review; implementation tasks создаются позже с exact file scope и stable D4/S5-7 SHA.

## 2026-07-19 — final plan audit correction

- Независимый infra/plan auditor дал FAIL из-за риска stale-DB rollback и четырёх major gaps; исправления выполнены
  одним интегрированным docs-pass без второго nit-picking audit round.
- `INFRA-01` теперь запрещает возврат DNS на stale source после первой записи на target: target writers freeze →
  новый encrypted backup/delta → restore rollback host → invariants → только затем traffic switch.
- Убран циклический gate: `I0-I4` не ждут `O-10/G-11`; production window требуется только `I5` после rehearsal и
  `PR-04A`.
- `PR-03` разделён на обязательный pre-launch `PR-03A` (manual requests, retention, purge disabled) и pre-purge
  `PR-03B` (export/reminders/purge/offboarding automation). Launch deferral не закрывает инициативу целиком.
- `DR-01` получил отдельную вторую российскую failure domain для encrypted S3 media ciphertext + manifests и
  сценарий потери bucket/account, а не только versioning в primary bucket.
- Owner wording исправлен: необходимость certified СЗИ/СКЗИ определяет внешний специалист; владелец заказывает
  заключение и принимает бюджет/остаточный риск. Отдельный secrets platform не запрещён до crypto ADR.
- Оценка `CRYPTO-01` увеличена до 3–6 недель; общая инженерная оценка — 13–22 человеко-недель.
