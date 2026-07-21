# Owner and legal gates

Статус каждого решения: `open` → `decided` либо `cancelled`. Ответ должен содержать дату, автора и ссылку на
протокол/договор/задачу. Агент не подменяет решение предположением.

| ID | Решение | Рекомендованный safe default | Кто закрывает | Нужен до |
|---|---|---|---|---|
| `G-01` | Кто для каждой цели является оператором, совместным оператором или обрабатывает по поручению: платформа, клиника, специалист | Разделить роли по фактической цели; не объявлять платформу «только процессором» для собственных целей billing/security | владелец + юрист | завершение `PR-01` |
| `G-02` | Правовое основание и форма согласия для сведений о здоровье; способ подтверждения личности/воли | Из-за фактической обработки специальной категории базовый путь считать письменным согласием, пока юрист не подтвердил конкретное исключение; электронный эквивалент и вид ЭП определяет юрист. Checkbox/session audit не объявлять достаточным | юрист + владелец | старт кода `PR-02` |
| `G-03` | Retention по классам данных и допустимые исключения удаления | Минимальный документированный срок по каждой цели; запрет «хранить бессрочно» без основания | юрист + владелец домена | schema design `PR-03` |
| `G-04` | Для каждого фактически включённого получателя/подрядчика: Telegram, MAX, SMTP/email, SMS, OAuth/Google Calendar, payment и S3 — категории/содержание, роль, договор/поручение, регион/трансграничность, logs/support access, subprocessors, incident/deletion clauses | Не передавать клиническое содержание внешнему каналу; наличие adapter/config не доказывает включение, регион или допустимость; неизвестный регион/роль = блокирующий вопрос | владелец + юрист | завершение `PR-01` |
| `G-04A` | Поручение Selectel и применимость актов к конкретным VPS/volume/image/snapshot/backup/S3; география copies, provider encryption, deletion и противоречие обычного/аттестованного облака для УЗ-1/УЗ-2 | До письменного ответа не считать provider compliance закрытым; использовать готовый тикет из `OWNER_ACTIONS` | владелец + Selectel + юрист | покупка target VPS и `INFRA-01/I0` |
| `G-04B` | Роли, договоры и трансграничная передача Apple/Google/APNs/FCM: device token, IP/device metadata, payload text, region/retention/subprocessors | До заключения не передавать raw clinical/free text; использовать `T0–T2` allowlist, `T3` neutral event copy; provider TEST/PROD и store privacy declarations ждут письменного review | владелец + юрист/ПДн specialist | `NTF-01/N2`, `MOB-03/05` |
| `G-05` | Статус уведомления РКН и актуальность сведений в реестре: сверка целей, субъектов/категорий (включая health), операций, систем/местонахождения баз, получателей и трансграничных потоков с factual register | Немедленно сверить фактический register, а не только наличие записи; решение о подаче/обновлении/отсутствии изменения принимает ответственное лицо | ответственное лицо по ПДн | `PR-01`, не откладывать до release gate |
| `G-05A` | Dated interim legal containment до нового consent lifecycle: продолжение текущей health-data processing, применимое основание, scope/owner/review trigger и запрет расширения | До письменного решения не добавлять новые цели обработки health data, новых получателей/подрядчиков или onboarding новых организаций с health data; продолжение текущей обработки отдельно подтверждает владелец/юрист | владелец + юрист | немедленно в `PR-01` |
| `G-06` | Границы ИСПДн, модель угроз, уровень защищённости и необходимость аттестации/сертифицированных средств | Определяет внешний специалист после инвентаризации, не агент | специалист по защите ПДн | `PR-04` |
| `G-06A` | Ответственные, локальные акты, перечень допущенных лиц, конфиденциальность, обучение и внутренний контроль | Технический checklist без организационных мер не закрывает readiness | владелец + ответственное лицо + юрист | pre-release `PR-04A` |
| `G-06B` | Нужен ли runtime EDR/HIDS (`Wazuh`/эквивалент) сверх `auditd` + AppArmor + central logs | Не устанавливать агент вслепую. После модели угроз выдать явный verdict: `adopt` / `not required with compensating controls` / `blocked`; назвать покрываемые угрозы, RU log location, alert owner/SLA, root privileges, resource budget и rollback | специалист по ИБ + владелец/архитектор | `INFRA-01/I3`, затем `PR-04A` |
| `G-07` | RPO/RTO, срок backup retention и российская offsite цель | RPO ≤24 ч, RTO ≤8 ч как временный engineering target; владелец утверждает стоимость и бизнес-допуск | владелец | реализация `DR-01` |
| `G-08` | Host firewall implementation | Selectel SG как внешний слой + один host firewall (`nftables`), не смешивать с UFW | владелец/архитектор | TEST `SEC-02` |
| `G-09` | Централизованное хранилище security logs и срок | Российский sink, least-privilege append, без clinical payload; конкретный сервис после cost/access review | владелец | `SEC-04` |
| `G-10` | Break-glass владельца платформы: условия, MFA, срок, аудит | Disabled-by-default, time-bound grant, причина, second-person alert/review | владелец | `SEC-04` |
| `G-11` | Production change window и rollback authority | Только после TEST proof и backup restore; один ответственный за go/rollback | владелец | каждый prod mutation |
| `G-12` | Итоговый legal/technical residual-risk acceptance | Никакого auto-accept; незакрытый high risk = no-go либо письменное решение владельца с deadline | владелец + внешний reviewer | `PR-04` |
| `G-13` | Disk layout и key custody: full-root LUKS2 или полный encrypted data boundary; manual/remote unlock; recovery copies и ответственные | In-place conversion текущего root запрещён по умолчанию; ключ не хранится на том же открытом диске | владелец + архитектор + внешний reviewer | `CRYPTO-01/C0`, покупка target VPS |
| `G-14` | S3 application encryption architecture и допустимые latency/cost/UX trade-offs | Новые health objects не пишутся plaintext; versioning только после delete-all-versions capability | владелец + архитектор | `CRYPTO-01/C2` implementation |
| `G-15` | Product channel/content policy: где остаются login codes, куда идут reminders/notifications и общий подход к push preview | Owner ruling ниже закрывает channel topology и отказ от blanket masking; exact event/field matrix готовят агенты и принимает/корректирует владелец после census, provider legality отдельно `G-04B` | владелец + архитектор | `NTF-01/N1` topology; content builders до `MOB-O9` |

## Формат решения

### Product direction, 2026-07-19 — `G-15 decided`

- Telegram/MAX остаются только для login/bind code и минимального auth handshake. Mini-app/product menu, chat,
  reminders, booking callbacks, broadcasts, support/admin replies и product notifications выводятся.
- Product notifications/reminders имеют in-app source of truth и доставляются через app push: Web Push для browser/
  PWA на переходе, APNs/FCM для полноценного native app.
- Отсутствие push target/permission не разрешает fallback в Telegram/MAX/email/SMS. Пользователь видит in-app
  state; система видит `no_active_target` и предлагает включить push.
- Полностью скрывать любой текст не требуется: push должен оставаться полезным, а не сводиться к одинаковому
  «что-то произошло».

Engineering safe default до `MOB-O9/G-04B`, а не дословное дополнительное решение владельца: разрешать routine
date/time/payment/subscription/reminder details; raw arbitrary clinical/chat/intake/task/file/secret payload оставлять
внутри authenticated app; email/SMS allowlist service messages и operator monitoring держать отдельно от product
reminder fallback. Exact event/field matrix после census принимает или корректирует владелец одним пакетом.

`G-15` не закрывает `MOB-O9` и `G-04B`: owner product direction не подменяет exact field-level acceptance и правовую
оценку Apple/Google/APNs/FCM payload/metadata flows.

### Product direction, 2026-07-19 — частично фиксирует `G-03`

- Владелец запретил немедленное удаление клиентских данных при удалении аккаунта: сначала аккаунт переходит в
  восстановимый период, данные и файлы сохраняются, после чего разрешён контролируемый purge/anonymize.
- Предварительный product target recovery window — 90 дней. Это не закрывает `G-03`: точные сроки по классам
  данных, legal hold, audit/payment/backups и допустимые исключения подтверждают владелец и юрист до schema design.
- Никакого «тихого» purge: до конца окна нужны несколько email-предупреждений и возможность получить time-bound
  ссылку на export bundle. В bundle входят исходные файлы практики/пациентов и исходные видео; внутренние HLS-
  производные, previews и служебные transcripts не выдаются как отдельные пользовательские originals.
- Техническая выгрузка не реализуется в текущем SaaS-этапе, но обязательна до включения необратимого purge.
- Первый production launch не блокируется отсутствием large-export UX при условии, что необратимый purge остаётся
  выключенным. Для аккаунтов в несколько гигабайт выгрузка должна быть возобновляемой/частичной либо использовать
  эквивалентный надёжный механизм, а не требовать один монолитный архив.
- Recovery period, cadence/ошибки уведомлений, состав bundle, исключения и purge cutoff должны быть прямо отражены
  в оферте/договоре и privacy policy. Точный legal wording остаётся owner+legal gate.

До полного решения `G-03` safe default: никакого немедленного hard delete и никакого purge без reminder/export
evidence; до готовности export capability purge остаётся disabled; policy deadline/cadence хранится как единая
конфигурируемая и аудируемая policy, а не размножается hardcode по route/job.

## Правовые предохранители

- Сведения о здоровье — специальная категория независимо от маркетингового статуса приложения.
- Механизм `PR-02` не проектируется как обычный checkbox: юрист сначала фиксирует основание, письменную форму,
  отдельность текста, обязательные реквизиты, вид электронной подписи/идентификации, представителей и legacy data.
- Таймеры 24/72 относятся к установленной неправомерной/случайной передаче или доступу, повлекшим нарушение прав
  субъектов, а не автоматически к каждому security event. `SEC-04` также включает утверждённый порядок
  взаимодействия с ГосСОПКА для применимого компьютерного инцидента.
- LUKS, client-side encryption и field encryption — инженерные controls; статус сертифицированного средства им
  присваивает только применимое заключение, не агент.

```text
Gate: G-xx
Decision: ...
Reason: ...
Approver: ...
Date: YYYY-MM-DD
Evidence/task: ...
Revisit trigger: ...
```
