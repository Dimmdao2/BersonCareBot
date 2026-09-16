# Д9 Q2 — привязка OAuth `state` к браузеру

Дата реализации: 2026-09-16.

## Итог

Публичный OAuth `state` теперь связан с браузером, который начал вход, и потребляется один раз. При старте
сервер кладёт в host-only first-party cookie случайный непрозрачный маркер, а в подписанный `state` — только
SHA-256-хеш маркера. Callback удаляет cookie до дальнейшей обработки и принимает `state` только при совпадении
хеша. Отсутствие cookie, несовпадение и повторное предъявление идут в тот же существующий отказ, что неверная
подпись; новая наружная причина ошибки не добавлена.

Новых таблиц, миграций и серверного хранилища нет.

## Что найдено про хосты — пункт «ловушка»

Предыдущий проход правильно остановился: cookie, поставленная на исходном брендированном хосте, не доходит до
глобальных callback Google, VK и Apple; Apple дополнительно возвращается cross-site POST и не присылает
`SameSite=Lax`.

Реализована зафиксированная ведущим топология:

- Yandex начинает и завершает вход на текущей patient surface; cookie остаётся на том же host с
  `SameSite=Lax`.
- Google, VK и Apple при несовпадении origin текущего запроса и настроенного callback сначала возвращают браузеру
  URL `GET /api/auth/oauth/start` на origin callback. Это top-level навигация: уже глобальный start ставит cookie
  и перенаправляет к провайдеру.
- Для Apple cookie имеет `SameSite=None; Secure`; для остальных провайдеров — `SameSite=Lax`. Срок cookie и
  `state` один и тот же: 600 секунд.
- Возврат после Google/VK/Apple на брендированный хост не добавлялся: отдельного owner-решения на него нет.

## Что изменено

- `oauthSignedState.ts`: signed payload получил хеш browser-binding; открытое значение в `state` не попадает.
- `oauthStateBinding.server.ts`: единая выдача, проверка и потребление короткоживущей cookie.
- `/api/auth/oauth/start`: добавлен общий POST/GET start-path, host-handoff для Google/VK/Apple и выдача binding
  непосредственно на host callback.
- Все четыре публичных callback используют consume-проверку до обмена provider code. Apple nonce и VK PKCE
  сохранены без изменения.
- Добавлен route-тест конечного поведения двери: replay уже потреблённого `state` и `state` с cookie другого
  браузера получают существующий CSRF-отказ.

## Проверки и команды

Все прогоны выполнялись через обязательный host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest --run --project=route src/modules/auth/oauthStateBinding.route.test.ts src/modules/auth/oauthAppleToggle.route.test.ts"
```

Результат: 2 файла, 10 тестов — PASS.

Инъекция поломки: временно заменена `timingSafeEqual(actualHash, expectedHash)` на безусловное принятие состояния,
затем выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest --run --project=route src/modules/auth/oauthStateBinding.route.test.ts"
```

Результат: сценарий чужой browser-cookie покраснел — ожидался `403`, получен `307`. Поломка возвращена.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec tsc --noEmit -p tsconfig.json"
```

Результат: PASS.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec eslint src/modules/auth/oauthSignedState.ts src/modules/auth/oauthStateBinding.server.ts src/app/api/auth/oauth/start/route.ts src/app/api/auth/oauth/callback/google/route.ts src/app/api/auth/oauth/callback/apple/route.ts src/modules/auth/yandexOAuthCallbackHandler.ts src/modules/auth/vkOAuthCallbackHandler.ts src/modules/auth/oauthStateBinding.route.test.ts src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts"
```

Результат: PASS.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest --run src/modules/auth/oauthStateBinding.route.test.ts src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/oauthWebSession.unit.test.ts src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts src/modules/auth/yandexOAuthConfig.audit.unit.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts"
```

Результат: 6 файлов, 22 теста — PASS.

## НЕ СДЕЛАНО

- Галочка Д9/Q2 в `AUTH_DOORS_FIX_2026-09-16.md` не ставилась — её ставит ведущий после независимого аудита.
- Возврат Google/VK/Apple с глобального host на брендированный host не реализован.
- PROD, TEST, DEV-БД, миграции, привилегии и `.env` не затрагивались.
- Полный CI и автоматические UI-тесты не запускались и не создавались; выполнены только затронутые route/unit
  тесты, typecheck и ESLint.
