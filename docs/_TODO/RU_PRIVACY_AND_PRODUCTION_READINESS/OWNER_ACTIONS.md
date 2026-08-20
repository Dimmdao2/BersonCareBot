# Owner actions — что требуется от владельца и когда

Этот файл — точка входа для ответа на вопрос: **«Что именно сейчас должен сделать владелец?»** Любой агент перед
ответом читает `OWNER_ACTIONS.md`, [`OWNER_AND_LEGAL_GATES.md`](OWNER_AND_LEGAL_GATES.md), последние записи
[`LOG.md`](LOG.md) и taskdb `#898–#909`. Агент не объявляет пункт выполненным по переписке в чате: нужен артефакт,
дата и ссылка/защищённое местонахождение.

Статусы: `NOW` — можно/нужно делать без ожидания кода; `AFTER PACKET` — агент сначала готовит пакет; `WINDOW` —
действие только в согласованное окно; `FINAL` — перед GO.

## 0. Текущий короткий список — 2026-07-22

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Это owner-facing snapshot; полный реестр `O-*` ниже сохраняет детали и evidence. В список `NOW` не попадают
отложенные продуктовые идеи, будущая TEST-приёмка без актуального deploy и production windows.

### От владельца сейчас

- [ ] **`O-01 / #899`: назначить ответственного за ПДн, ответственного за безопасность ИСПДн и внешнего
      юриста/ПДн-специалиста.** Без этого нельзя завершить PR-01 и получить правовые решения для consent/retention.
- [x] **`O-02 / G-04A`: отправить Selectel тикет по готовому шаблону §2.** ЗАКРЫТО 2026-08-17: письменный ответ
      получен и сохранён целиком в [`EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md`](EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md).
      Ключевое: стандартное защищённое облако покрывает спецкатегории до УЗ-1 (аттестованное облако/А-ЦОД не нужны);
      провайдер дисков **не шифрует** — это наша зона; удаление ресурсов необратимо и без резервных копий.
      Открытые хвосты — подписание Поручения и запрос письма об адресах ЦОД — перечислены в §6 того файла.
- [ ] **`O-03 / G-05`: передать ответственному текущую запись/уведомление РКН и сверить её с factual register.**
      Результат — update/file/no-change с датой и основанием.
- [ ] **`O-04 / G-01/G-05A`: передать юристу factual role/process matrix и письменно решить interim processing
      health data.** До решения не расширять health purposes/vendors и onboarding новых организаций с health data.
- [ ] **`#848 / SCH-G5`: выбрать семантику дней без ручного графика:** клиенту показывать пусто/строго по графику
      либо использовать fallback на недельные часы. Остальные UI residual это не блокирует.
- [ ] **`#881`: подтвердить отзыв/ротацию старых Rubitime и Telegram/webhook credentials**, найденных только в git
      history; после подтверждения выбрать history rewrite либо датированное исключение. Значения credentials в чат не
      присылать.

### От владельца перед соответствующим этапом, не обязательно сейчас

- [ ] **`#796 / U5A`:** выбрать product discharge/reactivate per enrollment либо разрешить узкий reversible
      TEST-only harness; отдельно разрешить A↔B TEST walkthrough. Блокирует полный U5A/UI-5b, но не UI-5a `#958`.
- [ ] **`G-07 / O-05`:** после инженерного packet утвердить RPO/RTO, backup retention, российскую offsite-площадку
      и бюджет.
- [ ] **`G-06B/G-13/G-14`:** после ADR/options packet решить EDR/HIDS, disk unlock/key custody и S3 application
      encryption/performance budget.
- [ ] **`G-09/G-10`:** перед SEC-04 выбрать российский security-log sink/retention и правила break-glass.
- [ ] **Payment/C5B:** после provider/reality packet утвердить реальный PSP, кассово-фискальный контур и допустимые
      cash/invoice/pay-link/QR/refund operations. До этого payment UI остаётся скрытым.
- **SUPERSEDED 2026-07-27:** owner сам переоткрыл и заменил channel topology; см. строку **«Уведомления»** в [`CURRENT_AUTHORITY_MAP.md`](../../CURRENT_AUTHORITY_MAP.md), а не считать тему закрытой этой строкой.
- [ ] **`G-15/MOB-O9`:** после event census принять точную field-level matrix push/email/SMS. Channel topology уже
      решён и повторно не обсуждается.

### От юриста / ответственного по ПДн

- [ ] **`G-01`:** роли platform/clinic/specialist по каждой цели обработки, включая собственные billing/security
      purposes платформы.
- [ ] **`G-02`:** основание и отдельный текст health-data consent; письменная форма, идентификация/вид электронной
      подписи, представители и legacy data. Это блокирует код PR-02 `#907`.
- [ ] **`G-03`:** retention matrix по классам данных, legal holds и исключения для payments/audit/backups/logs;
      recovery/reminder/export/purge policy. Purge до этого остаётся выключенным.
- [ ] **`G-04/G-04A`:** фактически включённые Telegram/MAX/email/SMS/OAuth/payment/S3 recipients — содержание,
      договорная роль, регион/transborder, subprocessors, support/log access, incident/deletion clauses и ответ Selectel.
- [ ] **`G-05/G-05A`:** решение по уведомлению РКН и датированное interim health-processing decision.
- [ ] **`#213`:** юридический текст и доказательный contract рекламного opt-in. Технический baseline/draft можно
      готовить заранее, но production marketing send без текста/версии/согласия запрещён.
- [ ] **`G-06/G-06A`:** границы ИСПДн, threat model/уровень защиты/certified controls и организационные меры.
- [ ] **`G-04B`:** Apple/Google/APNs/FCM roles, metadata/payload, region/transborder и store privacy wording до
      native-push leg; текущий Web Push/N1 этим не блокируется.
- [ ] **`G-12`:** финальная внешняя оценка и письменный residual-risk GO/NO-GO перед release.

### Только по отдельному owner-approved окну

- [ ] **TEST mutation/rehearsal:** отдельное явное разрешение на точный TEST target, SHA, runbook и rollback;
      это самостоятельный TEST gate, не production `G-11`.
- [ ] **`G-11`:** каждое production host/DB/cutover mutation получает отдельное production window, точный SHA,
      runbook, backup/restore, abort criteria и назначенных GO/rollback owners.
- [ ] **FIO `#857`:** hash-bound fresh preview и отдельное production apply window внутри общего финального cutover;
      `#858` стартует только после reconciliation.
- [-] ~~**Rubitime R5/R6/R7:** disable → cutoff/drain → archive/drop проходят раздельные owner gates~~ —
      ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-29: «Rubitime у нас больше нет». Retirement завершён 2026-07-27;
      архивные команды не исполнять, provider-neutral cleanup вести отдельным workstream.
- [ ] **INFRA/CRYPTO/SEC/DR production activation/decommission:** только после соответствующих packets, TEST proof
      и отдельного `G-11` production window. Покупка target VPS/offsite resources выполняется раньше как `AFTER PACKET`
      (`O-05/O-07`), а не считается production window.

### Сейчас не спрашивать владельца

- Expanded online-booking `#215` отложен до будущего отдельного ТЗ; встроенная Online location исполняется без него.
- Старый TEST task `#821` предъявляется владельцу только после следующего актуального code-only TEST milestone;
  проверять прежний SHA сейчас не требуется.
- Broadcast bundle `#90` и общий error/toast backlog `#206` не являются текущими owner questions; их следующий
  scope формирует оркестратор из уже принятых решений.
- FIO production, native push, PR-04 и final cutover не запрашиваются до готовности их packets/gates.

## Как агент отвечает владельцу

На вопрос «что мне делать сейчас?» агент:

1. проверяет taskdb `#898–#909`, `LOG.md` и статусы `O-*`;
2. выдаёт сначала только незакрытые `NOW`, затем ближайший `AFTER PACKET`;
3. по каждому пункту говорит: куда обратиться, что отправить, что получить и какой stage блокируется;
4. если packet ещё не готов, агент сначала готовит его и не перекладывает исследование на владельца;
5. не просит secret values/ПДн в чат и не помечает `open → decided` без evidence/provenance.

## 1. Лист действий

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| ID      | Статус | Когда          | Что делает владелец лично                                                                                                                                                                                                                                  | Что до этого готовят ИИ-агенты                                                                                                                          | Доказательство закрытия                                                                                        |
| ------- | ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `O-01`  | `open` | `NOW`          | Назначает ответственного за обработку ПДн, ответственного за безопасность ИСПДн и выбирает внешнего юриста/специалиста                                                                                                                                     | Краткий system/data-flow brief без ПДн, список вопросов `G-01…G-06B`                                                                                    | ФИО/роль/контакт в закрытом реестре, договор/задача, дата review                                               |
| `O-02`  | `closed 2026-08-17` | `DONE`          | Отправляет Selectel тикет по шаблону ниже; ответ получен, сохранён в `EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md`                                                                                                                                                                                                                  | Агент подставляет только non-secret project/service identifiers                                                                                         | Номер тикета, полный ответ и приложенные акты в защищённом хранилище                                           |
| `O-03`  | `open` | `NOW`          | Передаёт ответственному за ПДн текущую запись/уведомление РКН и сверяет с factual register: цели, субъекты/категории включая health, операции, системы/местонахождение баз, получатели и transborder flows; вместе решает: подать/актуализировать/оставить | `PR-01` даёт source-backed факты и явно помечает unconfirmed runtime/vendor/region, не даёт правовой verdict                                            | Номер/дата уведомления либо датированное письменное заключение «изменение не требуется» с сопоставлением scope |
| `O-04`  | `open` | `NOW`          | Даёт юристу factual role/process matrix: платформа, клиника, специалист, пациент; утверждает отдельное dated interim решение о продолжении текущей health-data processing, основании, scope, owner и review trigger                                        | `PR-01` готовит source-backed processing register, candidate own-platform purposes и перечень health-data flows; не присваивает operator/processor role | Закрытые `G-01`, `G-02`, `G-04`, `G-05A` с provenance                                                          |
| `O-04B` | `open` | `AFTER PACKET` | Передаёт юристу/ПДн specialist договоры и privacy terms Apple/Google/FCM/APNs; принимает допустимый payload/region/vendor path                                                                                                                             | Агенты готовят exact token/metadata/payload register, `T0–T3` matrix и provider alternatives/limitations                                                | Закрытый `G-04B`, vendor/transborder register, store privacy wording                                           |
| `O-05`  | `open` | `AFTER PACKET` | Утверждает RPO/RTO, backup retention, вторую российскую площадку и бюджет                                                                                                                                                                                  | Агенты определяют совместимые слои: dump/`age`/`restic` offsite и, если нужен PITR, `pgBackRest`; считают storage/traffic                               | Решение `G-07`, заказанный storage/project и non-secret endpoint/region                                        |
| `O-06`  | `open` | `AFTER PACKET` | Выбирает модель unlock/key custody: кто и как разблокирует сервер после reboot, кто держит recovery key                                                                                                                                                    | `CRYPTO-01` даёт 2–3 проверенных варианта, failure modes и rehearsal result                                                                             | Подписанная key-custody схема; две независимые recovery copies проверены                                       |
| `O-07`  | `open` | `AFTER PACKET` | Покупает новый Selectel VPS/volume и отдельный backup target после утверждения архитектуры                                                                                                                                                                 | `INFRA-01` выдаёт точную спецификацию CPU/RAM/disk/region/network без секретов                                                                          | Project/resource IDs в защищённом ops registry; подтверждена РФ-локация                                        |
| `O-08`  | `open` | `AFTER PACKET` | Заказывает внешнее заключение о необходимости certified СЗИ/СКЗИ, аттестации/аттестованного облака; принимает бюджет и остаточный риск, но не подменяет специалиста                                                                                        | Внешний специалист получает threat model, topology и control matrix `PR-04`                                                                             | Заключение специалиста; закрытый `G-06`                                                                        |
| `O-08A` | `open` | `AFTER PACKET` | Принимает предложение `EDR/HIDS adopt/reject` и бюджет эксплуатации; назначает человека, который реагирует на alerts                                                                                                                                       | Агенты дают threat-coverage matrix `auditd/AppArmor/logs` vs `Wazuh`/эквивалент и disposable proof выбранного кандидата                                 | Закрытый `G-06B`; при adopt — RU manager/sink и alert owner, при reject — перечисленные compensating controls  |
| `O-09`  | `open` | `AFTER PACKET` | Утверждает прикладную модель шифрования S3 и допустимое изменение upload/playback UX/performance                                                                                                                                                           | Агенты дают proof для large upload, HLS/range, recovery и key rotation                                                                                  | Architecture decision `CRYPTO-01`, performance budget, migration approval                                      |
| `O-10`  | `open` | `WINDOW`       | Назначает production window, владельца GO и владельца rollback; присутствует на cutover                                                                                                                                                                    | Агенты закрывают TEST rehearsal, encrypted backup restore, cutover/rollback runbooks                                                                    | `G-11`, дата/канал связи, критерии abort, подтверждённый rollback authority                                    |
| `O-11`  | `open` | `WINDOW`       | Хранит/проверяет offline recovery material и подтверждает финальную ротацию секретов                                                                                                                                                                       | Агенты генерируют inventory без значений и пошаговый rotation checklist                                                                                 | Recovery drill + rotation evidence без секретов в git/logs                                                     |
| `O-12`  | `open` | `FINAL`        | Вместе с внешним reviewer принимает GO/NO-GO и остаточные риски                                                                                                                                                                                            | Агенты собирают `FINAL_ACCEPTANCE` и evidence index на точный release SHA/topology                                                                      | Закрытый `G-12`, подписи/даты, residual risk owner/deadline                                                    |

## 2. Письмо/тикет Selectel

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Владелец отправляет через авторизованный кабинет Selectel. Агент может заполнить названия услуг, но не отправляет
письмо от имени владельца и не помещает account IDs/договоры в git.

```text
Тема: Подтверждение мер и границ ответственности по 152-ФЗ для конкретного проекта

Мы используем либо до запуска планируем использовать Cloud Server/VPS, сетевой диск/volume, snapshots/backup
services и S3 в регионе РФ для ИСПДн, которая обрабатывает сведения о состоянии здоровья — специальную категорию ПДн.

Просим письменно подтвердить применительно к нашему конкретному договору, проекту и услугам:
1. Какие актуальные заключения/акты по 152-ФЗ применимы к Cloud Server, volumes, images, snapshots, scheduled
   backups и S3; до какого уровня защищённости и при каких ограничениях.
   Просим отдельно разрешить противоречие: на странице
   https://docs.selectel.ru/cloud-servers/about/152-fz-cloud-server/ указана возможность до УЗ-1, а описание
   https://docs.selectel.ru/cloud-servers/about/about-cloud-server/ рекомендует для УЗ-1/УЗ-2 аттестованное облако.
   Нужен ответ, какой документ и продукт применимы к нашему проекту после определения уровня защищённости.
2. Где физически находятся primary, replica, service, snapshot, backup, log и disaster-recovery copies; покидает
   ли какая-либо копия территорию РФ.
3. Используется ли provider-side encryption at rest для физических носителей, volumes, images, snapshots,
   scheduled backups и S3; кто управляет ключами, что покрывает и чего не покрывает это шифрование.
4. Какие customer-controlled encryption варианты поддерживаются для boot/root/data volumes; поддерживается ли
   штатный reboot/console/recovery для LUKS2 и какие ограничения есть у remote unlock.
5. Какие S3 функции фактически поддерживаются: client-side encryption, versioning, Object Lock, lifecycle,
   access logging/audit; как удаляются старые версии и физические копии.
   Мы понимаем, что S3 API Selectel не поддерживает Bucket Encryption, Bucket Lifecycle и Public Access Block;
   просим подтвердить provider-side меры ниже S3 API и доступные заказчику доказательства.
6. Как оформляется поручение обработки ПДн/роль провайдера, перечень субподрядчиков и обязанность уведомлять нас
   об инциденте; сроки и защищённый канал уведомления.
7. Как подтверждается необратимое удаление server/volume/snapshot/backup/S3 copies после расторжения/миграции.
8. Какие customer controls обязательны в нашей зоне ответственности, чтобы ссылка на соответствие услуги
   152-ФЗ оставалась применимой.

Просим приложить актуальные документы, указать их версии/даты и явно отметить ответы, которые зависят от
конкретного тарифа, availability zone или дополнительной услуги.
```

## 3. Brief внешнему специалисту

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Передать специалисту: фактические категории/цели/субъекты, topology, data-flow register, роли platform/clinic,
tenant model, перечень систем/подрядчиков, current baseline, proposed LUKS/client-side encryption/key custody,
backup/incident runbooks. Запросить письменный ответ:

1. границы ИСПДн и тип актуальных угроз;
2. требуемый уровень защищённости по ПП №1119;
3. адаптированный перечень мер приказа ФСТЭК №21;
4. нужны ли сертифицированные СЗИ/СКЗИ или аттестация и для каких controls;
5. достаточно ли предложенных компенсирующих мер и какие gaps блокируют запуск;
6. требуется ли отдельная форма согласия/основание для конкретных health-data flows;
7. какие документы/журналы/проверки должны храниться как evidence.

## 4. Что владелец не делает вручную

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Не выполняет импровизированную LUKS-конвертацию живого root-диска.
- Не копирует ключи/дампы через чат, git, taskdb или обычный email.
- Не включает S3 versioning/Object Lock до готовности app purge/retention contract.
- Не запускает cutover по фрагментам команд из переписки: только принятый runbook с preflight/abort/rollback.
- Не принимает формулировку «полностью соответствует 152-ФЗ» только по факту использования Selectel.

## 5. Официальные провайдерские источники для ответа

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [Selectel: Cloud Servers и 152-ФЗ](https://docs.selectel.ru/cloud-servers/about/152-fz-cloud-server/)
- [Selectel: описание Cloud Servers](https://docs.selectel.ru/cloud-servers/about/about-cloud-server/)
- [Selectel: S3 и 152-ФЗ](https://docs.selectel.ru/s3/about/152-fz-s3/)
- [Selectel: акт оценки эффективности](https://files.selectel.ru/docs/ru/performance-assessment-act-for-cloud.pdf)
- [Selectel: S3 API compatibility](https://docs.selectel.ru/en/api/object-storage-s3/)
- [Selectel: LUKS disk encryption guide](https://docs.selectel.ru/en/security-guide/data-encryption/)
- [Selectel: shared responsibility](https://docs.selectel.ru/en/security-guide/areas-of-responsibility/)

Дата последней проверки ссылок: 2026-07-19. Публичная страница не заменяет договорный ответ по конкретному проекту.
