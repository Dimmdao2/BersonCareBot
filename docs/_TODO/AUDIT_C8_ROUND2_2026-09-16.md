# AUDIT C8 ROUND 2: коррекция почтового гейта

Verdict: **FAIL**

Source oracle: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md` — C8 «Почтовый код обязан доставляться там, где поверхность сама его потребовала» и решение «Второй фактор — выбор самого сотрудника». Самостоятельный `login` по коду остаётся пациентской дверью; в сотрудничьих дверях такого способа нет, а почтовый код сотрудника допустим только как уже выбранный второй фактор после проверки основного способа.

## MUST FIX: 2

1. **Платформенный администратор всё ещё может получить роль `admin` только по подтверждённой почте, без пароля и второго фактора.**

   Классификация: **тест** (повторяемая security-семантика) + **взгляд** (route/session wiring).

   - `apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:122-142` после обычного email OTP подменяет роль на `admin`, когда `isVerifiedEmailGlobalAdminAsync(email)` вернул `true`, и чеканит сессию методом `email_code`.
   - `apps/webapp/src/modules/auth/service.ts:920-952` повторяет то же повышение при каждом чтении сессии по `PLATFORM_OWNER_IDENTITY`.
   - `apps/webapp/src/app/api/auth/email-otp/confirm/route.route.test.ts:113-126` прямо закрепляет запрещённый результат `200` и admin-сессию «from verified email alone», то есть тест защищает старый oracle против решения владельца.

   Достижимый обход: на patient-branded host почтовая дверь разрешена; при конфигурации с общим staff/patient origin proxy не ограничивает route audience (`apps/webapp/src/proxy.ts:217-230`), а `persistNewAuthSession` не выполняет surface-role gate (`apps/webapp/src/modules/auth/service.ts:239-247`). Запрос без `roleLoginPortal` проходит по ambient patient policy, verified owner email повышается до `admin`, после чего создаётся admin-сессия; на том же host доступны admin routes, потому что proxy пропустил surface-route gate. Это ровно зависимость двери от env/topology, которую C8 запрещает. Исправление уже существует отдельно (`4f3dfc5f9`), но команда `git merge-base --is-ancestor 4f3dfc5f9 HEAD` вернула `rc=1`: оно не является предком проверяемого `6c62af77f` и в candidate отсутствует.

   Impact: пароль и выбранный сотрудником фактор перестают быть обязательными для платформенного администратора.

2. **Коррекция outer gate у clinic invite не защищена тестом: возврат найденного первым аудитом дефекта остаётся зелёным.**

   Классификация: **тест** — это уже случившийся и подтверждённый incident-regression, поэтому он проходит фильтр §10a; конечное последствие — приглашённый сотрудник не получает код и не может принять приглашение на staff host.

   Временная мутация в `apps/webapp/src/app/api/clinic/invites/accept/start/route.ts:22` вернула
   `isAuthChannelEnabled('email', undefined, 'transactional')` к `isAuthChannelEnabled('email')`. Команда:

   ```text
   /home/dev/brain/host-orch/run-tests.sh "pnpm --filter @bersoncare/webapp exec vitest --run src/app/api/clinic/invites/route.route.test.ts src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts"
   ```

   осталась зелёной: **2 files passed / 15 tests passed**. Причина видна в `apps/webapp/src/app/api/clinic/invites/route.route.test.ts:14-17`: policy подменена безусловным `true`, поэтому тест не различает login-door и transactional gate. Новый exhaustive purpose-тест проверяет нижний adapter mapping, но не route-level отказ до adapter. Мутация полностью откачена; production tree после неё чист.

## Что проверено

- **Четыре исправленных маршрута — выбор `transactional` верен.**
  - Clinic invite start: bearer-token проверяется через `lookupPendingByToken` до создания challenge (`apps/webapp/src/app/api/clinic/invites/accept/start/route.ts:31-48`); адрес доставки берётся из найденной записи приглашения, а не из пользовательского поля. Токен создаётся 32 случайными байтами и хранится по SHA-256 (`apps/webapp/src/modules/organization-invites/service.ts:17-23,50-58`).
  - Clinic invite confirm повторно проверяет тот же token до OTP и принятия (`apps/webapp/src/app/api/clinic/invites/accept/confirm/route.ts:48-81`). Поэтому ссылка-приглашение уже устанавливает конкретное приглашение и его адрес до почтового кода; это не самостоятельная дверь email login.
  - Doctor-initiated patient email change требует clinic-admin session до доставки (`apps/webapp/src/app/api/doctor/patients/[userId]/email-change/route.ts:35-55`).
  - Patient email-change confirm требует patient session до подтверждения (`apps/webapp/src/app/api/patient/email-change/confirm/route.ts:32-50`).

- **Полнота `isAuthChannelEnabled`.** Выполнена точная команда из brief:

  ```text
  grep -rn "isAuthChannelEnabled" apps/webapp/src
  ```

  Оставшиеся вызовы без `transactional` относятся к самостоятельным login/channel doors либо к patient-invite login на patient surface; дополнительные non-door вызовы, требующие той же коррекции, не найдены. В четырёх исправленных местах сейчас явно передаётся `transactional`.

- **Purpose не теряется на adapter-пути.** `EmailChallengePurpose` передаётся через `EmailSendPort` и `sendEmailCodeViaIntegrator` до `deliveryPurposeForEmailChallenge`; `login` единственный отображается в `login_door`, остальные — в `surface_requested` (`apps/webapp/src/app-layer/di/bindAuthModulePorts.ts:33-37`, `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts:37-39,91-110`). При DB runtime durable enqueue идёт через `pgEmailAuth.startEmailChallengeInDb`, поэтому route-level gates выше остаются отдельной обязательной границей, которую adapter-тест не заменяет (`apps/webapp/src/modules/auth/emailAuth.ts:365-389`, `apps/webapp/src/infra/repos/pgEmailAuth.ts:47-100`).

- **Новый `Record<EmailChallengePurpose, ...>` не признан пересказом ветвления.** Его outcomes взяты из C8 (только самостоятельный `login` запрещён), а наблюдаемый результат — внешний send request / отказ до него. Это независимый security oracle, не копия `purpose === 'login'` из production-кода. Но этот тест покрывает только adapter boundary и не доказывает четыре outer route gate — это показала четвёртая мутация выше.

- **Baseline targeted run** на неизменённом `6c62af77f`:

  ```text
  /home/dev/brain/host-orch/run-tests.sh "pnpm --filter @bersoncare/webapp exec vitest --run src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/modules/auth/authDeliveryGate.unit.test.ts src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/app/api/clinic/invites/route.route.test.ts"
  ```

  Результат: **7 files passed / 68 tests passed**, `rc=0`. Полный CI не запускался.

- **Слепой kill-set и результат.**
  - Схлопнуть назначения в один surface gate → уже проверено ведущим, краснеет.
  - Сделать `login` transactional → уже проверено ведущим, краснеет.
  - Оставить transactional только двум назначениям → уже проверено ведущим, краснеет после коррекции.
  - Вернуть clinic-invite outer gate к login policy → **не краснеет**, 2 files / 15 tests green; MUST FIX #2.
  - Потерять/подменить purpose по route → adapter → integrator и открыть admin через verified email → чтением найден существующий обход; MUST FIX #1.

Временные production-мутации откачены. Изменён только этот audit-artifact.
