# Независимый адверсарный аудит Д5, круг 2 — OAuth door держит старт и выдачу сессии

Дата: 2026-09-16  
Кандидат: `58ccb81de` (`wt/oauth-start-surface`)  
Аудитор: Codex  
Вердикт: **PASS**

## Authority

- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:49-53` — OAuth есть у пациента; у специалиста / админа клиники OAuth нет, вход через почту + пароль + код или 2FA.
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:59-76` — состав сотрудничьих дверей задается кодом, не настройкой; переключатели каналов для `staff` и `platform_admin` убираются.
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:35-36` — Д5: `oauth/start` проверяет явно названную дверь, а не только Host.
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:54-57` — пациентский вход не ломается; этап принимается только после независимого аудита.
- `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:29-38` — С2-С5: сотрудничий состав задан кодом, 2FA остается политикой.

## Классификация

| Вопрос | Способ |
|---|---|
| `doctor`/`admin` через patient OAuth не получает сессию | **ПРОГОН** общего session-mint boundary и временного callback-аудита по Yandex/Google/VK/Apple; **ВЗГЛЯД** на четыре callback-wiring точки |
| `state` подписывает named door без `next` | **ПРОГОН** `oauthWebSession.unit.test.ts` + fault injection |
| Старые `state` без двери | **ПРОГОН** legacy-state сценария; **ВЗГЛЯД** Yandex fail-closed surface binding |
| `roleLoginPortal` из запроса нельзя назвать на невозможной поверхности | **ПРОГОН** route-test + fault injection |
| Пациентский OAuth работает | **ПРОГОН** patient named-door route table и legacy patient session |
| Удаленный Yandex-тест | **ВЗГЛЯД** diff удаленного теста + зеленый покрывающий срез; прогоном не проверяется "форма удаленного теста" |
| С2-С5 не откачены | **ВЗГЛЯД** code-owned matrix и отсутствие чтения legacy staff/admin toggles; **ПРОГОН** auth policy tests |
| Текст отказа человеку | **ВЗГЛЯД** словарь `errorCodeText`/`notificationText` + UI call-site |

## Проверка поведения

Главная дверь выдачи сессии теперь одна: `completeOAuthWebLoginRedirectUrls` проверяет `roleCanUsePortal` до `setSessionFromUser` (`apps/webapp/src/modules/auth/oauthWebSession.ts:55-70`). `oauthWebSession.unit.test.ts:77-96` доказывает, что `doctor` через `patient` door получает `{ ok: false, reason: "oauth_role_not_allowed" }`, а `setSessionFromUser` и `recordAuthLogin` не вызываются.

Провайдерские callback-цепочки проверены временным audit-тестом, затем файл удален:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/auth/oauthProviderCallbacks.audit.tmp.unit.test.ts"
```

Результат: `1 passed (1 file)`, `4 passed (4 tests)`. Сценарии Yandex, Google, VK и Apple резолвили `doctor-user` через signed `roleLoginPortal: "patient"` и проверяли, что callback возвращает `reason=oauth_role_not_allowed`, `setSessionFromUser` не вызван.

ВЗГЛЯД по wiring:

- Yandex берет `roleLoginPortalFromOAuthState` и передает его в `completeOAuthWebLoginRedirectUrls` (`yandexOAuthCallbackHandler.ts:75,164-171`).
- Google — то же (`callback/google/route.ts:54,132-139`).
- VK — то же (`vkOAuthCallbackHandler.ts:83,175-182`).
- Apple — то же (`callback/apple/route.ts:68,178-185`).

Named door в state подписывается независимо от `next`: `createSignedOAuthState`, Apple и VK кладут `payload.portal` до условия `next` (`oauthSignedState.ts:96-101,122-127,167-172`). Прогон `oauthWebSession.unit.test.ts:67-74` подтверждает parsed `roleLoginPortal: "patient"` без `next`.

Старые `state` без двери считаются patient (`roleLoginPortalFromOAuthState`), и вреда для staff это не открывает: тот же session boundary отказывает `doctor` до session mint. Пациентская совместимость доказана `oauthWebSession.unit.test.ts:99-115`. Yandex-state без surface дополнительно fail-closed через `yandexOAuthStateMatchesSurface` (`yandexOAuthCallbackHandler.ts:87-92`).

`roleLoginPortal` из запроса не обходит surface: на distinct staff Host route отказывает до выбора provider (`oauth/start/route.ts:161-179`), тест `oauthAppleToggle.route.test.ts:222-241`. На shared Host named patient door используется для всех четырех провайдеров (`oauthAppleToggle.route.test.ts:185-219`), а provider wiring идет через `authPolicySurface` для Yandex/Google/VK/Apple (`oauth/start/route.ts:181-285`).

С2-С5 не откачены: `DEFAULT_SURFACE_AUTH_POLICY_CONFIG` для `staff` и `platform_admin` содержит только `password`, `totp`, `passkey` (`surfaceAuthPolicy.ts:21-35`); `authChannelPolicy` для недоступного метода отказывает до чтения settings (`authChannelPolicy.ts:39-45`). Это подтверждено зеленым срезом ниже.

Удаленный Yandex-тест был вредным: diff `git diff 74b121f00..HEAD -- apps/webapp/src/modules/auth/yandexOAuthConfig.audit.unit.test.ts` показывает удаление сценария с hand-made `authPolicy` без OAuth на patient surface. Этот тест фиксировал внутреннюю форму `ResolvedSurface.authPolicy`, а текущее живое правило задается явным `authPolicySurface`; покрытие поведения не потеряно: staff/platform_admin отказ проверяется в `yandexOAuthConfig.audit.unit.test.ts`, а публичный start-path по всем провайдерам — в `oauthAppleToggle.route.test.ts`.

Текст отказа человеку не сырой код: `oauth_role_not_allowed` есть в общей карте `errorCodeText` (`errorCodeText.ts:24-37`), текст лежит в `notificationText.authOauthRoleNotAllowed` (`notificationText.ts:185-188`), UI показывает `errorCodeText(oauthErrorReason)` (`AuthBootstrap.tsx:1119-1125`).

## Прогоны

Основной зеленый срез:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit --project=route src/modules/auth/oauthWebSession.unit.test.ts src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts src/modules/auth/yandexOAuthConfig.audit.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/publicAuthSnapshot.unit.test.ts src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/modules/auth/authChannelPolicy.explicitSurface.unit.test.ts src/app/app/AppEntryRsc.unit.test.ts src/config/surfaceRoutes.unit.test.ts src/modules/auth/redirectPolicy.unit.test.ts"
```

Результат: `11 passed (11 files)`, `64 passed (64 tests)`.

Полный CI не запускался. Второй Next-сервер не поднимался. PROD/TEST/миграции/.env не трогались.

## Fault Injection

Все инъекции внесены временно, прогнаны через `/home/dev/brain/host-orch/run-tests.sh` и откатаны.

| Инъекция | Команда | Результат |
|---|---|---|
| Убрать проверку роли перед `setSessionFromUser` | `... oauthWebSession.unit.test.ts` | RED: `does not mint a doctor session...` получил `{ ok: true }` вместо `oauth_role_not_allowed` |
| Вернуть подпись `portal` под условие `next` | `... oauthWebSession.unit.test.ts` | RED: parsed state без `next` потерял `roleLoginPortal` |
| Снять surface-wiring у Google provider start | `... oauthAppleToggle.route.test.ts` | RED: только строка `google` в table-сценарии вернула `501` вместо `200` |
| Отключить distinct-Host gate для named door | `... oauthAppleToggle.route.test.ts` | RED: staff Host принял patient door (`200` вместо `501`) |
| Снять patient-only guard у Yandex config | `... yandexOAuthConfig.audit.unit.test.ts` | RED: `platform_admin` получил Yandex config вместо `null` |

Непойманных обязательных инъекций нет. После отката временных изменений `git status --short` вернул пустой вывод.

## MUST FIX

Нет.

## Итог

Д5 круг 2 можно принимать: named door держит и `oauth/start`, и callback/session issuance; старые state без двери не дают сотруднику сессию; пациентский OAuth остается рабочим; сотрудничьи двери остаются code-owned.
