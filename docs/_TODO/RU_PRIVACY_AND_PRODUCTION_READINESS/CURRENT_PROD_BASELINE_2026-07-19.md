# Current PROD security baseline — 2026-07-19

Статус: подтверждённый read-only снимок текущего production-хоста `adelaide`. Значения секретов, ПДн, дампы и
полные журналы в этот файл не помещаются. Снимок описывает гостевую ОС и доступные S3 controls; внутреннее
шифрование физических носителей Selectel без письменного ответа провайдера не подтверждено и не опровергнуто.

## 1. Подтверждённые факты и маршрутизация

| Факт | Риск/смысл | Куда исправляется | Срочность |
|---|---|---|---|
| Root-диск — обычный `ext4`, LUKS/dm-crypt отсутствует | PostgreSQL, env, logs, backups и swap не имеют customer-controlled encryption at rest | `INFRA-01` | до финального SaaS PROD |
| Swap расположен на том же незашифрованном root | Чувствительные страницы памяти могут попасть на диск | `INFRA-01` | до переноса |
| PostgreSQL 16 слушает только loopback; внешний `5432` закрыт | Периметр БД хороший, но это не шифрование файлов БД/WAL/temp | `SEC-02`, `INFRA-01` | сохранить invariant |
| PostgreSQL `data_checksums=off` | Ниже способность обнаруживать повреждение страниц | `INFRA-01` на новом кластере | при создании кластера |
| 93 локальных dump-файла не зашифрованы; большинство `0664`, каталоги в основном `0755` | Любой локальный пользователь может читать копии; критический containment gap | `DR-01` | немедленно после `G-11` |
| `postgres-backup.sh` не задаёт `umask 077`, encryption/checksum/offsite/restore gate | Новые открытые копии продолжают создаваться | `DR-01` | код сейчас, PROD после gate |
| S3 bucket не имеет публичного ACL/policy allow | Бакет закрыт от анонимного доступа | сохранить | постоянно |
| У bucket/object нет customer-visible server-side encryption; versioning/Object Lock не включены | Приватность бакета не равна шифрованию; удаление/rollback слабее | `CRYPTO-01`, `DR-01` | до health-media launch |
| [Selectel S3](https://docs.selectel.ru/en/api/object-storage-s3/) не поддерживает Bucket Encryption и Lifecycle API | Нельзя планировать AWS-функции, которых нет; нужны client-side encryption и собственный retention job | `CRYPTO-01`, `DR-01` | design gate |
| SSH допускает root и password authentication | Публичный credential/bruteforce path | `SEC-02` | высокий |
| Host firewall фактически default-allow; `auditd`/fail2ban не активны | Selectel SG остаётся единственным явным perimeter layer; host-level containment/audit отсутствуют | `SEC-02` | высокий |
| API/worker/scheduler/media-worker работают от root; root-сервисы исполняют deploy-writable code | Компрометация deploy/release path может стать root compromise | `SEC-02`, `INFRA-01` | критический |
| systemd sandbox controls почти отсутствуют; security score `UNSAFE` | Слабая изоляция процессов и файловой системы | `SEC-02` | высокий |
| `/opt/env/bersoncarebot` закрыт `0700`, env-файлы `0600` | Права не world-readable; надо сохранить и разделить consumers | `SEC-02` | invariant |
| В sudoers нет literal `ALL`, но разрешены широкие root-команды (`systemctl`, `sed`, `nginx`, `apt-get`) | Фактическая граница deploy слабее описанной в старом runbook и близка к root-equivalent | `SEC-02` | критический |
| Некоторые SQL error logs могут содержать query params | Возможна вторичная копия ПДн/секретов в journal | `SEC-02`, `SEC-04` | высокий |

## 2. Что снимок не доказывает

- Он не доказывает, что физический storage Selectel хранится в открытом виде: guest VM этого не видит.
- Он не доказывает применимость акта 152-ФЗ ко всем конкретным услугам, проекту, snapshots и backup copies.
- Он не определяет уровень защищённости ИСПДн и необходимость сертифицированных СЗИ/СКЗИ.
- Он не является разрешением менять production. Любая mutation требует TEST/disposable proof и `G-11`.

Selectel прямо относит data security/access control клиента к его зоне в
[shared-responsibility model](https://docs.selectel.ru/en/security-guide/areas-of-responsibility/). Эти вопросы
закрываются письменным запросом Selectel и внешним специалистом по защите ПДн через
[`OWNER_ACTIONS.md`](OWNER_ACTIONS.md).

## 3. Архитектурный вывод для плана

Целевой путь — новый параллельный VPS с проверенным encrypted-at-rest design и контролируемым cutover. In-place
конвертация живого root-раздела в LUKS не является plan default из-за риска потери доступа и сложного rollback.

Минимальный customer-controlled baseline нового хоста:

1. LUKS2 для root либо для отдельного data volume, который охватывает PostgreSQL/WAL/temp, env, чувствительные
   logs, backup staging и swap. Если остаётся незашифрованный root, отдельная проверка доказывает отсутствие на нём
   ПДн и секретов.
2. Ключ разблокировки не находится на том же диске; есть отдельная offline recovery copy и tested unlock runbook.
3. PostgreSQL cluster создаётся с checksums; network остаётся loopback-only.
4. Root-owned release/unit/config, отдельные non-root service users, default-deny SG+nftables и audit controls.
5. Backups шифруются до выхода из staging; S3 health-media шифруется приложением до помещения в object storage.
