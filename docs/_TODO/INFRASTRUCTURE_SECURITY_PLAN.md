# Infrastructure Security Plan

Единственный исполняемый план настройки инфраструктуры и эксплуатационной безопасности BersonCareBot.
Он объединяет прежние `INFRA-01`, `CRYPTO-01`, `DR-01/02`, `SEC-01`, `SEC-02` и инфраструктурную часть
`SEC-04`. Источники сохранены целиком в
[`docs/archive/2026-08-infrastructure-security-consolidation/`](../archive/2026-08-infrastructure-security-consolidation/README.md).

## Граница и источники истины

Этот план отвечает за:

- новый production-host, сеть, SSH, firewall, systemd и service users;
- шифрование дисков, swap, временных данных, S3-объектов и резервных копий;
- S3 topology, key lifecycle, offsite backup и disaster recovery;
- секреты, TLS, журналы, мониторинг, incident response и управление инфраструктурными доступами;
- CI security scanning, dependency scanning, DAST и внешнюю проверку периметра;
- репетицию, cutover, rollback и вывод старой инфраструктуры.

Этот план **не владеет** следующими областями:

- PostgreSQL logins/roles/grants/RLS/SECURITY DEFINER/transaction context/mTLS DB-port contract — только
  [`DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`](DB_PRIVILEGE_LAYER_REBUILD/PLAN.md); этот план использует его принятый
  результат как зависимость и не повторяет его чек-лист;
- admin/support access, SVG, webhook authentication, patient purge и другая продуктовая безопасность —
  [`docs/ARCHITECTURE/SECURITY_CANON.md`](../ARCHITECTURE/SECURITY_CANON.md);
- согласия, права субъектов, сроки законного хранения и юридические документы —
  [`RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md`](RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md);
- точные подтверждённые host paths, units, ports и deploy-команды —
  [`SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md) и
  [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md).

При конфликте действует более позднее owner-решение. Архивные планы и датированные baseline-снимки не исполняются.

## Принятые решения, которые план не переоткрывает

1. Production переносится на **новый параллельный host**, а не шифруется in-place на живом root-диске.
2. Primary, service и backup copies остаются в РФ; provider/topology подтверждаются до покупки и cutover.
3. Patient clinical files отделяются от doctor/CMS content. Client-side encryption применяется к patient store;
   публичная/контентная библиотека не шифруется тем же механизмом только ради формальной галочки.
4. Encryption keys и recovery keys не хранятся рядом с единственной защищаемой копией. Private recovery key для
   backup не остаётся единственным ключом на production-host.
5. EDR/HIDS не считается автоматическим требованием УЗ-3. Нужен risk-based verdict: выбранный agent либо явно
   принятые compensating controls. Manager/evidence sink не размещается только на защищаемом host.
6. Active DAST никогда не запускается против production. Production допускает только отдельно согласованный
   baseline scan; active scan — только synthetic TEST/ephemeral target.
7. Никаких production-действий без отдельного owner GO и подтверждения host `135.106.162.170`.
8. Owner-фраза 03.08 «периметр хоста — не надо» исключала host-настройку из продуктового/code security scope;
   позднее уточнение оставило её на этап построения production-инфраструктуры. Поэтому firewall/SSH/systemd
   находятся только здесь и не превращаются в задачу текущего DB/product workstream.

### Решения владельца 2026-08-17

Приняты по листу развилок; закрывают часть `I0` и меняют формулировки соответствующих пунктов.

9. **Disk layout — вариант A: LUKS2 root.** Весь системный диск шифруется; вариант «открытый root + отдельный
   зашифрованный том» отклонён вместе с его обязанностью машинно доказывать отсутствие ПДн на открытом разделе.
   Закрывает `IS-I0-03`.
10. **Независимая копия — у другого провайдера, не в другом регионе Selectel.** Основание: провайдер письменно
    подтвердил, что удаление ресурса необратимо, резервных копий при удалении нет и защиты от удаления от имени
    владельца нет. Копия в том же аккаунте не переживает компрометацию панели. Ограничивает `IS-I3-04`.
11. **Security log sink живёт в том же независимом контуре, что и offsite backup** — отдельная площадка, отдельные
    credentials «только на дозапись», без отдельного третьего провайдера. Ограничивает `IS-I6-03`.
12. **Массовое шифрование полей БД отклонено.** Поля, по которым идёт поиск и фильтрация, остаются в открытом виде
    под защитой RLS/grants. Отдельно рассматривается шифрование данных **карточки визита** (диагноз, заметки приёма
    и подобное) — они несут сведения о здоровье и не участвуют в поиске по базе. Переформулирует `IS-I2-10`.
13. **Аттестованное облако и А-ЦОД не нужны.** Selectel письменно подтвердил, что стандартное защищённое облако с
    Актом оценки эффективности покрывает спецкатегории ПДн вплоть до УЗ-1. Наша ИСПДн — УЗ-3.
14. **Внешнее «заключение специалиста по ПДн» как обязательный гейт отменено** (владелец 17.08: «в РФ нет таких,
    это обычные юристы»). Вместо него — обоснование мер напрямую по нормативным актам (152-ФЗ, ПП-1119, приказ
    ФСТЭК № 21) с трассировкой «требование → мера → доказательство». Оценка эффективности мер по ст. 19 152-ФЗ и
    п. 6 приказа ФСТЭК № 21 проводится **оператором самостоятельно** — лицензиат ФСТЭК не обязателен для ИСПДн.
    Переформулирует `IS-I0-07`: остаётся независимое техническое ревью crypto/key design, снимается требование
    внешнего regulatory verdict.
15. **RPO в сутки отклонён.** Владелец: потеря дня работы 10 врачей — катастрофа, а не приемлемый риск. Целевой
    RPO — минуты, механизм — непрерывный архив WAL. Ограничивает `IS-I0-04` и `IS-I3-05`.
16. **RTO 2–4 часа, без тёплой реплики.** Восстановление после потери сервера — из бэкапа. Реплика и автоматическое
    переключение отложены с явными условиями включения:
    [`DEFERRED_INFRA_TRIGGERS.md`](DEFERRED_INFRA_TRIGGERS.md) D-1 и D-2. Закрывает `IS-I0-04` в части RTO.
17. **Видео пациента входит в объём шифрования.** Пациенты грузят видео, и врач снимает видео с пациентом на приёме,
    в том числе для индивидуального упражнения в программе. Такое видео — сведения о здоровье конкретного человека,
    оно живёт в пациентском хранилище и не смешивается с публичной библиотекой врача, даже когда используется как
    материал программы. Переопределяет `IS-I2-01`, `IS-I2-03` и `IS-I2-06`.
18. **Модель защиты видео — зашифрованные HLS-сегменты, не пофайловое шифрование в браузере.** Плейлист режется на
    сегменты, каждый сегмент шифруется, ключ выдаёт приложение после проверки прав. Причина: перемотка и постепенная
    загрузка обязаны работать, а полностью браузерное шифрование их ломает и ничего не добавляет — расшифровка при
    транскодировании всё равно происходит у нас. Переиспользуется существующий HLS-конвейер `apps/media-worker`.
19. **Загрузка идёт через контролируемый сервис, не напрямую в S3.** Файл приходит к нам по TLS и шифруется до
    записи в объектное хранилище; открытый файл не появляется ни в S3, ни на незашифрованном диске. Разрешено
    формулировкой `IS-I2-03` («browser-side streaming либо controlled upload service»); выбран второй вариант.
20. **EDR/HIDS не ставится.** Базовый набор — `auditd`, AIDE, `fail2ban`, отправка журналов наружу. Условия
    пересмотра — `DEFERRED_INFRA_TRIGGERS.md` D-3. Закрывает `IS-I0-06`.
21. **Break-glass принят в минимальном виде:** вход root по SSH выключен, работа под именованным пользователем по
    ключу, прямой доступ к боевой базе оборачивается записью во внешний приёмник журналов и уведомлением владельцу.
    Закрывает выбор в `IS-I4-05`.
22. **Архивы живут в S3 второго провайдера, а не на блочном диске второй машины.** `restic` и `pgBackRest` пишут в
    S3 штатно, гигабайт объектного хранилища кратно дешевле гигабайта диска, а versioning и Object Lock дают защиту
    от удаления, которой у диска нет. Обязательное условие: у боевого хоста credentials **без права удаления**, чтобы
    компрометация прода не стирала архив. Вторая машина ужимается до tang, приёмника журналов и Uptime Kuma.
    Уточняет `IS-I3-04`; отменяет расчёт диска в `DEFERRED_INFRA_TRIGGERS.md` D-5.
23. **Диск второй машины (tang) не шифруется; шифруются данные на ней** — они и так приезжают шифротекстом.
    Уточнение, которое обязано остаться в тексте: tang **хранит собственный ключевой материал** — не ключ от диска,
    но половину, без которой разблокировка не происходит. Снапшот этой машины вместе с образом диска у Selectel даёт
    разблокировку, поэтому защитой служит именно разнесение по двум провайдерам. Следствия: tang отвечает только
    боевому адресу, ключи tang ротируемы, второй слот LUKS занят парольной фразой владельца.
24. **Недоступность приёмника архива WAL дольше согласованного порога поднимает алерт.** Без этого RPO ломается
    молча — архив просто перестаёт писаться. Ужесточает `IS-I3-06`.

Ответ провайдера сохранён целиком в
[`RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md`](RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md)
и повторному запросу не подлежит.

## Трассировка инструкции УЗ-3 от 2026-07-28

| Требование инструкции | Текущий владелец |
| --- | --- |
| P0.1 firewall/SSH/fail2ban | §I1 (`IS-I1-02…04`) |
| P0.6 реестр, разделение и ротация секретов | §I4 |
| P0.7 проверенное восстановление и независимая копия | §I3 |
| P1.8 host antivirus | `IS-I1-10`; scanning пользовательских uploads остаётся product security control |
| P1.11 host/application log rotation и вторичные payload copies | host-часть §I6; payload minimization — `LOG-01` privacy/product stage |
| P1.12 TLS policy | `IS-I1-08` |
| P1.13 incident response 24/72 | §I6 |
| P1.14 шифрование и разделение S3 | §I2 |
| P2.1 шифрование production disks | §I0 + §I1 |
| P2.2 независимый security log sink | `IS-I6-03` |
| P2.3 selected DB field encryption | `IS-I2-10`; не смешивается с текущим RLS/grants workstream |
| P2.4 внешний поиск уязвимостей/perimeter scan | §I5 |
| P2.6 единая recovery/retention policy | `IS-I3-12` |

Остальные пункты инструкции — admin/support access, `platform_users` RLS, tenant isolation, webhook/SVG,
patient-file deletion, analytics and broader purge — не потеряны, но принадлежат `SECURITY_CANON`, privacy/product
plans либо текущему отдельному DB privilege plan. В этот документ они намеренно не скопированы.

## I0 — решения и проектирование

- [ ] **IS-I0-01. Data-at-rest map.** Перечислить PostgreSQL data/WAL/temp, swap, logs, env, dumps, patient
      originals/derivatives, CMS/HLS, multipart staging, worker temp и backup copies; для каждого класса назвать
      владельца, угрозу, место хранения, шифрование и срок жизни.
- [ ] **IS-I0-02. Provider/topology packet.** Подтвердить российские регионы всех copies, договорную роль provider,
      target network/SG/VPS/volumes/S3/backup backend и отсутствие неучтённых transborder copies.
      Договорная роль и позиция Selectel закрыты ответом провайдера 17.08 (см. решения 10, 13); открыты официальное
      письмо об адресах ЦОД, подписанное Поручение и выбор второй площадки под решение 10.
- [x] **IS-I0-03. Disk layout.** Владелец 17.08 выбрал **LUKS2 root** (решение 9). Остаётся не выбор, а исполнение:
      проверенный unlock/recovery путь описывается в `IS-I0-05` и доказывается на репетиции `IS-I7-01`.
- [ ] **IS-I0-04. Recovery objectives.** Владелец утверждает RPO, RTO, downtime budget, boot/unlock/recovery owner,
      DNS TTL, критерии abort и срок rollback-host.
- [ ] **IS-I0-05. Key architecture.** Зафиксировать KEK/DEK/recovery hierarchy, key IDs/versions, custody,
      rotate/rewrap/revoke/loss flows и раздельное хранение ciphertext и recovery material.
- [ ] **IS-I0-06. EDR/HIDS verdict.** Для EDR/HIDS принять threat-model-based решение: выбранный agent либо
      проверенные compensating controls. Название продукта само по себе не закрывает меру.
- [ ] **IS-I0-07. Independent review.** Crypto/key design и итоговая матрица инфраструктурных мер проходят
      независимую technical/security оценку. Regulatory sufficiency обосновывается трассировкой на нормативные акты
      (152-ФЗ, ПП-1119, приказ ФСТЭК № 21), оценку эффективности мер оператор проводит самостоятельно — внешний
      «специалист по ПДн» как обязательный гейт снят решением владельца 17.08 (решение 14).

## I1 — host, сеть и процессы

- [ ] **IS-I1-01. Reproducible host build.** Существующие deploy scripts поддерживают идемпотентные
      `preflight/apply/verify/rollback`; ручного параллельного deploy path нет.
- [ ] **IS-I1-02. Host baseline verifier.** Машинно проверяются mounts/LUKS/swap, PG checksums/listen/HBA,
      packages, users/groups, ownership/modes, sudoers, units, sockets, SG/firewall, audit/fail2ban и backup paths.
- [ ] **IS-I1-03. Network default deny.** Selectel SG и один канонический nftables ruleset открывают только 80/443;
      SSH — только approved sources/VPN; PostgreSQL и application ports — loopback/Unix socket. Проверены rollback
      timer, внешний port scan и сохранение правил после reboot.
- [ ] **IS-I1-04. SSH boundary.** После доказанного recovery path: `PermitRootLogin no`,
      `PasswordAuthentication no`, вход по индивидуальным ключам, fail2ban с проверенным ban/unban; shared keys
      запрещены.
- [ ] **IS-I1-05. Service isolation.** Webapp, integrator API/worker/scheduler и media-worker работают под
      отдельными non-root users с минимальными read/write paths. Runtime не меняет root-owned unit, privileged
      script или active release.
- [ ] **IS-I1-06. systemd hardening.** Для каждого unit применены и проверены `NoNewPrivileges`, `PrivateTmp`,
      filesystem/device/capability/address-family restrictions и controlled writable directories; исключения
      перечислены в одном manifest. Отдельно для `media-worker`: `TMPDIR` указывает на дисковый каталог с известным
      размером (не tmpfs — иначе двухгигабайтный ролик уезжает в память), и unit получает `CPUQuota`, потому что
      `ffmpeg` запускается без ограничения потоков и одна задача транскодирования способна занять все ядра
      (`apps/media-worker/src/ffmpeg/hlsArgs.ts` — флага `-threads` нет).
- [ ] **IS-I1-07. Files and packages.** Env, certificates, keys, backups, logs, releases и privileged scripts имеют
      точных owners/modes; установлен только необходимый package set; host antimalware/agent следует verdict I0-06.
- [ ] **IS-I1-08. TLS policy.** Nginx/vhost фиксирует TLS 1.2+, современные suites, HSTS и certificate renewal;
      protocol/cipher/certificate проверяются автоматически снаружи.
- [ ] **IS-I1-09. PostgreSQL host prerequisite.** Cluster создаётся с checksums, не слушает public interface и
      предоставляет только host/mTLS prerequisites текущему DB privilege plan. Roles/grants/RLS здесь не описываются.
- [ ] **IS-I1-10. Host malware protection.** На host действует обновляемая malware protection с scheduled/on-demand
      scan, quarantine/alert и исключениями только по доказанной необходимости. Сканирование пользовательских upload
      остаётся продуктовым security control и не подменяется host scanner.

## I2 — S3, дисковое и прикладное шифрование

- [ ] **IS-I2-01. Storage split.** Patient clinical files и doctor/CMS/HLS content находятся в разных bucket либо
      жёстко разделённых prefixes/credentials/policies; смешанный общий keyspace не считается разделением.
- [ ] **IS-I2-02. Patient object envelope.** Patient originals и производные шифруются authenticated versioned
      envelope до durable upload; metadata содержит только algorithm/version/key-id/nonce/tag/chunk facts, wrapped
      DEK связан с organization/resource.
- [ ] **IS-I2-03. Streaming/multipart и видео.** Выбран controlled upload service (решение 19): большой объект не
      собирается целиком в RAM или в открытом temp, шифруется до записи в S3, abort/expiry удаляет multipart parts и
      временный key material. Пациентское видео (загруженное пациентом и снятое врачом на приёме) отдаётся
      зашифрованными HLS-сегментами с выдачей ключа после проверки прав — перемотка и постепенная загрузка обязаны
      работать. Транскодирование происходит только внутри зашифрованного bounded temp, ciphertext-сегменты допустимо
      кэшировать nginx/CDN, открытые сегменты — никогда.
- [ ] **IS-I2-04. Authorization and confirmation.** Confirm сверяет ownership, content binding и реальные
      encrypted/plaintext sizes; download/export проверяет tenant/resource authorization, а не только UUID/session.
- [ ] **IS-I2-05. Rotation and migration.** Key rotation поддерживает rewrap DEK; legacy plaintext доступен только
      для контролируемого read/migration; manifest содержит counts, retry, rollback и отключение legacy writes.
- [ ] **IS-I2-06. Plaintext boundary.** Decryption/transcoding происходит только внутри encrypted bounded temp;
      plaintext отсутствует в S3, CDN/nginx caches, logs, metrics, dumps и незашифрованном swap.
- [ ] **IS-I2-07. S3 access controls.** Доказаны anonymous deny, bucket policy/ACL, least-privilege credentials,
      credential separation и provider-side encryption как дополнительный, но не заменяющий client-side слой.
- [ ] **IS-I2-08. Versioning/lifecycle safety.** Versioning включается только после delete-all-versions capability;
      lifecycle и Object Lock согласованы с deletion/legal-hold model и не создают неудаляемые сироты.
- [ ] **IS-I2-09. Crypto negative tests.** Wrong tenant/key/metadata, tamper, truncation, retry/concurrency и key loss
      fail closed; tenant A не использует envelope tenant B.
- [ ] **IS-I2-10. Selected field encryption decision.** Массовое шифрование полей отклонено владельцем 17.08
      (решение 12): поля, участвующие в поиске и фильтрации, остаются открытыми под RLS/grants. Открыт один узкий
      вопрос — шифровать ли данные карточки визита (диагноз, заметки приёма), которые несут сведения о здоровье и не
      ищутся по базе. Решение принимается после data inventory и получает собственный migration/key proof.

## I3 — backup и disaster recovery

- [ ] **IS-I3-01. Recovery inventory.** Зафиксировано, какие DB/files/S3/config/key manifests нужны для полного
      восстановления и какие ключи/копии запрещено хранить вместе.
- [x] **IS-I3-02. Safe local artifacts.** Канонический backup path использует `umask 077`, directories `0700`,
      artifacts `0600`, controlled owner/cleanup и не выводит credential-bearing URL в argv.
- [x] **IS-I3-03. Encrypt-before-publish.** Поток `pg_dump → age` шифруется до финального artifact; публикация
      atomic, рядом создаётся независимый checksum manifest, а partial/orphan generation не считается backup.
- [ ] **IS-I3-04. Independent Russian copy.** Настроены offsite copy, retention и integrity check у **другого
      российского провайдера** (решение 10 — не другой регион Selectel), с отдельными credentials; копируются DB
      backups, encrypted media ciphertext и необходимые manifests.
- [ ] **IS-I3-05. PITR.** Решением 15 суточный RPO отклонён, целевой RPO — минуты, поэтому непрерывный архив WAL
      обязателен. Остаётся выбрать реализацию (`pgBackRest` либо `archive_command` + `restic`) и документировать
      один restore path.
- [ ] **IS-I3-06. Backup observability.** Success/failure/age/duration/integrity видны без секретов и ПДн; stale или
      failed backup создаёт проверяемый alert.
- [ ] **IS-I3-07. DB-loss drill.** На отдельном стенде восстановлены DB, migration ledgers и invariants; измерены RPO/RTO.
- [ ] **IS-I3-08. Host-loss drill.** Новый host восстановлен из reviewed scripts, config inventory и независимой
      backup copy; reboot/unlock/recovery console проверены владельцем.
- [ ] **IS-I3-09. S3-loss drill.** Проверены удаление объекта, delete marker/all versions, потеря primary bucket/account
      и восстановление ciphertext + manifests из независимой копии.
- [ ] **IS-I3-10. Failure drills.** Преднамеренно проверены missing key, corrupt backup, interrupted restore,
      full disk, unavailable backup target и failed deploy; каждый сценарий имеет abort/cleanup/rollback evidence.
- [ ] **IS-I3-11. Legacy copy disposition.** Для существующих plaintext/world-readable dumps, snapshots и partial
      artifacts существует owner-approved manifest: encrypt/migrate, expire либо удалить после точной проверки target.
- [ ] **IS-I3-12. Unified retention policy.** Recovery window, backup generations, S3 versions, staging/partials и
      cleanup cadence задаются одной согласованной policy, а не несвязанными hardcoded сроками в отдельных scripts.

## I4 — секреты и инфраструктурные доступы

- [ ] **IS-I4-01. Secret registry.** Без значений перечислены purpose, owner, producer/consumer, storage,
      created/last-rotated, rotation/revoke path для DB/session/M2M/webhook/S3/SSH/backup/certificate secrets.
- [ ] **IS-I4-02. Custody separation.** Private backup recovery key и root encryption recovery material доступны
      утверждённым владельцам вне production-host; потеря одного host/account не уничтожает recovery path.
- [ ] **IS-I4-03. Rotation drill.** На безопасной среде проверены overlap, rotation, revoke, rollback и влияние на
      sessions/pools для каждого класса; старые credentials после окна недействительны.
- [ ] **IS-I4-04. Access registry.** SSH/Selectel/GitHub/S3/DB/global-admin доступы имеют owner, основание и дату
      review; действует issue/change/revoke процесс и периодическая recertification.
- [ ] **IS-I4-05. Break-glass.** Доступ time-bound, требует reason/MFA/alert и after-action review; использование
      обычной постоянной учётки как break-glass запрещено.
- [ ] **IS-I4-06. Emergency controls.** Существуют безопасные runbooks для secret rotation, account/key revoke,
      tenant isolation и delivery shutdown.

## I5 — CI и поиск уязвимостей

- [x] **IS-I5-01. Secret scanning.** Gitleaks проверяет full history на PR/push рабочих веток, fail-closed на новой
      находке, использует точечный fingerprint baseline и имеет synthetic negative self-test.
- [ ] **IS-I5-01A. Historical credential closure.** Для пяти exact fingerprint baseline-записей старых
      Rubitime/Telegram конфигов оператор без публикации значений подтверждает владельца секрета, выполняет
      rotation/revocation у провайдера и фиксирует дату/ссылку на provider-side evidence; наличие fingerprint в
      `.gitleaksignore` не считается доказательством безопасности или ротации.
- [x] **IS-I5-02. SAST.** Semgrep запускается с pinned image/config, ERROR валит job, generated/vendor paths
      исключены точечно, отчёт сохраняется артефактом.
- [x] **IS-I5-03. Repository vulnerability scan.** Trivy filesystem scan проверяет vulnerabilities,
      misconfiguration и secrets с pinned action; HIGH/CRITICAL валят job, исключения имеют причину и review date.
- [x] **IS-I5-04. Dependency audit.** `pnpm audit --audit-level=high` является отдельным fail-closed job и не
      подменяется SaaS regression audit.
- [ ] **IS-I5-05. Release scan.** Полный pre-release Trivy workflow использует тот же immutable toolchain,
      не скрывает unfixed findings и хотя бы один раз проверен manual live run на default branch.
- [ ] **IS-I5-06. DAST TEST.** Active ZAP сканирует только synthetic TEST/ephemeral target; firewall window узкое,
      автоматически закрывается при любом исходе и не использует production dump/secrets.
- [ ] **IS-I5-07. Production baseline policy.** До первого запуска определены owner-approved target/rules;
      разрешён только passive/baseline scan. Active production DAST запрещён.
- [ ] **IS-I5-08. External infrastructure scan.** После disposable/new-host build проверяются внешние ports, TLS,
      headers, SSH exposure и known vulnerabilities ОС/packages; отчёт не содержит секретов/ПДн.
- [ ] **IS-I5-09. Vulnerability lifecycle.** Finding получает severity, owner, SLA, exception reason/expiry и retest;
      allowlist без срока и авто-исправление scanner findings запрещены.
- [ ] **IS-I5-10. Future AI testing.** Garak/LLM red-team не внедряется до появления AI-agent surface в продукте;
      это явный deferred gate, а не текущая работа.

## I6 — журналы, detection и incident response

- [ ] **IS-I6-01. Host log policy.** journald/PostgreSQL/nginx/application/audit/fail2ban logs имеют rotation,
      retention, disk quota, ownership и redaction; raw SQL params, clinical payload и secrets не пишутся.
- [ ] **IS-I6-02. Detection coverage.** Threat model сопоставлен сигналам auditd/AppArmor/systemd/journal/network/SSH,
      application health и выбранному EDR/HIDS либо compensating controls; слепые зоны названы явно.
- [ ] **IS-I6-03. Independent security sink.** Security events поступают в отдельный российский sink с
      least-privilege append/read, retention, integrity и alert delivery; потеря production-host не стирает evidence.
- [ ] **IS-I6-04. Alert operations.** Severity mapping, dedup/suppression, on-call owner и acknowledgement/escalation
      SLA проверены synthetic delivery test.
- [ ] **IS-I6-05. Incident runbook.** Определены detect → contain → preserve evidence → scope → eradicate → recover,
      роли, защищённый coordination channel и различение обычного event от утечки ПДн.
- [ ] **IS-I6-06. Legal timers.** Для применимого инцидента зафиксированы решения и ответственные по уведомлениям
      24/72 часа и процедуре взаимодействия с уполномоченными органами; текст утверждает ответственное лицо.
- [ ] **IS-I6-07. Exercise.** Tabletop и technical drill выполняются на synthetic scenario без реальных ПДн/каналов;
      lessons фиксируются в существующем плане, а не создают параллельный security backlog.

## I7 — репетиция, ввод и cutover

- [ ] **IS-I7-01. Disposable rehearsal.** Временный VPS без production credentials проходит install, encrypt/unlock,
      reboot, recovery console, rebuild, synthetic restore, external scan и cleanup.
- [ ] **IS-I7-02. Dark target.** Новый host устанавливается из reviewed scripts и не получает production traffic,
      delivery, ticks или webhooks до отдельного enable step.
- [ ] **IS-I7-03. Isolated restore.** На dark target восстанавливается согласованная encrypted copy в maintenance/
      send-disabled mode; проходят counts/checksums/invariants и tenant negatives без вывода clinical values.
- [ ] **IS-I7-04. Change packet.** Зафиксированы host IDs, release SHA, storage/key manifests, DNS/TLS, health checks,
      команды, expected results, abort thresholds, rollback actions и evidence locations.
- [ ] **IS-I7-05. Final rehearsal.** Та же последовательность проходит от preflight до rollback на disposable/TEST;
      full CI относится только к финальному integration/release gate.
- [ ] **IS-I7-06. Owner GO.** Владелец назначает окно, GO/rollback authority и канал связи; production-host
      подтверждён как `135.106.162.170`.
- [ ] **IS-I7-07. Cutover.** Writers/schedulers/webhooks/delivery заморожены; финальный encrypted backup проверен
      restore-readability; target получает delta, canonical migrations и smoke; DNS/writers включаются по одному.
- [ ] **IS-I7-08. Rollback safety.** После первой записи на target нельзя возвращать traffic на stale source:
      target writers останавливаются, новая canonical copy восстанавливается на rollback host и проверяется до switch.
- [ ] **IS-I7-09. Decommission.** После owner approval старый host/volumes/snapshots/plain backups удаляются с
      provider evidence; credentials ротируются, лишние grants закрываются, выполняется post-cutover restore drill.

## Итоговая приёмка

- [ ] Новый production работает только на принятой encrypted topology; открытый старый host не является active fallback.
- [ ] Reboot/unlock/recovery, DB restore, S3 restore, key loss/rotation и independent-copy restore доказаны drills.
- [ ] Снаружи доступны только утверждённые ports/TLS surface; runtime/deploy users не имеют root path.
- [ ] Patient objects защищены и изолированы от content library; plaintext отсутствует в незащищённых copies.
- [ ] Security CI и vulnerability lifecycle fail closed на проверенных synthetic defects; DAST соблюдает target policy.
- [ ] Независимая оценка эффективности мер выполнена по целевой topology; открытые исключения имеют owner и срок.
- [ ] RPO/RTO достигнуты либо residual risk явно принят владельцем; docs содержат только подтверждённые non-secret facts.
