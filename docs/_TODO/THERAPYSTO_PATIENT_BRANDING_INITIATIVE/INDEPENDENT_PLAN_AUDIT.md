# Независимый аудит плана Therapysto / patient branding

- **Audited SHA:** `43c59a522`
- **Classification:** `VIEW`
- **Метод:** чтение owner authority, полного diff `9a459bfb8..43c59a522`, трёх authored-файлов целиком, их прямых ссылок и фактических choke points кода; точечные read-only поиски. Tests/CI/DB/runtime не запускались.
- **Граница:** аудит оценивает план как бинарный gate. `FAIL` ниже означает, что owner-требование не имеет требуемой по `AGENTS.md` §12 атомарной закрываемой единицы либо план ему содержательно противоречит; это не означает, что вся связанная проза отсутствует.

## Матрица owner requirements

TPB-01 → FAIL → `IMPLEMENTATION_PLAN.md:96-121` описывает rename, но ни один checkbox не сохраняет `TPB-01` как самостоятельное owner-требование с отдельной human-path приёмкой.

TPB-02 → FAIL → роли перечислены в матрице (`:14`) и косвенно покрыты S1/S2, но нет атомарного checkbox `TPB-02`, закрывающего specialist, clinic-admin и platform-admin surfaces независимо.

TPB-03 → FAIL → S2.2 (`:140-147`) вводит только URL, тогда как S3.1/S3.2 (`:174-179`) ссылаются на несуществующее deploy-time значение имени; S1.2 (`:109-111`) вместо deploy-input предлагает выдуманный neutral placeholder.

TPB-04 → FAIL → отказ от `staff.`/`patient.` отражён как boundary и в host-классах (`:36-47`, `:127-138`), но не существует самостоятельной атомарной приёмки `TPB-04`.

TPB-05 → FAIL → стандартный и clinic-branded входы распределены между S3/S4 (`:168-245`), но единый human path owner-требования не является отдельной закрываемой единицей.

TPB-06 → FAIL → S5 (`:248-270`) правильно направляет PersonCare через общий механизм, но `TPB-06` не закреплён отдельным checkbox и бинарным доказательством отсутствия fork.

TPB-07 → FAIL → S5.1 (`:255-259`) запрещает второй кодовый путь, однако requirement про один repository/webapp/DB/mechanics не сохранён как атомарный checkbox.

TPB-08 → FAIL → staff/patient boundary присутствует в S1/S2/S4, но `TPB-08` не имеет самостоятельной закрываемой human-path приёмки.

TPB-09 → FAIL → standard patient URL задуман как deploy config, но имя не имеет deploy-input, а S4.1/S4.3 (`:204-225`) создают второй источник clinic hostname рядом с DB-backed `org_custom_domain_hostname` без атомарной связи публикации.

TPB-10 → FAIL → S6.2/S6.3 (`:286-305`) используют один global Yandex client через standard patient redirect; официальный Yandex model показывает фиксированные name/icon приложения на consent screen, поэтому разные clinic brands этим дизайном не обеспечены.

TPB-11 → FAIL → route boundary S4.4 ограничивает branded surface, но S6 допускает на нём фиксированную чужую OAuth identity; требование «only its app/clinic identity» достижимо нарушается.

TPB-12 → FAIL → S7.2 и S10.7 (`:324-327`, `:410-413`) оставляют recovery/security на platform bot для любого branded domain, прямо вопреки latest owner registry и no-fallback формулировке TPB-12.

TPB-13 → FAIL → S8.3 (`:356-358`) явно откладывает clinic templates по старому решению; новое owner-требование включает template support в brand-aware transactional mail design.

TPB-14 → PASS → S4.7 и S13.2 (`:232-235`, `:462-464`) дают атомарную manual/operator activation и runbook acceptance, а self-service DNS/TLS, SEO automation и marketplace оставлены вне scope.

TPB-15 → FAIL → user-visible rename есть в S1, но S1.4/S13.4 (`:116-118`, `:455-468`) предлагают только pointers/footnotes в несовместимой активной прозе и изменение archive вместо требуемой замены active authority.

TPB-16 → FAIL → S4.1 вводит отдельную `hostname_binding` lifecycle entity поверх существующего hostname intent, без единого write/projection contract; это конкретный параллельный state path и лишний v1 volume.

## MUST FIX findings

### F-01 — HIGH — Yandex OAuth не обеспечивает clinic-specific consent identity

- **Точные строки:** `IMPLEMENTATION_PLAN.md:282-305`; `EXTERNAL_PRODUCT_RESEARCH.md:81-95`.
- **Нарушено:** TPB-10, TPB-11; вопрос аудита 3.
- **Доказательство:** research подтверждает только несколько Redirect URI и exact matching. Официальная регистрация Yandex OAuth требует service name/icon и сообщает, что пользователь видит их на authorization page и в списке авторизованных приложений: <https://yandex.ru/dev/id/doc/ru/register-auth>. Redirect URI не меняет эту identity. Фактический код на SHA использует один global `yandex_oauth_client_id`, global redirect и signed state без clinic provider identity. Сам план в S6.1 называет число клиентов инженерным вопросом, но S6.2 без доказательства фиксирует один client.
- **Достижимое последствие:** пациент клиники открывает branded domain и на consent screen видит Therapysto, стандартный patient brand, PersonCare либо другую фиксированную identity, хотя branded flow обязан показывать только identity этой клиники.
- **Минимальная граница исправления:** до implementation-ready статуса зафиксировать protocol/provider-valid способ выбирать корректную consent identity для каждого branded flow, его storage/selection path и бинарную acceptance; число приложений само по себе owner question не является.

### F-02 — HIGH — branded recovery/security возвращены на platform bot

- **Точные строки:** `IMPLEMENTATION_PLAN.md:317-330`, `:410-413`; `CURRENT_STATE_AND_GAP_REPORT.md:171-176`.
- **Нарушено:** TPB-12 и более новое owner-решение `docs/OWNER_DECISIONS.md:276-278`, `:292-316` от 20.08.2026.
- **Доказательство:** owner registry закрепляет за own branded Telegram/MAX bot полный patient набор, включая phone binding at login, login codes и notifications. План, ссылаясь на более старый branding contract, объявляет recovery/security `platform_required` на любом branded domain. Фактический `dispatchPort` уже поддерживает `clinic_required` и при отсутствии/ошибке clinic credential бросает ошибку без fallback, то есть новый параллельный sender mechanism не нужен.
- **Достижимое последствие:** контактное подтверждение или login/recovery code с branded clinic origin уходит через общий Therapysto bot и раскрывает platform brand; при «where configured» branded activation может пройти без обязательной clinic delivery readiness.
- **Минимальная граница исправления:** все перечисленные TPB-12 branded patient intents должны быть классифицированы через существующий clinic-required/no-fallback choke point; activation acceptance должна проверять собственные Telegram/MAX credentials либо явный fail-closed результат. SMS остаётся отдельной provider capability.

### F-03 — HIGH — из transactional mail design удалена обязательная template support

- **Точные строки:** `IMPLEMENTATION_PLAN.md:347-361`, особенно S8.3 `:356-358`; `EXTERNAL_PRODUCT_RESEARCH.md:108-115`.
- **Нарушено:** TPB-13.
- **Доказательство:** S8.3 переносит custom templates «в отдельный будущий этап» на основании старого решения 25.07, хотя audited owner wording прямо включает own SMTP/sender/template support в brand-aware transactional patient mail design. S8.4 правильно исключает mass mailing, но это не authority для исключения transactional templates.
- **Достижимое последствие:** clinic SMTP и sender могут включиться, но patient login/recovery/booking mail продолжит platform-authored template, поэтому white-label transactional path останется незавершённым.
- **Минимальная граница исправления:** вернуть brand-aware transactional template support в исполнимый scope и human-path acceptance, не добавляя mass-mailing mechanism/tariff.

### F-04 — HIGH — имя стандартного patient app не является deploy input

- **Точные строки:** `IMPLEMENTATION_PLAN.md:66-74`, `:109-111`, S2.2 `:140-147`, S3.1/S3.2 `:174-179`.
- **Нарушено:** TPB-03, TPB-09.
- **Доказательство:** unresolved name перечислено как owner input, но S2.2 определяет лишь `THERAPYSTO_BASE_URL` и `PATIENT_APP_BASE_URL`. S3 затем читает «deploy-time name» из S2.2, которого там нет; S1.2 предлагает neutral placeholder. URL uses (`env.APP_BASE_URL`) не являются механизмом имени.
- **Достижимое последствие:** после выбора имени owner потребуется правка кода/manifest/metadata вместо изменения deploy config; до выбора пользователю будет показано придуманное агентом значение.
- **Минимальная граница исправления:** добавить один явный system/deploy input для ещё не выбранного patient app name и бинарно доказать замену имени/metadata/manifest без code или data migration; значение не изобретать.

### F-05 — HIGH — `hostname_binding` дублирует существующий hostname state без единого publication path

- **Точные строки:** `IMPLEMENTATION_PLAN.md:194-225`, особенно S4.1/S4.3 `:204-225`; `CURRENT_STATE_AND_GAP_REPORT.md:142-154`.
- **Нарушено:** TPB-09, TPB-16; `AGENTS.md` §4 (не дублировать key/value settings отдельной таблицей), §5 (один choke point); вопросы аудита 2 и 6.
- **Доказательство:** на SHA уже есть per-org DB setting `org_custom_domain_hostname` в единственной `system_settings` table и действующий settings write path. S4.1 сохраняет тот же normalized hostname ещё раз в новой table с lifecycle, а S4.3 переводит resolver на новую table. План не содержит атомарного projector/write contract, который связывает edit intent, global uniqueness и active binding; requested/dns/certificate/quarantine lifecycle не выведен из отдельного owner human consequence для v1.
- **Достижимое последствие:** clinic admin/operator меняет существующий setting, resolver продолжает читать отсутствующую или старую binding row; новый домен не открывается либо старый остаётся активным. Параллельно добавляются schema, repository и lifecycle work без нового patient outcome.
- **Минимальная граница исправления:** оставить один канонический persisted hostname/write/resolver path, расширив существующий org setting либо описав одну атомарную замену без двух одновременно авторитетных hostname stores; сохранять только состояния, необходимые manual v1 activation.

### F-06 — MEDIUM — documentation correction сохраняет несовместимую active prose и меняет archive

- **Точные строки:** `IMPLEMENTATION_PLAN.md:50-64`, S1.4 `:116-118`, S13.4 `:467-468`.
- **Нарушено:** `AGENTS.md` «Как решать, что делать» п.2, §12; TPB-15; вопрос аудита 10.
- **Доказательство:** план требует для active branding contract/matrix только header pointer и прямо запрещает переписать несовместимые substantive decisions; одновременно предлагает помету в archived slug research. Канон требует обратное: более новое owner-решение заменяет несовместимую активную прозу, а historical audit/evidence/archive не переписывается.
- **Достижимое последствие:** следующий worker продолжит считать active старые subdomain, bot/template или BersonCare boundaries, тогда как история получит post-hoc изменение и перестанет быть неизменным evidence.
- **Минимальная граница исправления:** заменить только несовместимые active owner/contract passages в их owning documents и оставить historical audit/archive неизменными; pointers допустимы лишь там, где не оставляют вторую активную редакцию.

### F-07 — MEDIUM — owner requirements не разложены в атомарные закрываемые единицы

- **Точные строки:** requirement matrix `IMPLEMENTATION_PLAN.md:9-30`; implementation checkboxes `:96-468`.
- **Нарушено:** `AGENTS.md` §12; все TPB кроме единственного полноценно атомизированного TPB-14; вопрос аудита 1.
- **Доказательство:** из 56 S-checkboxes только четыре строки вообще содержат TPB ID; они упоминают лишь TPB-12/13/14, причём TPB-12 и TPB-13 покрывают только SMS и mass-mail exclusions. Табличные TPB-01…16 не являются checkboxes. Поэтому отдельные owner decisions можно потерять внутри stage acceptance или закрыть вместе с частично выполненным этапом.
- **Достижимое последствие:** worker закрывает S6/S7/S8 как этап, не доказывая branded consent, recovery bot или template path, и план формально выглядит завершённым при owner failure.
- **Минимальная граница исправления:** каждому TPB дать один stable-ID checkbox, сохраняющий owner wording без смягчения, с одной бинарной human-path acceptance; S-задачи могут оставаться подчинёнными доказательствами.

### F-08 — MEDIUM — технические и уже решённые вопросы возвращены owner

- **Точные строки:** `IMPLEMENTATION_PLAN.md:470-487`; внутреннее противоречие S6.1 `:282-285` против вопроса S14.4 `:484-487`.
- **Нарушено:** `AGENTS.md` «Как решать, что делать» п.4 и §12; вопрос аудита 5.
- **Доказательство:** owner действительно должен выбрать три value inputs: имя standard patient app, его full domain и PersonCare full domain. Но domain permission role выводится из существующей branding/mechanic policy и текущего owner-only write path; место consolidation документов — hygiene; число Yandex clients — техническое следствие официальной consent model. Сам план сначала верно называет OAuth choice инженерным, затем блокирует им owner.
- **Достижимое последствие:** implementation-ready работа останавливается на владельце без value choice, а критический OAuth defect может быть принят как произвольный выбор «один client».
- **Минимальная граница исправления:** оставить owner только три невыбранных product values; role, docs placement и OAuth topology разрешить repository/world evidence и записать однозначно в плане.

### F-09 — MEDIUM — source-backed counts и absence claims невоспроизводимы

- **Точные строки:** `CURRENT_STATE_AND_GAP_REPORT.md:14-30`, `:49-65`, `:142-154`, `:222-239`.
- **Нарушено:** `AGENTS.md` «Как решать, что делать» п.4 и п.7; вопрос аудита 7.
- **Доказательство:** опубликованная команда использует `grep -E "bersoncare\|personcare"`; escaped `\|` в ERE ищет literal pipe, а не alternation. Snapshot-safe `git grep` даёт 1214 matching files, а не 1193; `docs` 623, а не 622; `deploy` 82, а не 80. Команда про literal `PersonCare Bot|personcarebot` возвращает 3 строки в двух authored docs, не 0. Hostname/table/test absence claims приведены без обязательного code-search query и back-reference trail; независимый code-search находит существующий hostname setting/registry/contract.
- **Достижимое последствие:** rename kill-set и volume считаются по неполному inventory, а существующий extension point ошибочно объявляется отсутствующим, что поддерживает дублирующую архитектуру F-05.
- **Минимальная граница исправления:** пересчитать SHA-scoped readable командами, записать точный scope/result, отделить authority/self-references от product literals и приложить code-search plus exact-search/back-reference evidence ко всем существенным «не найдено».

## Genuine OWNER QUESTION

Остаются **3** genuine owner value inputs, уже явно не выбранные authority: (1) имя standard patient app, (2) его separate full domain, (3) full domain первой активации PersonCare. Domain role, место documentation consolidation и число Yandex OAuth clients owner questions не являются.

## Validation/search commands and results

Все команды выполнялись read-only относительно audited snapshot; authored-файлы читались через `git show 43c59a522:<path>` с `nl -ba` полностью.

- `git diff --name-status 9a459bfb8..43c59a522` → ровно три `A`: `IMPLEMENTATION_PLAN.md`, `CURRENT_STATE_AND_GAP_REPORT.md`, `EXTERNAL_PRODUCT_RESEARCH.md`.
- `git diff --stat 9a459bfb8..43c59a522` → `3 files changed, 881 insertions(+)`; тем самым полное чтение трёх blobs покрывает весь audited diff.
- `node /home/dev/brain/tools/code-search.mjs "organization custom domain hostname lifecycle activation resolver publication projection" --repo bcb -k 20` → найден existing branding contract/domain lifecycle и proposal; параллельный resolver в runtime не найден.
- `node /home/dev/brain/tools/code-search.mjs "org_custom_domain_hostname custom domain active status resolver" --repo bcb -k 20` → найдены `orgCustomDomainHostname.ts`, settings registry, proposal/contract; настройка существует, live host resolver отсутствует.
- `node /home/dev/brain/tools/code-search.mjs "latest owner decision Therapysto PersonCare standard patient domain own Telegram MAX bots SMTP sender templates" --repo bcb -k 40` → найдены `docs/OWNER_DECISIONS.md`, branding contract и registry; latest dated bot decision — 20.08.2026.
- `git grep -Ili -E 'bersoncare|personcare' 43c59a522 -- . | wc -l` → `1214`; scopes: `apps/webapp` → `318`, `apps/integrator` → `86`, `docs` → `623`, `deploy` → `82`.
- `git grep -n -E 'PersonCare Bot|personcarebot' 43c59a522 -- apps docs` → `3` matching lines в `IMPLEMENTATION_PLAN.md` и `CURRENT_STATE_AND_GAP_REPORT.md`, а не заявленный `0`.
- `git grep -n 'env.APP_BASE_URL' 43c59a522 -- apps/webapp/src | rg -v '\.test\.' | wc -l` → `41`; этот count отчёта воспроизведён.
- `git grep -n -E 'custom_hostnames|domain_bindings|custom_domain_requests' 43c59a522 -- apps/webapp/db apps/webapp/src | wc -l` → `0`; это лишь узкий literal result, не доказательство отсутствия существующего `org_custom_domain_hostname` extension point.
- `git grep -n 'read_public_org_brand_projection' 43c59a522 -- apps/webapp/src | wc -l` → `0`; gap public projection подтверждён.
- `git show 43c59a522:apps/webapp/src/modules/system-settings/orgCustomDomainHostname.ts` и `git show 43c59a522:apps/webapp/db/schema/schema.ts | sed -n '3902,3940p'` → hostname уже DB-backed per-org setting в единственной `system_settings` table; отдельной binding table нет.
- `git show 43c59a522:apps/integrator/src/infra/adapters/dispatchPort.ts | sed -n '1,430p'` → существующие scopes `clinic_required|clinic_preferred|platform_required`; `clinic_required` не делает platform fallback ни при missing credential, ни при send error.
- `git grep -n -E 'yandex_oauth_client_id|yandex_oauth_redirect_uri|makeYandexAuthorizeUrl' 43c59a522 -- apps/webapp/src` плюс чтение найденных start/callback handlers → один global client/redirect, clinic identity в OAuth state отсутствует.
- `git show 43c59a522:docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md | rg -c '^\s*- \[ \].*`S[0-9]+\.[0-9]+`'` → `56`; та же команда с `.*TPB-[0-9]{2}` → `4` строки, только TPB-12/13/14 и без полного owner wording.
- Официальная Yandex документация <https://yandex.ru/dev/id/doc/ru/register-auth> → при регистрации задаются service name/icon, видимые на authorization page; несколько Redirect URI разрешены, но должны exact-match и не меняют app identity.

## Final verdict

**FAIL**

- **MUST FIX:** 9
- **Genuine owner questions:** 3

План нельзя передавать implementation worker до устранения F-01…F-09 и повторного независимого VIEW gate.
