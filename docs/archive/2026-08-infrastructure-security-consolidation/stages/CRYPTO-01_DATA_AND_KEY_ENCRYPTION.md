# CRYPTO-01 — Data-at-rest, application encryption and key lifecycle

## Цель и зависимости

Создать проверяемую схему шифрования, которая соответствует фактическим угрозам и не превращается в декларацию
«AES есть — закон соблюдён». Зависимости: `PR-00/PR-01`; предварительное решение `G-06`; для settings/secrets —
stable S5-7 SHA; для tenant media authorization — stable D4; для production — `G-11`.

## File scope gate

До exact manifest разрешены только эта инициатива и read-only code/runtime discovery. Перед `doing` в `LOG.md`
фиксируются taskdb ID, SHA зависимостей, точные crypto/storage/media/settings schema/port/service/repo/API/worker/
test/docs paths и независимый security auditor. Active SaaS/Product UX/billing files не меняются.

## C0 — threat and key architecture packet (`AI + external + owner`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Агенты составляют data-at-rest map: PostgreSQL data/WAL/temp, swap, logs, env, dumps, originals, HLS,
      previews, message attachments и transient worker files.
- [ ] Для каждого класса фиксируется adversary: lost disk/snapshot, local user, deploy compromise, root compromise,
      bucket credential leak, DB dump leak, provider/admin access.
- [ ] Разделить controls: LUKS volume; backup encryption; S3 client-side encryption; field/envelope encryption;
      transport; access control. Один control не объявляется защитой от всех угроз.
- [ ] Выбрать KEK/DEK hierarchy, key IDs/versions, rotate/rewrap/revoke/recovery flows и storage, независимый от
      encrypted payload. Auto-unlock key на том же открытом диске запрещён.
- [ ] Внешний специалист определяет, нужны ли сертифицированные средства; обычный LUKS/WebCrypto не называется
      сертифицированным control без заключения.
- [ ] Владелец закрывает `O-06`, `O-08`, `O-09`.

**Выход:** принятый ADR + key-custody/recovery diagram + performance/availability budget; никаких secret values.

## C1 — reusable crypto envelope (`AI development`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Реализовать versioned authenticated envelope contract: algorithm/version/key-id/nonce/tag/chunk metadata,
      plaintext length/type и domain-bound additional authenticated data.
- [ ] Использовать поддерживаемую reviewed crypto implementation; собственные cipher primitives запрещены.
- [ ] Интерфейс ключей идёт через typed port/DI; plaintext KEK не хранится рядом с ciphertext или в app log.
- [ ] Поддержать key rotation через rewrap DEK без обязательного повторного шифрования многогигабайтного объекта.
- [ ] Добавить known-answer/tamper/wrong-key/wrong-tenant/truncation/concurrency tests и zeroization/bounded-memory
      review по возможностям runtime.

**Выход:** изолированный crypto package/module, contract tests и независимый security audit.

## C2 — S3 originals and multipart (`AI development`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> ➕ **ВНЕСЕНО РЕШЕНИЕМ ВЛАДЕЛЬЦА 27.07 — отдельная подпапка для видео врача.**
> Дословно: «Подпапка — да, верно. но это будет включено в работу по разделению видео на шифрованные и нет.»
> Требование пришло из пунш-листа **PRG-4** и там закрыто как переданное сюда.
>
> **Что нужно:** видео, которое врач загружает при создании упражнения прямо в программе пациента, должно
> лежать в **отдельной подпапке `indive_program_exercises`** внутри папки пациента, а не вперемешку с тем,
> что пациент грузит сам на оценку техники.
>
> **Почему это здесь, а не отдельно:** разделение ровно по той же границе, что и всё C2 — контент
> (демонстрация упражнения) против клинических файлов пациента. Класть их в одну папку и потом
> разделять по признаку шифрования — двойная работа.
>
> **Сейчас:** `media-presign/route.ts:58` → `pgEnsureClientPatientFolder(patientUserId)`, то есть врачебное
> видео уходит в ту же папку пациента. Подпапки нет.

> ### 🟢 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-07-27 — сначала РАЗДЕЛИТЬ хранилища, потом решать про шифрование
>
> **Было:** C2 исходил из того, что шифруется весь медиа-поток в S3 целиком — и библиотека упражнений, и
> файлы пациентов лежат в одном приватном бакете, значит и шифровать надо всё.
>
> **Стало:** первым шагом идёт **разделение хранилищ** — контент-библиотека (демо-упражнения) отдельно,
> пациентские клинические файлы и видео отдельно. Шифрование применяется только ко второму хранилищу, и
> только после того, как разделение выполнено. Слова владельца 27.07: «разделить хранилища, а не шифровать
> всё - вот это уже дело».
>
> **Почему (правовая часть, проверено по первоисточникам 27.07):**
>
> - Видео-демонстрация упражнения, где в кадре врач или наёмная модель, — это ПДн **человека в кадре**,
>   обычная категория (152-ФЗ ст. 3). Оно **не является** специальной категорией по ст. 10 и **не становится**
>   данными пациента от того, что лежит у него в программе: категория определяется тем, о ком информация.
>   Требования шифровать его не порождает ни одна норма.
> - Видео пациента, снятое для клинической оценки, — специальная категория (ст. 10 ч. 1, сведения о состоянии
>   здоровья) плюс врачебная тайна (ФЗ-323 ст. 13). Биометрией (ст. 11) **не является**, пока оператор не
>   использует его для установления личности — письма Роскомнадзора от 29.08.2022 № 08-78032 и от 01.08.2024
>   № 62450-02-11/77 применяют функциональный критерий «цель = идентификация», а не «в кадре видно лицо».
>   Граница пройдёт, если появится автоматическая верификация «тот ли человек в кадре».
> - **Шифрование хранения не является требованием закона ни для того, ни для другого.** Приказ ФСТЭК № 21 в
>   п. 1 прямо выводит криптографию за свои рамки; СКЗИ по Приказу ФСБ № 378 применяются, только если оператор
>   сам своей моделью угроз решил, что иначе угрозу не закрыть. Уровень защищённости здесь — УЗ-3 (ПП № 1119:
>   спецкатегории, субъекты не сотрудники, < 100 000), его базовый набор закрывается разграничением доступа,
>   журналированием и учётом носителей, компенсирующие меры разрешены прямо. Шифрование медиа остаётся
>   **снижением риска утечки дампа/ключа от бакета по решению владельца**, а не обязанностью.
>
> **Следствие для стоимости:** сейчас всё медиа пишется в один `S3_PRIVATE_BUCKET`
> (`docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`), разделены только таблицы — `media_files` (контент) и
> `patient_files` (пациентское). Шифрование «в лоб» потратило бы основную стоимость (потоковое шифрование,
> перешифровка HLS, перемотка, мобильное воспроизведение) на библиотеку упражнений, защищать которую не
> требуется. После разделения объём реально чувствительных объектов падает в разы.
>
> **Порядок работ по C2 меняется на:**
>
> - [ ] Развести хранение: отдельный бакет/префикс для контент-библиотеки и отдельный — для пациентских
>       клинических файлов и видео. Опереться на существующее разделение `media_files` / `patient_files`.
> - [ ] Доказать на TEST, что ни один пациентский объект не пишется в контент-хранилище и наоборот;
>       проверить обратной выборкой по обеим таблицам.
> - [ ] Только после этого — вернуться к вопросу шифрования, применяя его **исключительно** к пациентскому
>       хранилищу. Пункты ниже читать в этой рамке.

- [ ] Спроектировать streaming/chunked encryption до первого реального upload. Large file не собирается целиком в
      RAM; multipart resume не переиспользует nonce и проверяет manifest/part integrity.
- [ ] Сравнить и доказать два пути: browser-side streaming encryption к presigned multipart либо controlled upload
      gateway. Выбор фиксируется ADR с cost/load/mobile/browser limits.
- [ ] Storage metadata содержит только non-sensitive crypto envelope; DEK хранится wrapped и org/resource-bound.
- [ ] Confirm проверяет реальный encrypted/plaintext size, content binding и ownership, а не только `HeadObject`.
- [ ] Download/export выдаётся только после tenant/resource authorization; readable UUID + любая session не является
      достаточным правом.
- [ ] Новый encrypted object format вводится backward-compatible: `legacy_plain` read-only → background migration →
      `encrypted_vN`; новые health objects нельзя писать в legacy после cutover flag.

**Выход:** TEST A/B upload/download/resume/tamper tests для small/large objects и migration manifest.

## C3 — HLS/media-worker (`AI development`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Worker decrypts source only inside encrypted volume/tmp boundary, transcodes, encrypts playlists/segments/
      previews and removes transient plaintext on success/failure/reboot recovery.
- [ ] Playback path authorizes resource and decrypts/proxies segments; direct presigned plaintext GET прекращается
      для `encrypted_vN`.
- [ ] Проверить seek/range, mobile playback, retry, cache policy и отсутствие plaintext в CDN/nginx/temp/logs.
- [ ] Delete/retention removes all object versions and wrapped keys according to legal hold; versioning включается
      только после этой capability.

**Выход:** synthetic end-to-end TEST playback, resource-negative tests и measured CPU/latency/egress.

## C4 — database fields and secrets (`AI + external decision`)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] LUKS остаётся первым broad DB-at-rest layer. Не заявлять PostgreSQL TLS или `pgcrypto` как TDE.
- [ ] После data inventory внешний specialist/architect выбирает только поля, которым нужна защита от dump/DB-reader;
      для каждого фиксируются search/index/export/delete/key-loss trade-offs.
- [ ] Restricted `system_settings` values после S5 получают envelope encryption; audit хранит redacted metadata/hash,
      а не старое/новое plaintext secret value.
- [ ] Raw SQL params и clinical values удаляются из error/security logs до включения field encryption.
- [ ] Миграции backward-compatible и tenant-aware: dual-read/controlled-write, resumable backfill, counts/checksum,
      rollback до destructive cleanup.

**Выход:** закрытый field matrix, migration rehearsal и доказательство, что DB dump без KEK не раскрывает выбранные
поля. Если external review решил, что field encryption не требуется, решение фиксируется как `not_applicable` с
обоснованием; этот пункт не исчезает молча.

## Checks и Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Crypto design принят владельцем и внешним reviewer; key loss/recovery/rotation rehearsed.
- [ ] Tenant A cannot decrypt/use tenant B envelope even with object/row identifier.
- [ ] Tamper/truncation/wrong metadata fail closed; plaintext не появляется в logs, metrics, backups или S3.
- [ ] Existing objects migrated by manifest with counts, retry and rollback; legacy write path disabled.
- [ ] Targeted tests на slices; один full CI на integration checkpoint; отдельный adversarial security audit.
