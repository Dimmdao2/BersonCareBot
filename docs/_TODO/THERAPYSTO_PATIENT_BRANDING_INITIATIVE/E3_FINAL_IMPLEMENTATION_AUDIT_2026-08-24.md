# E3 — финальный независимый аудит реализации Therapysto перед landing

**Дата:** 2026-08-24
**Overall verdict:** `PASS`
**Exact product candidate:** `7d43d229a477978847be97b7bd05a7e38b6fb7e7`
**Audited branch:** `wt/therapysto-night-20260823`
**Audited HEAD:** `e0d47a5db912d8a1628920694b56032ba5bd7d61` — только docs-only descendant кандидата
**Owner authority:** датированные owner-разделы `IMPLEMENTATION_PLAN.md` и `docs/OWNER_DECISIONS.md`; более поздний текст владельца применён первым.

`PASS` означает: implementation tree безопасно приземлять в текущий `feat/doctor-ui-rebuild`, пока перечисленные ниже domain/runtime-пункты остаются открытыми. Это **не** приёмка активации доменов, TEST или Stage D. DNS, TLS, nginx, runtime env, TEST/PROD, merge, landing, deploy и push не менялись.

## 1. Exact-tree и stale gate

Команды:

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git show -s --format='%H %P %s' 7d43d229a
git diff --name-status 7d43d229a..HEAD -- apps packages deploy
git status --short
```

Результат: ветка `wt/therapysto-night-20260823`; exact product SHA совпал; `git diff 7d43d229a..HEAD -- apps packages deploy` пуст; рабочее дерево до отчёта было чистым. `HEAD` содержит только два docs-коммита после product SHA. Поэтому verdict не `STALE`.

Масштаб product-кандидата измерен командой:

```bash
git diff --stat 5a70bfe239f30f0c0b84551a214aaf561d5fb0e7..7d43d229a -- apps packages deploy
```

Результат: `281 files changed, 11123 insertions(+), 1389 deletions(-)`.

## 2. Классификация до чтения тестов

Классификация была зафиксирована до открытия test-файлов.

- `TEST` — повторяемое наблюдаемое поведение: `TPB-08/09/10/11/13/17a/17/18/19`; `A0.1/A0.2/A2a/A2b`; `B1/B1a/B2/B4/B4a/B5/B5a/B6`; `C1/C2/C3/C4/C5b`; `F1/F2/F2b/F3/F5`; Track-D delivery seam.
- `INSPECTION` — разовое итоговое состояние дерева: `TPB-04/07/16`; архитектурная половина `B3`; migration/write-path половина `F4`.
- `MIXED` — поведение плюс итоговая топология: `TPB-01` (identity `TEST`, inventory `INSPECTION`); `TPB-15` (delivery/auth identity `TEST`, allowlist `INSPECTION`); `A0.3` (generated messages `TEST`, static UI inventory `INSPECTION`); `B3` (runtime resolver `TEST`, отсутствие второго seam `INSPECTION`); `F4` (независимость policy cells `TEST`, migration/write path `INSPECTION`).

### Blind kill-set

До чтения тестов были записаны классы поломок:

1. staff/admin наследует clinic brand или старое имя;
2. deploy identity/config расходится с фактическими потребителями либо org ownership;
3. Host резолвится в неверную surface/org или unknown host получает fallback;
4. slug/domain допускает reserved, numeric, invalid length или дубль другой организации;
5. OAuth signed state/callback допускает другой host/org/provider либо disabled direct route проходит;
6. patient Yandex/Google/SMS/passkey defaults расходятся с owner-матрицей;
7. бот создаёт аккаунт до web-регистрации, доверяет чужому contact или ломает sender/capability scope;
8. branded mail теряет clinic identity/template/tenant либо non-branded clinic получает mailing mutation;
9. auth defaults обходят canonical settings envelope/write path;
10. D17 допускает broad role, теряет narrow role, exact-org или любой из шести credential keys;
11. появляется второй resolver/store/dispatcher, BersonCare-specific fork или второе route tree;
12. read-only landing simulation возвращает broad delivery access или меняет старое TEST-domain behavior.

## 3. Verdict по каждому checked item

Каждая строка ниже — отдельный бинарный verdict текущего product SHA.

### Owner checklist `TPB-01…19`

- `PASS — TPB-01` — Therapysto identity подтверждена current-SHA metadata/PWA/auth/mail tests и повторным inventory; user-visible старое platform name не найдено вне проверенного technical/history allowlist.
- `PASS — TPB-04` — deploy/product diff не создаёт `staff.therapysto.ru` или `patient.therapysto.ru`; runtime values не активированы.
- `PASS — TPB-07` — остаются один repo/webapp/DB/mechanics; diff не создаёт второго application/route tree/store/dispatcher.
- `PASS — TPB-08` — current-SHA cross-surface tests подтверждают: clinic brand применяется только к patient surface, staff/platform-admin остаются Therapysto.
- `PASS — TPB-09` — `PATIENT_APP_NAME/PATIENT_APP_ORIGIN` проходят через один deploy-config seam без DB setting; clinic domain/delivery settings остаются `per_org`.
- `PASS — TPB-10` — patient Yandex использует одну global config, доступен только на patient surfaces; patient Google и staff/platform-admin OAuth defaults выключены.
- `PASS — TPB-11` — один patient tree обслуживает default/branded origins; branded root/card/login/recovery/booking/cabinet доступны, patient origins жёстко не допускают Therapysto home/directory.
- `PASS — TPB-13` — branded transactional mail сохраняет clinic SMTP/sender/template/exact tenant; массовая рассылка не подменена transactional path.
- `PASS — TPB-15` — surface-specific видимые имена доставлены до auth/mail/push/ICS; technical IDs/history сохранены; caller name fail-closed не оставляет receiver-default.
- `PASS — TPB-17a` — staff passkey сохранён, default off, disabled direct route закрыт, тот же handler работает после включения; existing credential path сохранён.
- `PASS — TPB-17` — staff/platform-admin OAuth default off на уровне resolver/start/callback, но mechanics остаются включаемыми настройкой.
- `PASS — TPB-18` — standard и branded patient origins проходят email и phone→messenger-owned contact proof; bot выдаёт challenge/code, но не создаёт/не связывает account до webapp finish.
- `PASS — TPB-19` — `staff`, `platform_admin`, `patient` читают независимые cells; disabled direct routes fail closed до provider/credential work.
- `PASS — TPB-16` — расширены существующие choke points; один `RequestSurfaceResolver`, существующий `OrgBrandingPort/service` и существующий `dispatchPort`; параллельных getters/resolvers/stores нет.

### Stage A

- `PASS — A0.1` — staff installed-app manifest identity = Therapysto; patient manifest identity не наследуется.
- `PASS — A0.2` — staff/admin tab metadata формируется собственной Therapysto surface identity.
- `PASS — A0.3` — checked staff-only UI/messages используют Therapysto; patient copy не была массово переписана.
- `PASS — A2a` — root metadata/landing используют единый surface identity seam; route-local metadata copies не восстановлены.
- `PASS — A2b` — legal/remaining checked perimeter следует surface classification; matcher/route coverage и actual proxy headers проверены current-SHA тестами.

### Stage B

- `PASS — B1` — organization resolution идёт через существующий slug/clinic-directory seam; unknown/inactive/deleted organization fail closed.
- `PASS — B1a` — application и named-DEV rollback proof отвергают reserved, numeric, `<3` и `>30` labels.
- `PASS — B2` — named-DEV rollback proof отвергает повторный `org_custom_domain_hostname` другой организации; новой hostname table нет.
- `PASS — B3` — один `RequestSurfaceResolver` подключён к request choke point и кормит routing/metadata/manifest/absolute links; второго host resolver нет.
- `PASS — B4` — расширен существующий brand revision/service optional name+accent; anonymous projection ограничена published/entitled safe fields.
- `PASS — B4a` — известная клиника без branding получает platform patient brand и живую страницу; unknown organization остаётся `404`.
- `PASS — B5` — default/branded surfaces используют одно patient route tree; branded root получает clinic card, а directory недостижим.
- `PASS — B5a` — один существующий org-scoped флаг выбирает card vs direct login; нового page-builder/store нет.
- `PASS — B6` — cookies остаются host-only; unknown/cross-org fail closed, CSRF origin seam не заменён.

### Stage C

- `PASS — C1` — одна global patient Yandex config хранится через существующие `system_settings` service/envelope; per-org Yandex config не добавлена.
- `PASS — C2` — один Yandex resolver использует `ResolvedSurface`; signed state, exact callback allowlist и host/org/provider match закрывают подмену.
- `PASS — C3` — branded notification intents используют существующий dispatch port с `clinic_if_configured` по более позднему owner-решению; наличие clinic bot не допускает fallback, отсутствие bot сохраняет platform path.
- `PASS — C4` — existing SMTP config/mail-profile resolver расширены clinic sender/template; второй renderer/dispatcher и BersonCare fork не созданы.
- `PASS — C5b` — clinic-owned mail/bot channel становится mutable/active только после accepted live test; pending/failed остаются видимы, default platform path не блокируется.

### Stage F

- `PASS — F1` — typed auth policy является свойством resolved surface; отдельные rows/cells существуют для трёх surface classes.
- `PASS — F2` — staff/platform-admin OAuth defaults записаны envelope-значениями в canonical `system_settings`; runtime projection подтверждена migration verify/preflight; direct start/callback denied while off.
- `PASS — F2b` — staff passkey code/credential path сохранён, default off и переключаем без code change.
- `PASS — F3` — patient email + phone-through-bot доступны на обеих patient surfaces; arbitrary/generic webhook не создаёт account, Telegram self-contact и MAX HMAC provider proofs проверены.
- `PASS — F4` — legacy global value детерминированно разделён на 27 surface cells прежней migration; дальнейшие cells независимы; final migration меняет 15 owner defaults только через canonical table и verify сверяет canonical+runtime envelopes.
- `PASS — F5` — patient Yandex `true`, patient Google `false`, одна global registration; clinic-specific registration не создана.

### Track-D delivery seam

- `PASS — Track-D/app.read_integrator_clinic_delivery_credential` — последняя migration `20260824T053353…` побеждает обе ранние definitions; owner = `app_seam_settings_integrator_owner`; body допускает только `app_integrator_tenant_service`; broad `app_tenant_service` не имеет EXECUTE и получает `42501`; exact-org equality и все шесть keys, включая `clinic_transactional_mail_template`, доказаны живым rollback-only вызовом; migration verify проверяет именно reconciliation delta (narrow present, broad absent, template present), а full boundary покрыт DB proof.

## 4. Stage F corrections — отдельная сверка

`7d43d229a` реально закрывает пять достижимых findings предыдущего Stage-F audit:

1. `20260824T064008_apply_surface_auth_owner_defaults.sql` пишет `{"value": boolean}` только в canonical `public.system_settings`; штатная проекция и verify сверяют `app_runtime_settings`.
2. `auth_surface_patient_passkey_enabled={"value":false}`; public policy test читает фактическую envelope-форму.
3. login-purpose messenger completion создаёт только OTP challenge и возвращает `accountCreated:false`; persistent account/binding остаётся webapp confirmation path. `profile_bind` требует session-owned `user_id`.
4. `executeBroadcastAction` и `saveDraftAction` требуют одновременно `mailings` и `branding`; UI скрывает compose/create-from controls, сохраняя readable history.
5. Staff 2FA redesign не выполнен и не считается finding: более поздний owner `§1.2g Q2` явно отложил его до domain move.

Обычный Therapysto bot остаётся phone/contact proof + codes/booking/ordinary opt-in notifications. Dedicated branded bot использует тот же transport adapter и добавляет clinic capabilities; mailing mutation доступна только branded clinic. Прямая пересылка входящих без DB и её clinic settings относятся к незавершённому Stage D/owner runtime work и этим `PASS` не объявляются реализованными.

## 5. Current-SHA commands и результаты

### Targeted behavior

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run \
  src/config/envDatabaseRuntime.unit.test.ts \
  src/modules/system-settings/orgCustomDomainHostname.unit.test.ts \
  src/config/surfaceRoutes.unit.test.ts \
  src/proxy.b5Audit.route.test.ts \
  src/proxy.b5aAudit.route.test.ts \
  src/proxy.route.test.ts \
  src/modules/auth/publicAuthPolicy.unit.test.ts \
  src/modules/auth/independentAuthMethodToggle.route.test.ts \
  src/modules/auth/oauthAppleToggle.route.test.ts \
  src/modules/auth/yandexOAuthConfig.unit.test.ts \
  src/app/api/auth/email-otp/start/route.route.test.ts \
  src/modules/auth/phoneStartBrandedOtpSender.audit.test.ts \
  src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts \
  src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts \
  src/app/api/auth/passkey/login/verify/route.test.ts \
  src/app/app/doctor/broadcasts/actions.entitlement.unit.test.ts \
  src/app/app/doctor/communications/tabs/BroadcastsTab.entitlement.ui.test.tsx \
  src/modules/auth/mailProfileSurfaceIdentity.unit.test.ts \
  src/modules/patient-booking/sendBookingConfirmationEmail.outbound.test.ts \
  src/modules/auth/sessionCookieHostOnly.unit.test.ts \
  src/modules/auth/therapystoSurfaceNames.audit.unit.test.ts \
  src/modules/clinic-directory/reservedNamespace.test.ts \
  src/modules/clinic-directory/selfRenameAllowance.unit.test.ts"
```

Результат: `23 files passed`, `257 tests passed`.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/pwa/staffPwaManifest.unit.test.ts \
  src/app/legal/LegalDocuments.route.test.tsx \
  src/app/app/admin/layout.unit.test.ts \
  src/app/app/patient/layout.branding.test.ts \
  src/app/app/settings/AuthProvidersYandexAllowlist.ui.test.tsx \
  src/app/app/settings/AuthProvidersYandexAllowlistChain.audit.ui.test.tsx \
  src/modules/org-branding/service.unit.test.ts \
  src/modules/system-settings/clinicDeliverySettings.unit.test.ts \
  src/app/api/admin/clinic-delivery-test/route.route.test.ts \
  src/app/app/settings/ClinicDeliveryChannelsSection.ui.test.tsx \
  src/app/api/admin/settings/route.route.test.ts \
  src/modules/auth/yandexOAuthConfig.audit.unit.test.ts"
```

Результат: `12 files passed`, `75 tests passed`.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run \
  src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts \
  src/infra/db/clinicDeliveryCredentials.unit.test.ts \
  src/integrations/email/mailProfile.unit.test.ts \
  src/infra/adapters/dispatchPort.test.ts \
  src/integrations/telegram/dedicatedWebhook.route.test.ts \
  src/integrations/max/dedicatedWebhook.route.test.ts \
  src/integrations/bersoncare/sendOtpRoute.route.test.ts \
  src/integrations/bersoncare/requestContactRoute.route.test.ts \
  src/integrations/bersoncare/relayOutboundRoute.route.test.ts \
  src/integrations/bersoncare/relayOutboundLegacyDefaultPath.audit.test.ts \
  src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts \
  src/integrations/telegram/telegramContactProviderProof.unit.test.ts \
  src/integrations/max/maxContactProviderProof.unit.test.ts \
  src/infra/db/clinicDeliveryCredentialGate.audit.test.ts"
```

Результат: `14 files passed`, `90 tests passed`.

Команды выше содержат полный exact file list каждого targeted прогона.

### Migration/parser contracts

```bash
/home/dev/brain/host-orch/run-tests.sh "node --test deploy/host/migrate-dev.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/migration-order.test.mjs"
```

Результат: `78 passed`, `0 failed`.

```bash
RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test \
  deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
```

Результат: `5 passed`, все writes транзакционные/rollback-only.

```bash
RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test \
  deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
```

Результат: `1 passed`; effective owner/body/EXECUTE, broad denial, no-context/cross-org `42501`, all six credential keys, zero medical relation privileges и одна real pending queue row; финальный `ROLLBACK`.

```bash
bash deploy/host/migrate-dev.sh --preflight \
  --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Результат: `pending=4 total=74 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0`; auth migration выполнила `UPDATE 15`; явный `ROLLBACK`; `migrate-dev preflight: PASS`.

Диагностический вызов `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --check-migration-proofs` не является отдельным static-mode entrypoint: без `DATABASE_URL` он штатно остановился на `DATABASE_URL is not set`. Он не использован как evidence; authoritative parser suite и `migrate-dev.sh --preflight` выше прошли.

### Types/lint

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp run typecheck && pnpm --dir apps/integrator run typecheck"
```

Результат: оба `tsc --noEmit` exit `0`.

```bash
pnpm --dir apps/webapp exec eslint \
  src/modules/auth/phoneMessengerBind.ts \
  src/modules/auth/phoneMessengerBind.ports.ts \
  src/infra/repos/pgPhoneMessengerBind.ts \
  src/modules/auth/publicAuthPolicy.unit.test.ts \
  src/app/app/doctor/broadcasts/actions.ts \
  src/app/app/doctor/broadcasts/actions.entitlement.unit.test.ts \
  src/app/app/doctor/communications/page.tsx \
  src/shared/lib/surface/requestSurface.ts \
  src/shared/lib/surface/requestSurface.server.ts \
  src/modules/org-branding/service.ts
```

Результат: exit `0`, замечаний нет. Для webapp только package-scoped прогон принят как evidence, поскольку root config игнорирует эти пути.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec eslint \
  src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts \
  src/infra/db/clinicDeliveryCredentials.unit.test.ts \
  src/integrations/email/mailProfile.unit.test.ts \
  src/infra/adapters/dispatchPort.test.ts \
  src/integrations/telegram/dedicatedWebhook.route.test.ts \
  src/integrations/max/dedicatedWebhook.route.test.ts \
  src/integrations/bersoncare/sendOtpRoute.route.test.ts \
  src/integrations/bersoncare/requestContactRoute.route.test.ts \
  src/integrations/bersoncare/relayOutboundRoute.route.test.ts \
  src/integrations/bersoncare/relayOutboundLegacyDefaultPath.audit.test.ts \
  src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts \
  src/integrations/telegram/telegramContactProviderProof.unit.test.ts \
  src/integrations/max/maxContactProviderProof.unit.test.ts \
  src/infra/db/clinicDeliveryCredentialGate.audit.test.ts && \
pnpm exec eslint \
  deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs \
  deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs \
  deploy/host/migrate-dev.test.mjs \
  deploy/postgres/privileges/migrate-local-parse.test.mjs \
  deploy/postgres/privileges/migrate-local.test.mjs \
  deploy/postgres/privileges/migration-order.test.mjs"
```

Результат: оба scoped ESLint-прогона exit `0`, замечаний нет.

Full CI намеренно не запускался: brief запрещает его до landing integration boundary.

## 6. Fault-injection evidence

Новых product injections в E3 не делалось: blind kill-set не выявил класса, который не был уже убит на том же implementation lineage; brief прямо запрещает повторять killed class без current-SHA причины. Все прежние мутации были временными и откачены.

Переиспользовано после сверки scope, изменившихся путей и current-SHA green oracle:

- `E1 TPB-01/04/07/08/16`: `6/6` killed — staff surface inheritance, brand precedence, duplicate architecture/inventory classes.
- `TPB-09`: `8/8` killed — name consumers, origin seam, DB duplicate setting, org ownership; E3 заново прогнал оба current test files.
- `D17`: `4/4` killed — broad gate, exact-org removal, template removal, worker tenant loss. Между audited `c1bbb78b…` и current product relevant runtime/migration files не менялись; изменился только усиленный audit DB proof, который E3 выполнил заново.
- `C1/C2`, `C3`, `C4/C5b`, `TPB-15`: ранее documented allowlist/state/dispatch/tenant/fallback injections; E3 повторно прогнал их surviving current tests, но не сажал тот же defect второй раз.
- Exact-SHA Stage-F correction record: `3/3` killed — bot-side account write, mailing without branding, patient passkey. E3 независимо прочитал changed production paths и выполнил current tests/rollback preflight.

`New injections: 0`; `reused killed classes: все перечисленные`; `missed blind classes after current checks: 0`.

## 7. Domain/runtime honesty

- `BLOCKED — TPB-02` — `therapysto.ru`/`admin.therapysto.ru` runtime activation и smoke не выполнялись; owner action/domain move остаётся open.
- `BLOCKED — TPB-03` — standard patient owner domain не активирован в runtime; typed seam готов, runtime smoke open.
- `BLOCKED — TPB-05` — полный live patient journey на активированных standard/branded origins остаётся Stage D.
- `BLOCKED — TPB-06` — BersonCare как первый live branded tenant не активирован; BersonCare-specific product code не добавлен.
- `BLOCKED — TPB-12` — старый checkbox-текст «clinic_required only» перекрыт поздним owner-решением `clinic_if_configured`; пункт должен оставаться open до owner rewrite/runtime Stage D.
- `BLOCKED — TPB-14` — operator DNS/TLS/domain activation не выполнялась; self-service/SEO/marketplace не построены.
- `BLOCKED — Stage D` — `D1/D2/D3`, C5 domain monitoring/runtime smoke, DNS/TLS/nginx/TEST origins и domain values не запускались и этим audit не авторизованы.

Static/read-only inspection подтверждает отсутствие скрытой активации:

```bash
git diff 5a70bfe239f30f0c0b84551a214aaf561d5fb0e7..7d43d229a -- deploy apps packages \
  | rg -n "test\.bersoncare\.ru|therapysto\.|therapygo\.|APP_BASE_URL|PATIENT_APP_ORIGIN|server_name|certbot|letsencrypt|nginx"
git diff --name-status 5a70bfe239f30f0c0b84551a214aaf561d5fb0e7..7d43d229a -- deploy/nginx deploy/systemd .github
```

Результат: `test.bersoncare.ru` health path сохранён; prod examples сохраняют `APP_BASE_URL=https://bersoncare.ru`; `PATIENT_APP_ORIGIN=https://therapygo.ru` встречается только закомментированным optional example; nginx/systemd/domain values не переключены.

## 8. Read-only landing simulation

Команды:

```bash
git rev-parse feat/doctor-ui-rebuild
git merge-base feat/doctor-ui-rebuild 7d43d229a
git merge-tree --write-tree --messages feat/doctor-ui-rebuild 7d43d229a
git diff --exit-code 7d43d229a f8e04114bd9772fa8d9871dd9f10b912614b9360 -- apps packages deploy
git show f8e04114bd9772fa8d9871dd9f10b912614b9360:apps/webapp/db/drizzle-migrations/20260824T053353_reconcile_clinic_delivery_credential_root.sql
git show f8e04114bd9772fa8d9871dd9f10b912614b9360:deploy/host/deploy-test-saas.sh \
  | rg -n "https://test\.bersoncare\.ru/api/health"
```

Результат: current `feat` = merge-base `5a70bfe239f30f0c0b84551a214aaf561d5fb0e7`; merge-tree exit `0`, конфликтов нет; simulated tree `f8e04114bd9772fa8d9871dd9f10b912614b9360`; merged product diff против candidate пуст. Effective migration остаётся narrow-only с template key, TEST health продолжает использовать `https://test.bersoncare.ru/api/health`. Merge/ref/worktree не менялись.

## 9. Findings и финальный вывод

Reachable `MUST FIX`: **нет**.

Итог: implementation `7d43d229a477978847be97b7bd05a7e38b6fb7e7` безопасно приземлять в текущий `feat/doctor-ui-rebuild`. Открытые `TPB-02/03/05/06/12/14` и Stage D остаются честно открытыми и не входят в этот `PASS`.
