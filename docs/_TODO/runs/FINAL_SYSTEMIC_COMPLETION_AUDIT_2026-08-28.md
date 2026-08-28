# Финальный независимый completion-аудит системного плана — 28.08.2026

Authority: [`SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`](../SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md)
(этапы 1–7, раздел «Не подтверждено живьём»). Сверено также
[`OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`](../OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md),
[`RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md`](../RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md),
[`DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`](../DB_PRIVILEGE_LAYER_REBUILD/PLAN.md), taskdb `#1085 #1088 #1090 #1092`.

Проверен HEAD `feat/doctor-ui-rebuild` = `6f924fe1d98e03545bd47051a152f59d839a4718` (28.08 11:00 MSK). Это
проверка по факту кода и артефактов; PROD и домены не трогались, продуктовый код и taskdb не менялись.

## 1. Матрица по этапам 1–7

### Этап 1 — Одна исполнимая модель доступа

| Пункт | Статус | Доказательство |
|---|---|---|
| Декларация — единственный источник org-предиката (`REV10_EXPLICIT_ORG_COLUMN` снят) | **PASS** | `deploy/postgres/privileges/declaration.ts:8248-8266`, предикат выводится из `org === true` |
| Инвариант `tenantPredicateViolations` в генераторе | **PASS** | `tenant-wall.mjs:117`, вызван из `generate.mjs:1817-1834` (`assertTenantPredicateWall`) |
| Access census знает runtime principal (`assertPatientCallsiteDoors`) | **PASS** | `access-census.mjs:308`, вызван `generate-cli.mjs:236-247` под `--census` |
| Узкая дверь `content_access_grants_webapp`: `app_patient` = 6 колонок, staff-политика сравнивает org | **PASS** | `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:13193-13226` |
| Legacy principal→role ветка недостижима без явного тестового флага | **PASS** | `config/env.ts:410-428` бросает при `mode !== 'port-context'`; `withClient.ts:29-42` спрашивает ту же точку на каждый вызов. Старый код (`packages/db-principal/src/index.ts:1041-1055`) физически остался в репозитории, но недостижим в проде — это внутренний security-margin, не FAIL |
| Живые A/B clinic + patient probes на TEST | **PASS**, но ссылка в плане устарела | `account-self-service-actor-wall.devDbProof.test.mjs` — `15/15`, добавлен коммитом `04415c1fb7` (28.08 05:15), уже ПОСЛЕ `BLIND_KILL_SET_2026-08-27.md` (коммит `25ecc61470`, 27.08 22:08). Kill-set-файл, на который план ссылается как на доказательство живого прогона, сам ещё говорит «не доказано живьём» в своём разделе. Не фабрикация — реальный прогон есть в отдельном коммите, но цитата в плане ведёт читателя в документ, который ей противоречит |

**Вывод этапа 1: PASS по коду, одна STALE-ссылка в самом плане (низкий риск, документ-only).**

### Этап 2 — Один manifest фоновых заданий

| Пункт | Статус | Доказательство |
|---|---|---|
| `backgroundJobManifest.ts` — единственный typed manifest, `cronJobRegistry`/`reconcileJobKeys` — проекции | **PASS** | `backgroundJobManifest.ts:1-541`; `cronJobRegistry.ts:32-44` строит через `.map()` |
| 20 generated `*.cron.template`, `--check` в `pnpm test:scripts` | **PASS** | `deploy/host/cron.d/` — 20 файлов; `package.json:21`; CI job `test-scripts` (`.github/workflows/ci.yml:70`) |
| `run-internal-job.sh` — единственный transport, без Host/Origin/curl/`>/dev/null` в cron-строках | **PASS** | `run-internal-job.sh` (docstring + implementation), 0 вхождений запрещённых паттернов в 20 шаблонах |
| `--verify-installed --env prod\|test` до рестарта служб в трёх deploy-скриптах | **PASS** | `deploy-prod.sh:198`, `deploy-webapp-prod.sh:141`, `deploy-test.sh:413` |
| Ранее отсутствовавшие расписания (B2) заведены + TEST-двойники | **PASS** | все 6 job id есть в manifest и имеют PROD+TEST шаблоны |
| `classifyOperatorCronJobHealth` различает 4 состояния, `reason` доезжает до payload | **PASS** | `classifyOperatorCronJobHealthStatus.ts:35-61`, `collectCronJobsHealth.ts:40,153` |
| E3: isolation telemetry из manifest, `cron_maintenance`/`cron_saas_billing` в TS-словаре и SQL-overlay | **PASS** | `cronIsolationOperations.ts:12-20`, `saas-isolation-telemetry.sql:111,148` |
| `backup.hourly` — честно НЕ автоматизирован, только оператор | **PASS (открыт по плану, не по забывчивости)** | manifest объявляет `scheduleOwner: 'host_backup'`; `background-jobs-cli.mjs:167-169` явно отказывается ставить его как cron job; ни одного `backup*.cron.template` нет |

**Вывод этапа 2: PASS по всем закрытым пунктам плана; `backup.hourly` остаётся сознательно открытым операторским шагом — это описано в плане, а не расхождение.**

### Этап 3 — Полный реестр жизненного цикла данных

| Пункт | Статус | Доказательство |
|---|---|---|
| Purge `reminder_occurrence_history` по `platform_user_id`, retired id — не условие удаления | **PASS** | `platformUserFullPurge.ts:40` (`CONTENT_TABLES`); отдельный reconcile CLI не участвует в purge-гейте |
| `platformUserFullPurge.devDbProof.test.ts`: opt-in, admin socket, только `bersoncarebot_test`, REPEATABLE READ + безусловный ROLLBACK, не переизобретает алгоритм | **PASS** | файл 1049 строк, флаг `RUN_PLATFORM_USER_PURGE_DB=1`, вызывает реальные `collectPurgeArtifactKeys`/`runWebappPurgeCoreInTransaction` |
| `journalLifecycleRegistry.contract.test.ts`, `be_appointment_events` снят из реестра, записан в non-journal decisions | **PASS** | `journal-lifecycle-registry.ts:866` |
| `RECORDED_REGISTRY_FK_DIVERGENCES` — три FK-расхождения остаются ОТКРЫТЫМИ, не замаскированы | **PASS** | `platformUserFullPurge.devDbProof.test.ts:86-90`, реестр не подделан под живую FK |
| E1 `message_log` — окно хранения | **STALE в самом плане, по факту PASS**: `message_log` retention реализован (`journal-lifecycle-registry.ts:162-176`, миграция `20260827T183500_...message_log.sql`), но раздел «E1» тела плана (строки ~270-274) всё ещё написан как «не имеет окна». Шапка плана (строка 42) отдельно фиксирует E1 как закрытый — противоречие внутри одного документа |
| E2 terminal `media_upload_sessions` — без owner-решения, purge не добавлен молча | **PASS** | реестр держит `retention.kind: 'owner-question'` (`OQ-TERMINAL-UPLOAD-SESSION-WINDOW`), тест проверяет присутствие этого open-question id |
| Публичный destructive route остаётся выключен | **PASS** | `permanent-delete/route.ts` безусловно возвращает `account_purge_disabled` (409) |
| Vitest-прогон `journalLifecycleRegistry.contract.test.ts` | **BLOCKED (окружение)** | в этом worktree нет `node_modules` (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: vitest not found`) — не факт о тесте, факт об изоляции worktree аудита |

**Вывод этапа 3: PASS по коду; один документный дефект (E1 текст устарел, шапка плана расходится с телом) — синхронизировать документацию.**

### Этап 4 — Один контракт результата фоновой операции

| Пункт | Статус | Доказательство |
|---|---|---|
| Multipart cleanup: не «удалили → проглотили ошибку S3 → success» | **PASS** | `media-multipart/cleanup/route.ts:70-101` больше не трогает S3/строку напрямую — стейджит в общий `pending_delete`, `success = errors === 0` |
| Retry identity (`s3_key`/`upload_id`) не теряется до подтверждённого Abort/Delete | **PASS** | `s3MediaStorage.ts:1329-1427`, явные сообщения "retry identity kept" / "retry requested" |
| Preview/purge route: `errors > 0` не даёт `success:true`, terminal `skipped` не красит job | **PASS** | `media-preview/process/route.ts:53-68`, `media-pending-delete/purge/route.ts:56-70` |

**Вывод этапа 4: PASS.**

### Этап 5 — Завершить медиа как один поток

| Пункт | Статус | Доказательство |
|---|---|---|
| Single-PUT `pending` — та же leased/CAS state machine, что hosted-cover/multipart/pending-delete | **PASS** | миграция `20260828T011302_make_media_purge_one_leased_database_door.sql:92-110`, `v_staged_single_put` |
| Одна preview-door для doctor/patient (`catalogMediaLadderLookup`), нет клиентской утечки на youtube/vk | **PASS** | `catalogMediaLadderLookup.ts:1-133`; grep по `youtube.com|ytimg|vk.com` в пациентском/докторском UI пуст (кроме admin VK-OAuth конфига) |
| Private/deleted/unsupported → terminal `skipped`; transient → bounded retry → `failed` | **PASS** | `mediaPreviewWorker.ts:461-514,566-603` |
| Poster @1s→@0s fallback (короткие ролики) | **PASS** | `extractPosterWithFallback.ts`, используется обоими caller'ами |
| VK owner-gate реален, не обходится | **PASS** | `hostedVideoThumbnail.ts:268-324`, `system-settings/registry.ts:167` — `vk_video_service_token` отделён от `vk_community_access_token` |
| `.max(256)` снят с `operatorJobs` (реестр мог перерасти лимит и сломать парсинг снапшота) | **PASS, реальный фикс** | `pgCuratedSystemHealthDiagnostics.ts:158-162` |

**Вывод этапа 5: все пункты чек-листа плана — PASS, включая VK owner-gate (корректно остаётся заблокированным).**

#### Не отражено в плане: 3 коммита после последней синхронизации (588f61445)

План последний раз правился коммитом `588f61445` (28.08 09:26). После него на ветку легли (и уже задеплоены на
TEST, см. §3) три коммита с продуктовым содержанием под тем же номером `#1090`, которых план не описывает:

- `7ee7d67c5` — новая продуктовая политика: submission-видео пациента короче 10 секунд отклоняется на трёх
  уровнях (клиентский пробинг длительности, presign-роут, серверный ffprobe-рекheck в transcode). Это НЕ
  входит в scope системного аудита (не A–E finding), это новое product-правило, введённое попутно.
- `2ff27e022` — рефактор `probeVideoDurationSeconds` (округление вынесено в отдельный helper, нужно для
  политики выше) + правки мобильной раскладки шапки врача (`DoctorTodayQuickActions`,
  `ScheduleCalendarTab`, `doctorWorkspaceLayout.ts`) — эта часть коммита к медиа/health вообще не относится,
  это несвязанная UI-правка, приехавшая под тем же task-номером.
- `6f924fe1d` (текущий HEAD) — закрывает дыру предыдущей политики: не измеренная на клиенте длительность
  раньше пропускала проверку, теперь отклоняется `video_metadata_unavailable` (400).

Отдельно на ветке лежат 4 несвязанных коммита мобильной навигации расписания врача
(`8e0f99e05, b92366f51, 33627b780, b623aabee`) — не относятся к системному плану вообще, просто попутный груз
интеграционной ветки. Упоминаю только потому, что они меняют интегральный SHA, который проверяет full CI ниже.

**Это не regression и не нарушение repo-rule** (новая продуктовая политика — законное решение владельца/лида),
но это **документный разрыв**: план и `OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md` не фиксируют, что «завершение
медиа» на самом деле включает ещё и 10-секундный минимум для program-submission видео — это новый owner-facing
контракт без записанного acceptance.

### Этап 6 — Быстрые защиты в CI

| Пункт | Статус | Доказательство |
|---|---|---|
| Три отдельных параллельных GH job: `test-db-privileges`, `test-scripts`, `privileges-generated` | **PASS** | `.github/workflows/ci.yml:55-81`, не хвост общего прогона |
| `findMigrationTimestampCollisions`, 4 исторические группы зафиксированы как состав, оба раннера отказывают на новом совпадении | **PASS** | `migration-order.mjs:91-137`; `migrate-local.mjs:21,244`; `run-webapp-drizzle-migrate.mjs:26,283-291`. Путь в плане (`deploy/postgres/migrate-local.mjs`) неточен — фактически `deploy/postgres/privileges/migrate-local.mjs` — косметика, не расхождение по сути |
| Пропущенный schedule artifact красит deploy-гейт | **PASS** | подтверждено этапом 2 (`--verify-installed`) |

**Вывод этапа 6: PASS.**

### Этап 7 — Одна связная живая приёмка и синхронизация документов

| Пункт | Статус | Доказательство |
|---|---|---|
| Route crawl doctor/patient/global_admin, 0 отказавших страниц | **PASS утверждения плана, но без artifact в репозитории** | `runs/test-interactive-acceptance/crawl.mjs` существует и реализует именно то поведение, которое план описывает (логин, ролевые префиксы, критерий page pass/fail, запись `out/crawl-*.json`); `out/` в рабочем дереве отсутствует — артефакт не сохранён (согласуется с текстом плана «временные файлы... удалены через UI», но конкретно crawl-JSON план вообще не цитирует путём) |
| `clinic admin` роль в живом проходе | **FAIL по охвату скрипта** | `crawl.mjs:22-39` определяет только `doctor`, `patient`, `global_admin` — роли `clinic_admin` в скрипте физически нет; «полный проход под 4 ролями» недостижим текущим инструментом, пока роль не добавлена |
| `media_files` INSERT grant gap (`delete_claim_token`) закрыт живым Drizzle-driven тестом | **PASS** | `relation-access.test.mjs:12-78` реально импортирует `db/schema/schema.ts` через `tsx`, не хардкод-список; независимый аудит `docs/_TODO/runs/MEDIA_FILES_INSERT_GRANT_AUDIT_2026-08-28.md` подтверждает fault-injection |
| `deploy-test.sh` PASS на `90a8d35ec` | **PASS** | `/var/log/bersoncarebot/deploy-test/deploy-test.20260828T051842Z.IRh4vS.log` — хвост `deploy-test: PASS branch=feat/doctor-ui-rebuild head=90a8d35ecf1` |
| `deploy-test.sh` PASS на текущем HEAD `6f924fe1d` | **PASS (новое, план не упоминает)** | `/var/log/bersoncarebot/deploy-test/deploy-test.20260828T080223Z.GiJTiO.log` — хвост `deploy-test: PASS branch=feat/doctor-ui-rebuild head=6f924fe1d98 B0/post-B0 only`. TEST реально несёт текущий HEAD, включая недокументированные коммиты §5 |

**Вывод этапа 7: продуктовый код и privilege-гейт PASS; сам финальный проход по плану (§7) описывает более раннюю
точку (`90a8d35ec`), а не текущий HEAD — TEST уже обновлён дальше плана, живая приёмка новых пунктов (10s-политика,
mobile-навигация) не выполнялась.**

## 2. Раздел «Не подтверждено живьём» — повторная проверка

| Пункт | Статус на 28.08 |
|---|---|
| Полный public booking с новой сессией после подтверждения телефона | **BLOCKED (owner/lead action, не секрет)** — по-прежнему не подтверждено; ни один коммит после `588f61445` его не закрывает. Не требует внешнего секрета, требует живого прогона на TEST |
| Подтверждение контакта / записи / реальное напоминание через узкие роли | **BLOCKED (owner/lead action)** — не подтверждено, консистентно с планом |
| Media preview/cleanup/video на TEST; YouTube под doctor/patient; VK owner-gated | **ЧАСТИЧНО STALE**: YouTube-часть подтверждена живьём дважды (`206be5478` в плане, `90a8d35ec`/`6f924fe1d` через deploy-test PASS + media-retry live run с `PASS×4` в Stage 7); VK по-прежнему честно заблокирован токеном. Раздел «Не подтверждено живьём» стоит сузить: YouTube-подпункт закрыт, VK — нет |
| mTLS wrong-cert refusal (текущий scope, БЕЗ overlap/rotation — это отдельный `#1085`) | **BLOCKED (owner/lead action)** — не подтверждено, ни кода, ни живого прогона не найдено. Не требует секрета, требует живого TLS-хендшейка с неверным сертификатом на named-среде |
| Полный продуктовый проход patient/doctor/clinic admin/global admin | **BLOCKED, частично инструментальный пробел**: doctor/patient/global_admin прошли `crawl.mjs` (Stage 7, PASS), но артефакт не сохранён в репо и `clinic_admin` роль в самом скрипте отсутствует — нужно сначала расширить `crawl.mjs`, потом прогнать |

## 3. taskdb против кода и плана

| Карточка | taskdb статус | Соответствие факту |
|---|---|---|
| `#1085` (Слой прав БД v3, план `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`) | `doing` | **Верно.** Блок карточки дословно повторяет открытые пункты «Актуальное состояние на 27.08.2026» того плана (retention/rotation, mTLS host proof, снятие переходных revoke, архитектурный follow-up, PROD-gate) — все пять пунктов действительно ещё `[ ]` в плане и подтверждены этим аудитом как открытые (см. §2). Ложного статуса нет |
| `#1088` (поиск замаскированных catch-ошибок, план `RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md`) | `doing` | **Формально верно, но одна из двух половин карточки уже закрыта.** Плановый документ `RETENTION_SWEEPS_NEVER_RAN` полностью вычеркнут (`[x]` на всех пунктах, включая раздел «закрыто отдельной машиной состояний (27–28.08)», который и есть системный D2/C3). Вторая половина карточки — широкий поиск замаскированных `catch` по всему коду и класс «пустой self-UPDATE» (142778 строк) — не имеет ни одного найденного doc/коммита с результатом; она остаётся реально открытой. Статус `doing` для карточки в целом — верный, но лид должен знать, что retention-часть можно закрыть отдельной строкой/пометкой в плане, а не тянуть как единый неопределённый остаток |
| `#1090` (видео на TEST не пересобиралось, план `OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`) | `done` 🟡 ждёт-приёмки ✓test ✓audit | **Технически верно, но неполно.** Чек-лист «Превью для видео по ссылке» в этом плане — весь `[x]` кроме VK owner-gate, консистентно с systemic-планом. НО три коммита `7ee7d67c5/2ff27e022/6f924fe1d` (10-секундная политика + недоизмеренное видео) легли под тем же номером `#1090` уже ПОСЛЕ последней правки обоих планов и не описаны нигде — «ждёт-приёмки» технически относится к устаревшему снимку работы. Не ложный статус (никто не соврал), но owner при приёмке увидит меньше, чем реально задеплоено |
| `#1092` (превью YouTube/VK, план `OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`) | `blocked` ⏳ждёт | **Верно.** Единственная причина блокировки — отсутствующий `vk_video_service_token`, подтверждено кодом (`hostedVideoThumbnail.ts`) и taskdb-текстом дословно |

**Ложных статусов не найдено.** Единственная точная правка, которую стоит сделать лиду (не аудитору — правило
§0/§1 запрещает мне трогать таблицу): дописать в план `OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md` три
недостающих коммита (`7ee7d67c5`, `2ff27e022`, `6f924fe1d`) под тем разделом, где уже стоит YouTube-чеклист, и
синхронизировать `SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`:
- §E1 (message_log) текст тела — противоречит собственной шапке плана (строка 42);
- ссылка на `BLIND_KILL_SET_2026-08-27.md` для live A/B probe — файл старше коммита, который она подтверждает;
- раздел «Не подтверждено живьём» — сузить media-подпункт (YouTube закрыт, VK остаётся).

## 4. Свежесть CI / push / deploy

- **Текущий SHA:** `6f924fe1d98e03545bd47051a152f59d839a4718`, ветка `feat/doctor-ui-rebuild`, полностью
  запушен (origin указывает на тот же коммит, `git rev-list` в обе стороны — 0).
- **GitHub Actions:** workflow `CI` (`ci.yml`) триггерится только на `push: [main, development]` и `pull_request`
  — на `feat/doctor-ui-rebuild` он в принципе не запускается автоматически, PR не открыт. Автоматически на
  каждый push здесь гоняется только workflow `Security` — все последние прогоны `success`, включая текущий HEAD
  (`run 33153616035`). Это не отменяет требование локального full CI per §9 — просто GH Actions «зелёный»
  здесь не относится к текущему коммиту в смысле §9.
- **Последний зафиксированный green full `pnpm run ci`:** коммит `206be5478` (сам план это утверждает: «полный
  CI закрыт на `206be5478`»). Дальше по HEAD — **29 коммитов**, включая:
  - изменения DB-access chokepoint: `declaration.ts`, `generate.mjs`, `relation-access.ts` (+colonn grant),
    `journal-lifecycle-registry.ts`;
  - две новые forward-миграции (`.../20260827T232914_close_operator_push_and_media_capability_gaps.sql`,
    `.../20260828T011302_make_media_purge_one_leased_database_door.sql` и другие, полный список — `git diff
    --stat 206be5478..HEAD`);
  - изменения generated privilege SQL для обеих управляемых баз.

  По критерию §9 («shared-пакеты, ..., DB-access chokepoint, RLS/policy/invariant framework») это ровно тот
  случай, где full CI даёт новый сигнал — не ритуал. **Целевые гейты уже покрыли каждый коммит по отдельности**
  (`test:db-privileges` 172/172, `test:scripts`, `generate-cli --check/--census`, `relation-access.test.mjs`,
  webapp typecheck/ESLint по затронутым файлам — все зелёные построчно, подтверждено в коммитных сообщениях и
  независимых аудитах), но ни один совокупный `pnpm run ci` не прогонялся на объединённом 29-коммитном пакете.
  **Вывод: финальный full CI — не блокирован ничем внешним, реально нужен и остаётся открытым пунктом** (сам
  owner-goal его называет явно: «финальный CI»). Раздутия скоупа тут нет — критерий §9 объективно выполняется
  накопленным chokepoint-риском, а не словом «перед деплоем».
- **Deploy TEST:** текущий HEAD **уже развёрнут** —
  `/var/log/bersoncarebot/deploy-test/deploy-test.20260828T080223Z.GiJTiO.log` заканчивается `deploy-test: PASS
  branch=feat/doctor-ui-rebuild head=6f924fe1d98 B0/post-B0 only`. То есть TEST обогнал зафиксированный в плане
  live-проход (который описывает состояние на `90a8d35ec`): интеграционный риск деплоя закрыт, риск
  **непрогнанного накопленного full CI** и **непринятого нового product-контракта** (10s-минимум видео,
  §1 выше) — открыт.

## 5. Дедуплицированный остаток, по порядку

### Можно исправить без владельца
*(finding-уровня нарушений не найдено — весь список ниже документный/процедурный, не продуктовый баг)*

- Синхронизировать 3 документа с фактическим кодом (см. §3): дописать `7ee7d67c5/2ff27e022/6f924fe1d` в
  `OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`; поправить тело §E1 и ссылку на `BLIND_KILL_SET` в
  `SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`; исправить путь `migrate-local.mjs` в тексте плана
  (косметика).
- Добавить роль `clinic_admin` в `runs/test-interactive-acceptance/crawl.mjs` (сейчас там только
  doctor/patient/global_admin) — необходимая подготовка перед пунктом «e» из §2.

### Можно проверить без владельца (нужен только живой прогон на TEST, не секрет)
- Прогнать один накопленный **full `pnpm run ci`** на текущем HEAD (`6f924fe1d`) под host-lock
  (`run-tests.sh`) — единственный реально непокрытый repo-level риск по §9 (см. §4).
- Живой проход **public booking** (новая сессия после подтверждения телефона) — пункт «а» §2.
- Живой проход **contact/booking confirmation + напоминание** через узкие роли — пункт «б» §2.
- Живой **mTLS wrong-cert refusal** на named-среде (только текущий refusal-scope, БЕЗ overlap/rotation — то
  отдельный этап `#1085`) — пункт «г» §2.
- Расширенный **route crawl** с `clinic_admin` (после добавления роли в скрипт) + сохранить `out/crawl-*.json`
  как приложенный evidence, а не удалять после прохода — пункт «д» §2.
- Живая приёмка новой **10-секундной политики program-submission видео** (`7ee7d67c5`/`6f924fe1d`) — этого
  сценария нет вообще ни в одном плане, значит и живого прохода под ним не было; таргетные unit-тесты зелёные,
  но UI-контракт («патент видит понятную ошибку, а не общий 400») никто глазами не смотрел.

### Действительно требует внешнего секрета/owner-решения
- **VK hosted-preview**: `vk_video_service_token` со scope `video` в `system_settings` — без него VK-обложка
  недостижима по коду (не забыта, а осознанно заблокирована).
- **Retention/rotation живое измерение** и **PROD A→B0 переход** — оба явно закреплены как отдельные
  будущие owner-gated этапы в `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`, не в скоупе текущего пакета.
- **`message_log` policy-расхождение** (объявлен `anonymised` в purge-реестре, но retention sweep делает
  физический `DELETE`) и остальные два FK-расхождения в `RECORDED_REGISTRY_FK_DIVERGENCES` — зафиксированы
  как открытые владельцем решения по трём политикам purge (Этап 3), не блокируют текущий TEST-деплой.
- **Терминальные `media_upload_sessions`**: нужно owner-решение — отдельное окно хранения или жить до
  удаления `media_id` (`OQ-TERMINAL-UPLOAD-SESSION-WINDOW`, уже зафиксировано открытым).

## Итог

Продуктовый код по этапам 1–6 системного плана — **PASS**, без единого достижимого нарушения owner requirement
или repo-rule, найденного этим проходом. Этап 7 — код-часть PASS, живая часть уже частично обогнала сам план
(TEST несёт HEAD `6f924fe1d`, не `90a8d35ec`, как написано в документе) и частично не начата (public booking,
mTLS, contact/reminder narrow-role proof, полный 4-ролевой crawl). Единственный реальный интеграционный риск,
который оправдывает финальный `pnpm run ci` по критерию §9, — 29 накопленных коммитов с изменениями
DB-access chokepoint после последнего зелёного полного прогона (`206be5478`); он не запущен этим аудитом
(запрещено брифом) и остаётся открытым действием лида. taskdb ложных статусов не содержит; три коммита
(`7ee7d67c5`, `2ff27e022`, `6f924fe1d`) реализуют не описанную нигде продуктовую политику (10s-минимум видео)
под тем же task-номером `#1090` — задокументировать и принять отдельно от hosted-preview.

**НЕ СДЕЛАНО этим аудитом (по брифу, намеренно):** полный CI не запускался; PROD и домены не проверялись;
продуктовый код и taskdb не менялись; ни один из пунктов «можно проверить без владельца» в §5 не был выполнен
живьём (это работа лида после приёмки этого отчёта, не аудитора).
