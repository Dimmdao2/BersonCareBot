# Аудит D9 Q2: OAuth `state` browser binding / one-shot

Аудитор: Codex GPT-5  
Кандидат: `dc1d85991` (`wt/oauth-state-binding-impl`)  
Authority: `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md` — Q2: «`state` делаем одноразовым и привязанным к браузеру».  

## Итог

`VERDICT: FAIL`

MUST FIX: тесты не ловят точную поломку «валидный подписанный `state` без `browserBindingHash` принимается при наличии любой binding-cookie». Текущий продуктовый код это отвергает, но mutation-gate из брифа требует красный тест на снятие требования хеша; точная мутация осталась зелёной.

## Evidence

- `A1 live-login-flow → PASS →` четыре провайдера сохраняют маршрут start → provider → callback → resolve → session:
  - Yandex: start mint-ит signed state с `browserBindingHash`, surface/org/origin (`apps/webapp/src/app/api/auth/oauth/start/route.ts:224`); callback первым делом вызывает `consumeBrowserBoundOAuthState(..., 'yandex')`, затем проверяет surface match, меняет code на token, получает userinfo, вызывает `completeOAuthWebLoginRedirectUrls` (`apps/webapp/src/modules/auth/yandexOAuthCallbackHandler.ts:66`, `:87`, `:107`, `:135`, `:164`).
  - Google: start при другом origin делает handoff на callback-origin, иначе кладёт binding hash в state (`start/route.ts:256`, `:259`); callback consume до exchange, дальше token/profile/resolve/session (`callback/google/route.ts:40`, `:87`, `:97`, `:103`, `:132`).
  - VK: start сохраняет PKCE `code_challenge` из state attemptId и binding hash (`start/route.ts:293`, `:305`); callback consume до exchange, `code_verifier` всё ещё derived from attemptId и передаётся в exchange (`vkOAuthCallbackHandler.ts:74`, `:116`, `:122`).
  - Apple: start сохраняет `nonce` в state и отправляет его провайдеру (`start/route.ts:332`, `:344`); callback consume до exchange, затем `verifyAppleIdToken(... expectedNonce: verified.nonce)` (`callback/apple/route.ts:57`, `:133`).
- `A2 deploy-window → PASS →` pre-deploy state без `bh` будет отвергнут `consumeBrowserBoundOAuthState`: `if (!state?.browserBindingHash || !binding) return null` (`oauthStateBinding.server.ts:55`). Окно равно TTL state/cookie: `OAUTH_STATE_BINDING_TTL_SECONDS = 10 * 60` (`oauthStateBinding.server.ts:11`, `start/route.ts:56`). Человек видит stale/CSRF отказ: Google/VK/Yandex дают JSON 403 `authOauthLinkStale`, Apple редиректит на `invalid_state`. Для login door это приемлемо: максимум перезапустить вход; мягкая форма без ослабления защиты — только copy/redirect на повтор входа, но не compat-accept hashless state.
- `A3 new-GET-door → PASS →` `GET` и `POST` идут через один `handleOAuthStart`; отличаются только `mode=json|redirect` (`start/route.ts:145`, `:356`, `:360`). `next` валидируется до попадания в state/handoff через `isSafeRolePortalNext`, принимается только path того же portal и не абсолютный external URL (`start/route.ts:182`, `roleLogin.ts:102`). GET не принимает готовый `state`; он может только поставить новую random httpOnly binding-cookie и выпустить свой signed state. Чужой сайт, открывший GET у жертвы, получает redirect к provider для этой же жертвы, но не может привязать cookie к чужому state.
- `A4 one-shot → PASS →` cookie гасится до parse/exchange (`oauthStateBinding.server.ts:44`-`:54`), поэтому гасится и при битом state, и при provider `error`, и при отсутствии `code`. Повтор того же state проверен тестом: первая попытка доходит до `no_code`, replay даёт 403 `oauth_csrf` (`oauthStateBinding.route.test.ts:120`).
- `A5 cookie-params → PASS with note →` cookie `httpOnly`, path `/api/auth/oauth`, maxAge 600; Apple получает `SameSite=None; Secure`, остальные `SameSite=Lax` и `secure=isProduction` (`oauthStateBinding.server.ts:17`-`:25`). Path покрывает все callback URLs under `/api/auth/oauth/callback*`. На plain `http://127.0.0.1:5200` браузер не сохранит Apple Secure cookie; по коду это ломало бы Apple на plain HTTP DEV if enabled. Я не читал `.env`/секреты и не проверял DB settings, поэтому не доказываю, включён ли Apple на live DEV. Для реально используемых на plain HTTP DEV non-Apple провайдеров secure=false сохраняет cookie.
- `A6 browser-swap → PASS →` state из браузера A с cookie A, предъявленный в браузере B после второго start/cookie B, получает 403 `oauth_csrf` (`oauthStateBinding.route.test.ts:135`). Мутация сверки hash → красный: `expected 307 to be 403` в этом сценарии.
- `A7 mutation-hash-compare → PASS →` временная мутация `return timingSafeEqual(...) ? state : null` → `return state` дала красный: `oauthStateBinding.route.test.ts > rejects a valid signed state in a browser without the issuing cookie`, `expected 307 to be 403`.
- `A8 mutation-cookie-consume → PASS →` временное удаление `cookieStore.set(... maxAge: 0)` дало красный: `oauthStateBinding.route.test.ts > rejects the same state after its first callback consumed the browser cookie`, `expected 307 to be 403`.
- `A9 mutation-hash-required → FAIL →` точная мутация `if (!state || !binding) return null; if (!state.browserBindingHash) return state;` оставила `oauthStateBinding.route.test.ts` зелёным (`1 passed, 2 tests`). Это не продуктовый обход в текущем коде, а отсутствие acceptance/mutation защиты на обязательное требование `bh`.

## Test Runs

- Baseline: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/oauthStateBinding.route.test.ts src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/oauthWebSession.unit.test.ts src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts src/modules/auth/yandexOAuthConfig.audit.unit.test.ts src/modules/auth/oauthWebLoginResolve.unit.test.ts src/modules/auth/oauthVkResolve.unit.test.ts"` → `8 passed (8), 40 passed (40)`.
- Mutation hash compare: same runner with `src/modules/auth/oauthStateBinding.route.test.ts` → FAIL as expected.
- Mutation cookie consume: same runner with `src/modules/auth/oauthStateBinding.route.test.ts` → FAIL as expected.
- Mutation hash-required exact: same runner with `src/modules/auth/oauthStateBinding.route.test.ts` → PASS unexpectedly.
- Final after rollback: full baseline command again → `8 passed (8), 40 passed (40)`.

## Out Of Scope

Возврат человека с Google/VK/Apple обратно на брендированный host клиники после входа не считаю дефектом: в плане это явно записано как вопрос владельцу, а не работа.

VERDICT: FAIL — MUST FIX: добавить поведенческую проверку, что signed `state` без `browserBindingHash` отвергается даже при наличии unrelated binding-cookie.
