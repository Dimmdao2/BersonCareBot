# Полное исследование критичных test-targets — GPT-5.6 Sol — 2026-07-30

Источник: `/home/dev/brain/runs/agent-port/codex-auditor-adhoc-2026-07-29T23-08-24-895Z.json`

Восстановленный первичный raw-run:
`/home/dev/brain/runs/codex-raw/2026-07-29T23-05-59-984Z-codex-auditor-adhoc-2026-07-29T22-50-15-747Z.jsonl`

Ниже сохранён полный текст результата read-only исследования без сокращений. Канонические решения и исполняемые
пункты остаются в `TEST_SUITE_AUDIT_2026-07-29.md`; этот файл хранит доказательную базу исследования.

## A. Восстановление и точечные проверки

Исследование восстановлено, а не начато заново. Primary evidence — raw-журнал; служебная запись использована для восстановления перечня поздних команд, stdout которых raw свернул в truncation. Сессия действительно завершилась системным прерыванием в read-only sandbox (`status=blocked`, `phase=blocked_system`, `repoWrite=false`).

Raw содержит 106 JSONL-записей; `wc -l` показывает 105 переводов строки, потому что финальная запись без завершающего newline:

```bash
awk 'END {print NR}' /home/dev/brain/runs/codex-raw/2026-07-29T23-05-59-984Z-codex-auditor-adhoc-2026-07-29T22-50-15-747Z.jsonl
wc -l /home/dev/brain/runs/codex-raw/2026-07-29T23-05-59-984Z-codex-auditor-adhoc-2026-07-29T22-50-15-747Z.jsonl

jq '{runId,status,exitCode,phase,requestedPhase,durationMs,resultText,session,sandbox:{mode:.sandbox.mode,repoWrite:.sandbox.repoWrite}}' \
  /home/dev/brain/runs/agent-port/codex-auditor-adhoc-2026-07-29T22-50-15-747Z.json

tail -n 1 \
  /home/dev/brain/runs/codex-raw/2026-07-29T23-05-59-984Z-codex-auditor-adhoc-2026-07-29T22-50-15-747Z.jsonl
```

Свежий снимок: `HEAD=c42e3b880db8`; в `apps/**` сейчас 33 tracked test/spec-файла. Worktree уже был грязным и оставлен без изменений.

```bash
git rev-parse --short=12 HEAD
git status --short
git ls-files 'apps/**' | rg '\.(test|spec)\.(ts|tsx)$' | wc -l
git ls-files 'apps/**' | rg '\.(test|spec)\.(ts|tsx)$' | sort
```

Текущий coverage-map кандидатов получен так:

```bash
test_paths=$(git ls-files 'apps/**' | rg '\.(test|spec)\.(ts|tsx)$')
for evidence_pattern in \
  'sessionCookie|decodeSessionCookie|sessionEpoch|email-password|password_reset|PasswordChange|EmailChallenge|EmailOtp|OtpDecaying|AuthRateLimit' \
  'csrfOrigin|requireDoctorWorkspaceApiContext|requirePlatformOperationsApiContext|requireStaffSecurityApiSession' \
  'relayOutboundRoute|outgoingDeliveryQueue|outgoingDeliveryWorker' \
  'registryAcquiringGateway|acquiring-charge|acquiringWebhook|PatientPayments' \
  'Idempotency|integratorEventSemanticHash|integrator/events' \
  'OrganizationProvisioning|PatientInvites' \
  'PlatformUserMerge|platformUserFullPurge|strictPlatformUserPurge' \
  'BookingScheduling|PatientBookings|package_usages' \
  'media.*playback|assertMediaPlaybackAccess|programSubmissionPlaybackAccess' \
  'row_security|RLS|tenant isolation'
do
  printf 'PATTERN %s\n' "$evidence_pattern"
  rg -l "$evidence_pattern" $test_paths || true
done
```

Oracle и ограничения инфраструктуры повторно прочитаны только адресными диапазонами:

```bash
nl -ba docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md \
  | sed -n '642,725p;780,845p;870,965p'
nl -ba docs/_TODO/testsuite-rewrite-list.md | sed -n '1,90p'
nl -ba docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md | sed -n '1,120p'
```

Все остальные evidence-ссылки ниже получены через `nl -ba <точный файл> | sed -n '<точный диапазон>p'`. БД, серверы, тест-раннеры и внешние провайдеры не запускались.

## B. CRITICAL NOW — без DB/RLS

- **Сессионная cookie и временные границы.**  
  **Модуль:** [sessionCookie.ts:73–181](/home/dev/dev-[redacted-token].ts:73), boundary продления [sessionCookie.ts:227](/home/dev/dev-[redacted-token].ts:227).  
  **Инвариант:** принимается только подписанная, структурно полная, неистёкшая сессия; абсолютный возраст нельзя продлить; проверяются обе стороны TTL/max-age.  
  **Поломка:** пропущенный `issuedAt` уже позволял обходить revocation/max-age; снятая подпись или неверная граница превращают украденную cookie в долгоживущую сессию.  
  **Oracle:** owner T2 [TEST_SUITE_AUDIT:675–681](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:675) плюс подтверждённый fail-closed контракт [sessionCookie.ts:93–106](/home/dev/dev-[redacted-token].ts:93).  
  **Покрыто:** текущий unit проверяет round-trip, одну точку абсолютной границы, укороченные staff-окна и простой tamper [sessionCookie.unit.test.ts:60–99](/home/dev/dev-[redacted-token].unit.test.ts:60).  
  **Недостаточно:** нет истёкшей/битой/неполной формы, обеих сторон границ, malformed operator-session и публичного renewal response.  
  **Слой:** `*.unit.test.ts`. **DB/RLS:** нет; начинать можно сейчас.

- **Login / password recovery / password change — HTTP-семантика.**  
  **Модули:** [login/route.ts:32–110](/home/dev/dev-[redacted-token]-password/login/route.ts:32), [reset/route.ts:28–111](/home/dev/dev-[redacted-token]-password/reset/route.ts:28), [password/change/route.ts:21–120](/home/dev/dev-[redacted-token].ts:21).  
  **Инвариант:** неверный пароль не раскрывает наличие учётки; повторная ошибка получает устойчивый lockout; reset purpose-bound, даёт нейтральный отказ и инвалидирует старые сессии до смены credential; частичный успех смены пароля явно сообщается клиенту.  
  **Поломка:** account enumeration, перебор паролей, reset чужим OTP-purpose либо сохранение украденной сессии после восстановления доступа.  
  **Oracle:** owner T2 [TEST_SUITE_AUDIT:675–681](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:675) и публичные route outcomes.  
  **Покрыто:** legacy PostgreSQL-тесты существуют для rate-limit и отдельных OTP-функций; route coverage текущая поисковая команда не нашла.  
  **Недостаточно:** DB-тесты не доказывают публичную нейтральность ответов, выбор purpose, fail-closed ветви и partial-success response.  
  **Слой:** `*.route.test.ts`, с реальным password hash и fake-портами состояния. **DB/RLS:** route-контракт можно писать сейчас; persistence/concurrency — секция C.

- **CSRF origin boundary.**  
  **Модули:** [csrfOrigin.ts:95–220](/home/dev/dev-[redacted-token].ts:95), [proxy.ts:12–37](/home/dev/dev-[redacted-token].ts:12).  
  **Инвариант:** unsafe browser mutation допускается только из canonical same-origin; отсутствующие или неоднозначные source headers закрываются; M2M/internal/payment exemptions — точный закрытый набор, а не wildcard.  
  **Поломка:** сторонний сайт выполняет мутацию с пользовательской cookie либо обычный API-маршрут ошибочно попадает в без-CSRF класс.  
  **Oracle:** подтверждённый публичный proxy-контракт — reject с `csrf_origin_forbidden`, exact exemption lists [csrfOrigin.ts:1–78](/home/dev/dev-[redacted-token].ts:1).  
  **Покрыто:** текущий список тестов не содержит CSRF/proxy coverage.  
  **Слой:** `*.route.test.ts`, property-матрица headers внутри него. **DB/RLS:** нет; можно сейчас.

- **Role/capability guards до DB.**  
  **Модуль:** [requireRole.ts:244–285](/home/dev/dev-[redacted-token]-layer/guards/requireRole.ts:244), [requireRole.ts:658–699](/home/dev/dev-[redacted-token]-layer/guards/requireRole.ts:658), [requireRole.ts:707–759](/home/dev/dev-[redacted-token]-layer/guards/requireRole.ts:707).  
  **Инвариант:** unsigned, wrong-role, restricted-security и membership/capability mismatch закрываются; global platform operations не наследуют clinic grant; doctor workspace требует разрешённую организационную membership.  
  **Поломка:** пациент получает doctor route, global admin случайно наследует clinic scope либо staff действует в чужой клинике.  
  **Oracle:** публичные guard outcomes и T1 owner-matrix [TEST_SUITE_AUDIT:655–664](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:655).  
  **Покрыто:** текущий coverage-map не нашёл тестов этих guards.  
  **Слой:** `*.route.test.ts` на репрезентативных маршрутах, проверяющий итоговый HTTP/data outcome. **DB/RLS:** решение guard можно начать на fake membership port; фактическая tenant-wall остаётся в C.

- **Patient organization resolver.**  
  **Модуль:** [patient-organization/service.ts:31–116](/home/dev/dev-[redacted-token]-organization/service.ts:31).  
  **Инвариант:** inactive/foreign-user enrollments игнорируются; неподтверждённая target-организация отвергается; при нескольких клиниках без валидного выбора требуется явный selection.  
  **Поломка:** запрос пациента получает контекст другой клиники и затем читает её медицинские данные.  
  **Oracle:** публичный discriminated result модуля и owner-инвариант канонического пациента [TEST_SUITE_AUDIT:701–703](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:701).  
  **Покрыто:** совпадений в текущих тестах нет.  
  **Слой:** `*.unit.test.ts`. **DB/RLS:** pure resolver можно сейчас; repo/enrollment proof — в C.

- **Подписанная внешняя доставка `relayOutboundRoute`.**  
  **Модуль:** [relayOutboundRoute.ts:23–70](/home/dev/dev-[redacted-token].ts:23), [relayOutboundRoute.ts:174–215](/home/dev/dev-[redacted-token].ts:174), [relayOutboundRoute.ts:251–375](/home/dev/dev-[redacted-token].ts:251).  
  **Инвариант:** HMAC и time window обязательны; одновременно выполняющийся duplicate не отправляется второй раз; policy denial не превращается в provider incident; email/SMS provider failure получает правильную классификацию; web-push contract не меняется.  
  **Поломка:** поддельная или повторная внешняя отправка пациенту, двойное сообщение либо потеря operator incident.  
  **Oracle:** прямое owner-требование [testsuite-rewrite-list:63–67](/home/dev/dev-projects/BersonCareBot/docs/_TODO/testsuite-rewrite-list.md:63).  
  **Покрыто:** текущий coverage-map не нашёл тестов route/relay.  
  **Слой:** `*.route.test.ts` через `fastify.inject`, provider и incident recorder — внешние fakes. **DB/RLS:** нет для этого контракта; можно сейчас.

- **Эквайринг: provider boundary и webhook authentication.**  
  **Модули:** [registryAcquiringGateway.ts:39–132](/home/dev/dev-[redacted-token].ts:39), provider adapters в `apps/webapp/src/infra/payments/*PaymentProvider.ts`, [acquiring-charge/route.ts:35–124](/home/dev/dev-[redacted-token]/%5BuserId%5D/acquiring-charge/route.ts:35), [patient-acquiring-webhook/route.ts:35–119](/home/dev/dev-[redacted-token]-acquiring-webhook/%5Bprovider%5D/route.ts:35).  
  **Инвариант:** глобально выключенный provider отказывает; сумма/валюта/пациент/idempotency-key доходят без подмены; подпись webhook fail-closed; foreign patient нельзя зарядить; provider error не становится публичным success.  
  **Поломка:** списание не с того пациента/на неверную сумму, принятие поддельного webhook, потеря refund-idempotency или ложная запись оплаты.  
  **Oracle:** owner T4 [TEST_SUITE_AUDIT:696–699](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:696) и provider schemes [ACQUIRING_INTEGRATION/LOG:45–57](/home/dev/dev-projects/BersonCareBot/docs/ACQUIRING_INTEGRATION/LOG.md:45).  
  **Покрыто:** старые adapter-тесты описаны в историческом LOG, но в текущих tracked tests их нет; coverage-map не нашёл acquiring coverage.  
  **Слой:** `*.unit.test.ts` для adapter/registry и `*.route.test.ts` для charge/webhook. **DB/RLS:** криптография и HTTP можно сейчас; ledger/tenant/idempotency — C.

- **Semantic idempotency межсервисных событий.**  
  **Модули:** [integratorEventSemanticHash.ts:9–140](/home/dev/dev-[redacted-token].ts:9), [integrator events route:46–129](/home/dev/dev-[redacted-token].ts:46), [route:215–245](/home/dev/dev-[redacted-token].ts:215).  
  **Инвариант:** порядок object keys не влияет; только документированные volatile-поля игнорируются; тот же key с другим business payload даёт conflict; transient failure не кешируется как успех.  
  **Поломка:** легитимное событие подавляется как duplicate либо один M2M retry дважды изменяет запись/дневник/напоминание.  
  **Oracle:** публичный межсервисный контракт [INTEGRATOR_CONTRACT:93–104](/home/dev/dev-projects/BersonCareBot/apps/webapp/INTEGRATOR_CONTRACT.md:93) и комментарий hash-модуля [integratorEventSemanticHash.ts:3–8](/home/dev/dev-[redacted-token].ts:3).  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.unit.test.ts` для semantic hash, `*.route.test.ts`; настоящий `*.contract.test.ts` допустим только для webapp↔integrator payload. **DB/RLS:** эти части можно сейчас; concurrent persistence — C.

## C. CRITICAL AFTER G0/T1 — настоящий PostgreSQL/RLS

- **Tenant/RLS principal matrix.**  
  **Модуль/boundary:** [run-a1-rls-conformance.ts:31–120](/home/dev/dev-[redacted-token]-a1-rls-conformance.ts:31) плюс RLS schema/functions.  
  **Инвариант:** own-org CRUD разрешён реальной непривилегированной роли; cross-org CRUD не меняет данные; missing principal закрывается; oracle-connection подтверждает конечное состояние.  
  **Последствие:** межклиническая утечка или изменение медицинских данных.  
  **Oracle:** owner matrix и DB fault injections [TEST_SUITE_AUDIT:655–671](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:655).  
  **Покрыто:** A1 доказывает только SELECT `be_appointments` через фиксированные staff/patient fixtures; legacy RLS-тесты узкие и пишут в shared DEV.  
  **Слой:** `*.postgres.integration.test.ts`. **Сейчас нельзя:** harness остаётся `contract-only` [pg-harness.ts:4–22](/home/dev/dev-[redacted-token]-layer/testing/pg-harness.ts:4), прямой DEV запрещён [TEST_SUITE_AUDIT:901–908](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:901).

- **Session epoch, logout и password-reset revocation.**  
  **Модуль:** [auth/service.ts:991–1057](/home/dev/dev-[redacted-token].ts:991), [auth/service.ts:1150–1183](/home/dev/dev-[redacted-token].ts:1150), reset boundary [reset/route.ts:91–108](/home/dev/dev-[redacted-token]-password/reset/route.ts:91).  
  **Инвариант:** DB-backed identity принимается только при точном epoch match; unreadable row fail-closed; logout/reset инвалидирует ранее скопированную cookie.  
  **Последствие:** украденная сессия переживает logout или восстановление пароля.  
  **Oracle:** owner T2 и центральный revocation contract в коде.  
  **Покрыто:** `sessionCookie.unit` не обращается к DB; session-epoch integration coverage не найден.  
  **Слой:** `*.postgres.integration.test.ts`, затем тонкий `*.route.test.ts`. **Сейчас нельзя:** нужна disposable DB.

- **OTP consume, attempts, decay lockout и purpose binding.**  
  **Модули/schema:** миграции `0232_email_otp_atomic_consume.sql`, `0247_email_challenge_atomic_attempts.sql`, `0248_otp_decaying_lockout.sql`, `0249_email_challenge_purpose_binding.sql`; auth email/phone ports.  
  **Инвариант:** конкурентный consume имеет одного победителя; wrong-attempt increments не теряются; lockout усиливается атомарно; OTP другого purpose не принимается.  
  **Последствие:** replay кода, обход lockout или использование login-кода для reset.  
  **Oracle:** owner T2 [TEST_SUITE_AUDIT:675–681](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:675) и schema contracts.  
  **Покрыто:** `pgEmailChallengeAtomicAttempts`, `pgEmailOtpPublicAtomicConsume`, `pgOtpDecayingLockoutAtomicEscalation`, `pgAuthRateLimitEvents` содержат сильные реальные concurrency-проверки, но opt-in пишут в shared DEV.  
  **Недостаточно:** не соответствуют новой disposable категории и не связывают полный route lifecycle.  
  **Слой:** `*.postgres.integration.test.ts`. **Сейчас нельзя.**

- **Organization provisioning.**  
  **Модули:** [organization-provisioning/service.ts:16–74](/home/dev/dev-[redacted-token]-provisioning/service.ts:16), [pgOrganizationProvisioning.ts:137–183](/home/dev/dev-[redacted-token].ts:137).  
  **Инвариант:** один валидный intent создаёт одну clinic/owner/specialist связку; retry идемпотентен; slug collision не оставляет частичных строк; чужой principal не провижинит.  
  **Последствие:** orphan clinic, неверный владелец или захват tenant slug.  
  **Oracle:** owner T4 [TEST_SUITE_AUDIT:689–692](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:689).  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.postgres.integration.test.ts`. **Сейчас нельзя.**

- **Patient invite lifecycle.**  
  **Модули:** [patient-invites/service.ts:77–229](/home/dev/dev-[redacted-token]-invites/service.ts:77), [pgPatientInvites.ts:140–243](/home/dev/dev-[redacted-token].ts:140), [pgPatientInvites.ts:320–385](/home/dev/dev-[redacted-token].ts:320).  
  **Инвариант:** новый invite supersedes pending; revoked/expired/exchanged/superseded не redeem; cross-org операции отказывают; concurrent redeem имеет одного победителя; email-send failure отменяет proof.  
  **Последствие:** чужой пользователь получает patient portal или один invite погашается несколько раз.  
  **Oracle:** owner T4 [TEST_SUITE_AUDIT:693–695](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:693).  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.postgres.integration.test.ts`, sender fake только на внешней границе. **Сейчас нельзя.**

- **Outgoing delivery queue и worker.**  
  **Модули:** [outgoingDeliveryQueue.ts:54–216](/home/dev/dev-[redacted-token].ts:54), [outgoingDeliveryWorker.ts:500–553](/home/dev/dev-[redacted-token].ts:500), [outgoingDeliveryWorker.ts:793–888](/home/dev/dev-[redacted-token].ts:793).  
  **Инвариант:** unique event enqueue; `SKIP LOCKED` не выдаёт job двум workers; sent/retry/dead transitions не теряются; stale processing восстанавливается; permanent/policy failures не ретраятся как transient.  
  **Последствие:** двойная внешняя доставка, бесконечный retry либо потерянное уведомление.  
  **Oracle:** [OUTGOING_DELIVERY_QUEUE.md:3–22](/home/dev/dev-[redacted-token]OUTGOING_DELIVERY_QUEUE.md:3).  
  **Покрыто:** текущих worker/queue tests нет.  
  **Слой:** `*.postgres.integration.test.ts` с fake dispatch boundary. **Сейчас нельзя.**

- **Durable M2M idempotency.**  
  **Модули:** [pgStore.ts:27–76](/home/dev/dev-[redacted-token].ts:27), [integrator events route:103–129](/home/dev/dev-[redacted-token].ts:103), [route:215–245](/home/dev/dev-[redacted-token].ts:215).  
  **Инвариант:** replay того же semantic request возвращает сохранённый результат; другой payload конфликтует; multi-instance race не перезаписывает чужой hash.  
  **Последствие:** повтор медицинской/booking мутации либо потеря нового события под старым key.  
  **Oracle:** public M2M contract; exact concurrent handler semantics требуют owner answer в G.  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.postgres.integration.test.ts`, при необходимости межсервисный `*.contract.test.ts`. **Сейчас нельзя.**

- **Acquiring ledger, webhook replay и refund transaction.**  
  **Модули:** [patient-payments/service.ts:66–120](/home/dev/dev-[redacted-token]-payments/service.ts:66), [payments/service.ts:497–551](/home/dev/dev-[redacted-token].ts:497), charge route [acquiring-charge/route.ts:60–124](/home/dev/dev-[redacted-token]/%5BuserId%5D/acquiring-charge/route.ts:60).  
  **Инвариант:** provider event записывается идемпотентно; status capture/refund сериализованы; сумма и tenant не меняются; provider success не оставляет ложное/частичное состояние.  
  **Последствие:** двойной capture/refund, потерянная оплата или деньги чужой клиники.  
  **Oracle:** owner T4 [TEST_SUITE_AUDIT:696–699](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:696).  
  **Покрыто:** текущих acquiring tests нет.  
  **Слой:** `*.postgres.integration.test.ts`. **Сейчас нельзя.**

- **Platform-user merge.**  
  **Модуль:** [pgPlatformUserMerge.ts:449–485](/home/dev/dev-[redacted-token]-merge/src/pgPlatformUserMerge.ts:449), public contract [PLATFORM_USER_MERGE.md:40–54](/home/dev/dev-[redacted-token]PLATFORM_USER_MERGE.md:40), dependent-data matrix [PLATFORM_USER_MERGE.md:142–167](/home/dev/dev-[redacted-token]PLATFORM_USER_MERGE.md:142).  
  **Инвариант:** deterministic locks и одна transaction; все medical/booking/payment refs repoint или dedupe; duplicate становится alias; hard blockers оставляют всё неизменным.  
  **Последствие:** потеря дневника/лечения/платежей, split identity или silent binding steal.  
  **Oracle:** `PLATFORM_USER_MERGE.md`.  
  **Покрыто:** `pgPlatformUserMerge.devDb.integration.test.ts` проверяет один простой rollback-сценарий [test:60–110](/home/dev/dev-[redacted-token].devDb.integration.test.ts:60).  
  **Недостаточно:** нет полного dependent matrix, blocker rollback и concurrency.  
  **Слой:** `*.postgres.integration.test.ts`. **Сейчас нельзя.**

- **Strict destructive purge.**  
  **Модуль:** [strictPlatformUserPurge.ts:245–381](/home/dev/dev-[redacted-token].ts:245), lifecycle lock contract [PLATFORM_USER_MERGE.md:131–140](/home/dev/dev-[redacted-token]PLATFORM_USER_MERGE.md:131).  
  **Инвариант:** exclusive lifecycle lock закрывает окно между artifact preflight и DELETE; webapp delete атомарен; post-commit external cleanup даёт честный `completed`/`partial_failed`/`needs_retry`.  
  **Последствие:** необратимая потеря не того пациента, orphan S3/интеграторных данных либо ложное сообщение об успешном удалении.  
  **Oracle:** архитектурный purge contract.  
  **Покрыто:** `platformUserFullPurge.devDb.integration.test.ts` только читает неизвестную/существующую строку и вообще не выполняет purge [test:24–60](/home/dev/dev-[redacted-token].devDb.integration.test.ts:24).  
  **Слой:** `*.postgres.integration.test.ts`, S3/provider fakes. **Сейчас нельзя.**

- **Booking overlap и package debit consistency.**  
  **Модули:** [pgPatientBookings.ts:117–205](/home/dev/dev-[redacted-token].ts:117), [memberships/service.ts:523–649](/home/dev/dev-[redacted-token].ts:523), [memberships/service.ts:1148–1225](/home/dev/dev-[redacted-token].ts:1148), unique debit schema [0137 migration:1–9](/home/dev/dev-[redacted-token]-migrations/0137_be_package_usages_consume_unique.sql:1).  
  **Инвариант:** concurrent booking не создаёт overlap; appointment получает не более одного package debit; balance не уходит ниже нуля; повторный recalc идемпотентен.  
  **Последствие:** двойная запись на слот, двойное списание оплаченного занятия или отрицательный баланс.  
  **Oracle:** публичные `slot_overlap`/append-only ledger contracts и migration comment.  
  **Покрыто:** `pgPatientBookings` — read-only smoke [test:34–65](/home/dev/dev-[redacted-token].devDb.integration.test.ts:34); scheduling tests покрывают отдельные read/deactivation seams, не race и не debit ledger.  
  **Слой:** `*.postgres.integration.test.ts` с реальными параллельными connections. **Сейчас нельзя.**

- **Media access/privacy.**  
  **Модули:** [media route:37–106](/home/dev/dev-[redacted-token]/%5Bid%5D/route.ts:37), [playback route:27–69](/home/dev/dev-[redacted-token]/%5Bid%5D/playback/route.ts:27), `assertMediaPlaybackAccess.ts` и access repo.  
  **Инвариант:** media row сначала exact organization scoped; UUID другой клиники не раскрывает существование/bytes; submission доступен только uploader либо staff той же клиники.  
  **Последствие:** утечка контрольного фото/видео и других медицинских материалов.  
  **Oracle:** [MEDIA_HTTP_ACCESS_AUTHORIZATION.md:8–35](/home/dev/dev-[redacted-token]MEDIA_HTTP_ACCESS_AUTHORIZATION.md:8).  
  **Покрыто:** текущих media access tests нет.  
  **Слой:** `*.postgres.integration.test.ts`, затем один `*.route.test.ts`. **Сейчас нельзя для доказательства tenant ACL.**

- **Medical-file FK survival.**  
  **Schema:** [0131_patient_files_media_file_id_fk.sql:1–17](/home/dev/dev-[redacted-token]-migrations/0131_patient_files_media_file_id_fk.sql:1), [patientFiles.ts:69–77](/home/dev/dev-[redacted-token].ts:69).  
  **Инвариант:** удаление media row сохраняет medical `patient_files` record и обнуляет ссылку.  
  **Поломка:** `CASCADE` удалит медицинскую карточку; `RESTRICT` заблокирует штатное удаление медиа.  
  **Oracle:** owner T5 [TEST_SUITE_AUDIT:705–706](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:705).  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.postgres.integration.test.ts` с fault injection `CASCADE`/`RESTRICT`. **Сейчас нельзя.**

- **Канонический patient UUID между клиниками.**  
  **Модули:** [patient-organization/service.ts:51–145](/home/dev/dev-[redacted-token]-organization/service.ts:51), `[redacted-token].ts`.  
  **Инвариант:** один canonical platform user может иметь разные org enrollments, но публичные ссылки обеих клиник сохраняют тот же patient UUID; org-local surrogate не подменяет identity.  
  **Поломка:** врач открывает данные другого пациента либо история одного человека раскалывается между clinic-local IDs.  
  **Oracle:** owner T5 [TEST_SUITE_AUDIT:701–703](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:701).  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.postgres.integration.test.ts`. **Сейчас нельзя.**

## D. IMPORTANT LATER

- **Reminder `markSeen` и broadcast recipients.**  
  **Модули:** `[redacted-token].ts`, `pgBroadcastEmailRecipients.ts`.  
  **Инвариант:** массив UUID реально обновляет/выбирает нужные строки. **Поломка:** напоминания остаются unseen или часть рассылки не получает email; это потеря доставки, но не auth/tenant/money/destructive boundary.  
  **Oracle:** [testsuite-rewrite-list:47–62](/home/dev/dev-projects/BersonCareBot/docs/_TODO/testsuite-rewrite-list.md:47).  
  **Покрыто:** текущий `markSeen` test проверяет лишь наличие строк `ANY`, `seen_at` и user text в сформированном SQL [pgReminderProjection.pg.test.ts:143–150](/home/dev/dev-[redacted-token].pg.test.ts:143); он не доказывает изменение строк. Broadcast test после cut отсутствует.  
  **Слой:** `*.postgres.integration.test.ts`. **DB dependency:** да; после harness.

- **Timezone UI/calendar boundaries.**  
  **Модуль:** `[redacted-token].tsx` и calendar/reminder routes.  
  **Инвариант:** timeline/payment/visit times используют выбранную IANA-zone и zone resolver честно отказывает. **Поломка:** неверно показанное время визита, но без доказанного обхода прав или порчи данных.  
  **Oracle:** [testsuite-rewrite-list:68–74](/home/dev/dev-projects/BersonCareBot/docs/_TODO/testsuite-rewrite-list.md:68).  
  **Покрыто:** legacy timezone test пинит SQL params через mock [timezoneContract.stage8.pg.test.ts:22–43](/home/dev/dev-[redacted-token].stage8.pg.test.ts:22), не UI и не route outcome.  
  **Слой:** `*.ui.test.tsx` и точечный `*.route.test.ts`. **DB dependency:** основной UI-contract можно сейчас.

- **Приоритет структурированного имени.**  
  **Модуль:** [patientGreetingPersonalizedName.ts:1–10](/home/dev/dev-[redacted-token]-home/patientGreetingPersonalizedName.ts:1) и shared patient-name formatter, когда он выбран owner-планом.  
  **Инвариант:** structured name побеждает конфликтующий `displayName`; fallback только при отсутствии structured fields. **Поломка:** неверное имя в UI, без критического security/data consequence.  
  **Oracle:** owner T5 [TEST_SUITE_AUDIT:703–704](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:703).  
  **Покрыто:** текущих тестов нет.  
  **Слой:** `*.unit.test.ts`. **DB/RLS:** нет; технически можно сейчас, но по риску позже.

## E. NOT A TARGET

- **Квоты/entitlements внутри workstream #1074.** Не потому что неважны, а потому что владелец явно исключил их до появления нормальной системы квот [TEST_SUITE_AUDIT:801–804](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:801). Эквайринг и реальные деньги остаются в scope.

- **`app-layer/testing/pg-harness.ts` как production-кандидат.** Это safety-заглушка без connection lifecycle, не бизнес-модуль [pg-harness.ts:9–22](/home/dev/dev-[redacted-token]-layer/testing/pg-harness.ts:9). Его тест доказывает только отказ от защищённых имён [testing.unit.test.ts:62–70](/home/dev/dev-[redacted-token]-layer/testing/testing.unit.test.ts:62).

- **Файлы из `testsuite-mixed-textpin.txt`, `testsuite-mock-echo.txt`, `testsuite-pure-textpin.txt` как oracle критичности.** Это исторические batch-входы старого cut/triage, а не список production consequences. Наличие там пути ничего не делает модуль критическим.

- **Модуль только из-за низкого coverage, размера или сложности.** Owner-канон требует названную правдоподобную поломку [TEST_SUITE_AUDIT:31–37](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:31). Нулевая строка в coverage-map — лишь сигнал проверить consequence.

- **Массовый e2e по каждому модулю.** Для перечисленных invariants минимальны unit/route/PostgreSQL layers. E2E оправдан позже только для нескольких сквозных сценариев входа, tenant switching, patient invite и payment callback; он не заменяет concurrency/RLS oracle.

- **Все оставшиеся tracked test-файлы как обязательный keep-set.** Владелец прямо отменил keep-set как модель сохранения [TEST_SUITE_AUDIT:805–808](/home/dev/dev-projects/BersonCareBot/docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:805). Сохраняется бизнес-знание, не файл.

## F. Первая разумная партия

До disposable-PG harness — пять непересекающихся вертикальных срезов:

- **Auth envelope:** `sessionCookie.unit` плюс HTTP-outcomes login/reset/change, без попытки подделать DB revocation.
- **Request security:** CSRF proxy и representative role/capability routes.
- **Patient organization selection:** pure resolver с foreign/inactive/multi-org cases.
- **Outbound side effect:** подписанный `relayOutboundRoute` с duplicate, policy-denial и provider-incident outcomes.
- **Money/M2M boundaries:** acquiring adapters/webhook route и semantic event idempotency; это разные тестовые файлы, но их удобно принять одним security-review checkpoint.

Первый DB follow-up после G0/T1:

- tenant/RLS CRUD matrix;
- session epoch и OTP atomic lifecycle;
- provisioning и patient invites;
- затем acquiring/idempotency/queue concurrency;
- после них destructive merge/purge, booking/package и media integrity.

Это только порядок инвентаризации; тесты не начаты.

## G. Неизвестное / OWNER QUESTIONS

- **Alfa-Bank webhook без checksum.** Adapter принимает его с условием, что caller затем проверит `getOrderStatusExtended` [alfabankPaymentProvider.ts:175–206](/home/dev/dev-[redacted-token].ts:175), но точечный поиск не нашёл такого follow-up в webhook routes/service. Какой owner-oracle: fail-closed при отсутствии checksum или обязательный server-side status lookup перед capture?

- **Concurrent duplicate `POST /api/integrator/events`.** Контракт определяет replay и payload mismatch, но не говорит, разрешено ли двум одновременным запросам с одним key выполнить domain handler до записи cached response. Нужен точный oracle: at-most-once handler execution либо допускается at-least-once с идемпотентностью каждого downstream handler.

- **Provider intent создан, а patient ledger insert упал.** Owner-план запрещает ложный success-record, но не определяет компенсацию уже созданного внешнего intent: void/cancel, `indeterminate`, либо операторский reconcile. Без решения тест может лишь зафиксировать публичный отказ, но не правильное денежное состояние.

- **Logout при DB revocation failure.** Owner T2 требует непригодность старой сессии, а `clearSession` документирует best-effort epoch increment и обязательное локальное очищение cookie даже при DB failure [auth/service.ts:1150–1183](/home/dev/dev-[redacted-token].ts:1150). Требуется ли fail-closed logout при недоступной DB, или сохранение доступности с риском работающей скопированной cookie является утверждённым контрактом?

Файлы, taskdb и БД не изменялись; тесты не запускались.

