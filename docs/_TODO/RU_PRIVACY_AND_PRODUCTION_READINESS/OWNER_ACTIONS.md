# Owner actions — что требуется от владельца и когда

Этот файл — точка входа для ответа на вопрос: **«Что именно сейчас должен сделать владелец?»** Любой агент перед
ответом читает `OWNER_ACTIONS.md`, [`OWNER_AND_LEGAL_GATES.md`](OWNER_AND_LEGAL_GATES.md), последние записи
[`LOG.md`](LOG.md) и taskdb `#898–#909`. Агент не объявляет пункт выполненным по переписке в чате: нужен артефакт,
дата и ссылка/защищённое местонахождение.

Статусы: `NOW` — можно/нужно делать без ожидания кода; `AFTER PACKET` — агент сначала готовит пакет; `WINDOW` —
действие только в согласованное окно; `FINAL` — перед GO.

## Как агент отвечает владельцу

На вопрос «что мне делать сейчас?» агент:

1. проверяет taskdb `#898–#909`, `LOG.md` и статусы `O-*`;
2. выдаёт сначала только незакрытые `NOW`, затем ближайший `AFTER PACKET`;
3. по каждому пункту говорит: куда обратиться, что отправить, что получить и какой stage блокируется;
4. если packet ещё не готов, агент сначала готовит его и не перекладывает исследование на владельца;
5. не просит secret values/ПДн в чат и не помечает `open → decided` без evidence/provenance.

## 1. Лист действий

| ID | Статус | Когда | Что делает владелец лично | Что до этого готовят ИИ-агенты | Доказательство закрытия |
|---|---|---|---|---|---|
| `O-01` | `open` | `NOW` | Назначает ответственного за обработку ПДн, ответственного за безопасность ИСПДн и выбирает внешнего юриста/специалиста | Краткий system/data-flow brief без ПДн, список вопросов `G-01…G-06A` | ФИО/роль/контакт в закрытом реестре, договор/задача, дата review |
| `O-02` | `open` | `NOW` | Отправляет Selectel тикет по шаблону ниже | Агент подставляет только non-secret project/service identifiers | Номер тикета, полный ответ и приложенные акты в защищённом хранилище |
| `O-03` | `open` | `NOW` | Проверяет статус уведомления РКН и вместе с ответственным решает: подать/актуализировать/оставить | `PR-01` даёт фактические цели, категории, системы, подрядчиков и регионы | Номер/дата уведомления либо письменное заключение «изменение не требуется» |
| `O-04` | `open` | `NOW` | Даёт юристу фактическую ролевую схему: платформа, клиника, специалист, пациент; утверждает interim containment | `PR-01` готовит operator/processor matrix и перечень текущих health-data flows | Закрытые `G-01`, `G-02`, `G-04`, `G-05A` с provenance |
| `O-05` | `open` | `AFTER PACKET` | Утверждает RPO/RTO, backup retention, вторую российскую площадку и бюджет | Агенты определяют совместимые слои: dump/`age`/`restic` offsite и, если нужен PITR, `pgBackRest`; считают storage/traffic | Решение `G-07`, заказанный storage/project и non-secret endpoint/region |
| `O-06` | `open` | `AFTER PACKET` | Выбирает модель unlock/key custody: кто и как разблокирует сервер после reboot, кто держит recovery key | `CRYPTO-01` даёт 2–3 проверенных варианта, failure modes и rehearsal result | Подписанная key-custody схема; две независимые recovery copies проверены |
| `O-07` | `open` | `AFTER PACKET` | Покупает новый Selectel VPS/volume и отдельный backup target после утверждения архитектуры | `INFRA-01` выдаёт точную спецификацию CPU/RAM/disk/region/network без секретов | Project/resource IDs в защищённом ops registry; подтверждена РФ-локация |
| `O-08` | `open` | `AFTER PACKET` | Заказывает внешнее заключение о необходимости certified СЗИ/СКЗИ, аттестации/аттестованного облака; принимает бюджет и остаточный риск, но не подменяет специалиста | Внешний специалист получает threat model, topology и control matrix `PR-04` | Заключение специалиста; закрытый `G-06` |
| `O-09` | `open` | `AFTER PACKET` | Утверждает прикладную модель шифрования S3 и допустимое изменение upload/playback UX/performance | Агенты дают proof для large upload, HLS/range, recovery и key rotation | Architecture decision `CRYPTO-01`, performance budget, migration approval |
| `O-10` | `open` | `WINDOW` | Назначает production window, владельца GO и владельца rollback; присутствует на cutover | Агенты закрывают TEST rehearsal, encrypted backup restore, cutover/rollback runbooks | `G-11`, дата/канал связи, критерии abort, подтверждённый rollback authority |
| `O-11` | `open` | `WINDOW` | Хранит/проверяет offline recovery material и подтверждает финальную ротацию секретов | Агенты генерируют inventory без значений и пошаговый rotation checklist | Recovery drill + rotation evidence без секретов в git/logs |
| `O-12` | `open` | `FINAL` | Вместе с внешним reviewer принимает GO/NO-GO и остаточные риски | Агенты собирают `FINAL_ACCEPTANCE` и evidence index на точный release SHA/topology | Закрытый `G-12`, подписи/даты, residual risk owner/deadline |

## 2. Письмо/тикет Selectel

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

- Не выполняет импровизированную LUKS-конвертацию живого root-диска.
- Не копирует ключи/дампы через чат, git, taskdb или обычный email.
- Не включает S3 versioning/Object Lock до готовности app purge/retention contract.
- Не запускает cutover по фрагментам команд из переписки: только принятый runbook с preflight/abort/rollback.
- Не принимает формулировку «полностью соответствует 152-ФЗ» только по факту использования Selectel.

## 5. Официальные провайдерские источники для ответа

- [Selectel: Cloud Servers и 152-ФЗ](https://docs.selectel.ru/cloud-servers/about/152-fz-cloud-server/)
- [Selectel: описание Cloud Servers](https://docs.selectel.ru/cloud-servers/about/about-cloud-server/)
- [Selectel: S3 и 152-ФЗ](https://docs.selectel.ru/s3/about/152-fz-s3/)
- [Selectel: акт оценки эффективности](https://files.selectel.ru/docs/ru/performance-assessment-act-for-cloud.pdf)
- [Selectel: S3 API compatibility](https://docs.selectel.ru/en/api/object-storage-s3/)
- [Selectel: LUKS disk encryption guide](https://docs.selectel.ru/en/security-guide/data-encryption/)
- [Selectel: shared responsibility](https://docs.selectel.ru/en/security-guide/areas-of-responsibility/)

Дата последней проверки ссылок: 2026-07-19. Публичная страница не заменяет договорный ответ по конкретному проекту.
