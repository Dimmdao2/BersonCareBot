FAIL — 1 MUST FIX

# AUDIT C7 — вход по номеру только через мессенджер

Дата: 2026-09-16  
Кандидат: `wt/c7-phone-surface` / `da8e7e6f2` поверх `63448d83c`  
Diff: `git diff feat/doctor-ui-rebuild...HEAD`

## MUST FIX 1 — direct OTP по номеру всё ещё живёт через `phone/start` / `phone/confirm`

**Oracle:** `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:70-75` — владелец расширил С7: «вход по номеру идёт именно автоматической веткой - вырезать все подобное, это старое. Сейчас вход по номеру только по коду после подтверждения контактов в мессенджере»; живой путь остаётся один — `phone/messenger-bind/{start,status,finish}`.  
**Второй oracle:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:421-424` — человек выбирает Telegram/MAX, бот запрашивает контакт, и только после подтверждения контакта браузер завершает `phone/messenger-bind/{status,finish}`; автоматического подбора канала и SMS-bootstrap нет.

**Evidence:**

- `apps/webapp/src/app/api/auth/phone/start/route.ts:86-88` требует `deliveryChannel`, но не отказывает public login как классу; дальше `apps/webapp/src/app/api/auth/phone/start/route.ts:296-313` вызывает `deps.auth.startPhoneAuth(...)`, а `apps/webapp/src/app/api/auth/phone/start/route.ts:373-398` для `publicLogin` возвращает `{ ok: true, challengeId, retryAfterSeconds }`.
- `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:1174-1198` всё ещё вызывает `/api/auth/phone/start` с `deliveryChannel`; `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:2639-2648` запускает этот путь из выбора канала; `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:2681-2698` завершает через `/api/auth/phone/confirm`.
- `apps/webapp/src/modules/auth/phoneStartFallback.route.test.ts:322-364` прямо сохраняет поведение: explicit `deliveryChannel: 'telegram'` для known и unknown номера возвращает нейтральный `200 ok` с `challengeId`.
- Точный поиск: `rg -n "automatic|deliveryChannel|otpChannel|SMS-bootstrap|sms-bootstrap|/api/auth/phone/(start|confirm)|phone/start|phone/confirm" apps/webapp/src apps/webapp/INTEGRATOR_CONTRACT.md apps/webapp/src/modules/auth/auth.md docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md --glob '!**/db/drizzle-migrations/**' --glob '!**/archive/**'` нашёл эти живые remnants в route/client/test/docs.

**Impact:** даже после удаления automatic channel resolver остаётся другой public path входа по введённому номеру: клиентский miniapp/direct-OTP путь и сам API могут начать challenge через `phone/start`, а не через доказательство контакта в `messenger-bind`. Это нарушает owner-решение «только после подтверждения контактов в мессенджере» и оставляет старую дверь не вырезанной как класс.

## Проверки

### Route behavior / fault injection

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/phoneStartFallback.route.test.ts"
```

Результат на чистом кандидате: PASS, `1 passed`, `8 passed`.

Fault injection: временно снял ранний `availableMethods.includes('phone_bot')` gate в `apps/webapp/src/app/api/auth/phone/start/route.ts`, затем запустил тот же тест через host-lock. Результат: FAIL ровно на `rejects a surface without phone_bot before channel checks or identity lookup`, `expected 403`, received `400`. Временная поломка откатана.

### Live DEV

Единственный DEV Next на `127.0.0.1:5200` уже запущен из `/home/dev/dev-projects/BersonCareBot/apps/webapp`, не из этого worktree. Проверка:

```bash
ss -ltnp 'sport = :5200'
readlink -f /proc/$(ss -ltnp 'sport = :5200' 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)/cwd
nl -ba /home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/auth/phone/start/route.ts | sed -n '55,75p'
```

Факт: runtime-файл на общем DEV всё ещё старый: `phone/start` читает body до surface-gate и содержит описание automatic ветки. Поэтому live UI на `:5200` не является live-проверкой кандидата `da8e7e6f2`; второй Next-сервер я не поднимал по §1a.

Через host-lock проверил только доступность нового messenger-bind API на текущем DEV:

```bash
/home/dev/brain/host-orch/run-tests.sh "node -e '<POST sequence to /api/auth/phone/messenger-bind/{start,status,finish} with Origin http://127.0.0.1:5200>'"
```

Результат: `messenger-bind/start` вернул `200` с `setupToken` префикса `auth_` и deep link; `status` вернул `pending_contact`; `finish` без подтверждённого контакта вернул `409 {"ok":false,"error":"not_ready"}`. Это доказывает, что backend messenger-bind доходит до честной границы «нет подтверждённого контакта», но не принимает UI кандидата, потому общий DEV работает не из аудируемого дерева.

### Взгляд по diff / docs

- Поверхность staff в кандидате стоит раньше body parse в `apps/webapp/src/app/api/auth/phone/start/route.ts:61-67`; маршрутный тест и fault injection это подтверждают.
- `PhoneMessengerAuthFlow` в `apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx` больше не вызывает `/api/auth/phone/start` и работает через `phone/messenger-bind/{start,status,finish}`.
- Документы `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, `apps/webapp/src/modules/auth/auth.md`, `apps/webapp/INTEGRATOR_CONTRACT.md`, `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md` больше не описывают automatic SMS/email bootstrap. Но `apps/webapp/src/modules/auth/auth.md` всё ещё описывает прямой `/phone/start` с явно выбранным каналом, что относится к MUST FIX выше.

## Итог

С7 не готов к приёмке: automatic resolver снят, но direct public OTP route по номеру остался достижимым и закреплён тестом/клиентом. После исправления нужен повторный targeted route test через host-lock и live UI/runtime проверка уже на DEV, который действительно запущен с исправленным SHA.
