# Независимый адверсарный аудит Д5 — `oauth/start` по явно названной двери

Дата: 2026-09-16
Кандидат: `1426d6d51376b1b9176bab9fa7cba7da12fb629c` (`wt/oauth-start-surface`)
Автор: `gpt-5.6-terra high`, прогон `d5-oauth-20260916`
Аудитор: Codex
Вердикт: **FAIL**

## Authority

- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:46-53` — три двери имеют разные наборы способов; OAuth есть у пациента, но не у специалиста/глобального администратора.
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:59-75` — состав сотрудничьих дверей задан кодом; OAuth доступен на TherapyGo и недоступен на Therapysto/admin.Therapysto.
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:305-320` — выключенный метод исчезает целиком; экран динамически отражает управляемый набор; тумблеры провайдеров независимы.
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:35-36` — Д5: `oauth/start` проверяет явно названную дверь; F6: подсказка VK обязана называть существующий callback.
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:52-57` — пациентский вход не ломается; этап не принимается без независимого аудита.
- `AGENTS.md:1431-1480`, `AGENTS.md:2198-2224` — тест проверяет наблюдаемое поведение, а каждый named fault подтверждается инъекцией.

## Классификация «тест или взгляд»

| Вопрос | Способ |
|---|---|
| Подмена `portal`, разрешение чужой Host-поверхности | ПРОГОН route handler + инъекция Host-gate; ВЗГЛЯД реальной `canSurfaceEnterRoute`-матрицы |
| Все четыре provider-ветки используют named door | ПРОГОН с отдельной инъекцией каждой ветки; ВЗГЛЯД оставшихся вызовов |
| Совпадение `AppEntryRsc`/snapshot и `oauth/start` | ПРОГОН policy/snapshot/route-тестов + ВЗГЛЯД общего gate |
| С2–С5: staff/platform_admin остаются code-owned | ПРОГОН `publicAuthPolicy.unit.test.ts` + ВЗГЛЯД `surfaceAuthPolicy.ts`/`surfaceAuthControlAvailable` |
| VK callback hint и оставшиеся неверные адреса | ВЗГЛЯД: точный repo search + back-references; UI-автотест запрещён §10a |
| Качество новых тестов | ВЗГЛЯД по §10a + fault injection |
| Пациентский и сотруднический путь | ПРОГОН named-door start/policy/session side effect; live UI недостижим до landing без запрещённого второго Next-сервера |

## MUST FIX

### MF1 — пациентская OAuth-дверь выдаёт сессию сотруднику; на shared Host Д5 сделала обход достижимым

Сценарий:

1. На shared DEV/TEST Host `POST /api/auth/oauth/start` с `roleLoginPortal="patient"` теперь правильно выбирает patient policy и разрешает OAuth (`route.ts:161-182`; новый route-тест получает HTTP 200).
2. Обычный экран отправляет `roleLoginPortal`, но не отправляет `next`, если его нет в URL (`AuthFlowV2.tsx:521-529`).
3. `oauth/start` кладёт portal в `tzOpt` только при `safeNext`, поэтому обычный вход без `next` теряет названную дверь в signed state (`route.ts:150-159`).
4. Даже если callback получил `roleLoginPortal="patient"`, общий финализатор сначала вызывает `setSessionFromUser` и только потом передаёт portal в redirect policy (`oauthWebSession.ts:54-80`). Несовместимость `doctor` ↔ `patient` меняет лишь redirect, но не запрещает сессию.

Одноразовый acceptance-прогон с `doctor` и `roleLoginPortal="patient"`:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/auth/oauthWebSession.audit.tmp.unit.test.ts"
```

Результат: `1 failed (1)`; `setSessionFromUser` вызван ровно один раз с `role: "doctor"` и `authMethod: "google_oauth"`, хотя oracle ожидал отсутствие session side effect. Временный тест удалён.

Impact: сотрудник, чья подтверждённая OAuth-почта/телефон резолвится в существующую doctor/admin identity, входит через пациентскую дверь без обязательной сотруднической основы «почта + пароль + второй фактор». До Д5 shared Host схлопывался в staff policy и такой start отказывал; Д5 открыла patient start, не доведя door boundary до выдачи сессии.

Требуемый результат: named door должна быть подписана независимо от наличия `next`, а callback обязан отказать **до** `setSessionFromUser`, если найденная роль не может использовать эту дверь. Один общий callback/session chokepoint предпочтительнее четырёх копий.

**Нарушенный authority:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:46-53,59-75`; `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:3-8,31-36`; граница Д5 `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:35-36`.

### MF2 — named-door доказан только для Google; Yandex wiring, VK и Apple переживают целевую поломку

Новые тесты подтверждают Host-gate и Google на shared Host, но не все четыре ветки, которые Д5 меняла:

- удаление `authPolicySurface` из `resolveYandexOAuthConfig(surface, authPolicySurface)` — route-тест остаётся зелёным;
- замена `isOAuthProviderEnabled('vk', authPolicySurface)` на вызов без surface — route-тест остаётся зелёным;
- замена `isOAuthProviderEnabled('apple', authPolicySurface)` на вызов без surface — route-тест остаётся зелёным.

Для всех трёх мутаций использована точная команда:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=route src/modules/auth/oauthAppleToggle.route.test.ts"
```

Каждый прогон: `1 passed (1)`, `5 passed (5)`. Это не теоретическое пожелание coverage: каждая непойманная строка возвращает F5 для отдельного реально поддерживаемого провайдера, а §13 задаёт независимые provider-тумблеры.

Требуемый результат: публичный route-тест должен на конечном HTTP-ответе доказать named-door для Yandex, Google, VK и Apple (допустима типизированная таблица сценариев); либо provider gate должен быть сведён в одну до-веточную точку, чья единственная инъекция закрывает весь класс.

**Нарушенный authority:** `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:35-36`; `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:307-320`; бинарный audit gate `AGENTS.md:2216-2224`.

### MF3 — затронутый набор оставлен красным из-за вредного устаревшего теста Yandex

Точная команда:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit --project=route src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts src/modules/auth/yandexOAuthConfig.audit.unit.test.ts src/modules/auth/publicAuthSnapshot.unit.test.ts src/app/app/AppEntryRsc.unit.test.ts"
```

Результат: `1 failed | 4 passed (5 files)`, `1 failed | 18 passed (19 tests)`. Красный тест — `yandexOAuthConfig.audit.unit.test.ts:75-82`.

Тест создаёт внутренне противоречивое состояние: `patient_branded` получает hand-made `authPolicy` без OAuth, а `isOAuthProviderEnabled` одновременно замокан в `true`. После С2–С5 door composition принадлежит `SurfaceAuthPolicyName` + `surfaceAuthControlAvailable`; второй чек того же внутреннего объекта в Yandex-конфиге дублирует правило и краснеет от честной смены wiring, не от наблюдаемого результата публичной двери. Восстанавливать удалённый дубль ради зелёного теста нельзя. Тест надо удалить либо заменить достижимым route-сценарием с независимым oracle.

Новые две проверки автора в `oauthAppleToggle.route.test.ts:159-202` сами по себе допустимы: вызывают публичный handler и проверяют HTTP 200/501, не текст исходника и не аргумент внутреннего mock. FAIL вызван не их формой, а неполным kill-set и оставленным вредным существующим тестом.

**Нарушенный authority:** `AGENTS.md:1433-1467,1469-1480` (вредный тест удаляется; проверяется выход цепочки, не внутренняя форма); land-ready gate `AGENTS.md:2252-2258`.

## Что закрыто

### F5 по коду

- Host/portal trust gate стоит до выбора provider (`route.ts:161-179`). На distinct hosts `canSurfaceEnterRoute` различает doctor/admin/patient login paths; на shared DEV/TEST исключение намеренное, потому что все три route-door физически живут на одном Host.
- Yandex получает `authPolicySurface` через `resolveYandexOAuthConfig` (`route.ts:181-182`), Google — `route.ts:210-216`, VK — `route.ts:238-244`, Apple — `route.ts:268-275`.
- Точный поиск

  ```bash
  rg -n "isOAuthProviderEnabled|getYandexOAuthConfig|portal|surfaceAuthControlAvailable" apps/webapp/src/app/api/auth/oauth/start/route.ts apps/webapp/src/modules/auth apps/webapp/src/app/app/AppEntryRsc.tsx
  ```

  не нашёл на start-path вызова `isOAuthProviderEnabled` без explicit surface; вложенный Yandex choke point после patient-only guard вызывает `isOAuthProviderEnabled('yandex', 'patient')`.

Это закрывает F5 **по текущему коду**, но не MF1 (end-to-end session boundary) и не MF2 (доказательство против отката всех веток).

### Экран и start используют один policy set

`AppEntryRsc` переводит role portal в `SurfaceAuthPolicyName` и передаёт его одновременно в `buildPrefetchedPublicAuthConfig` и UI policy. `publicAuthSnapshot` и `oauth/start` используют `isOAuthProviderEnabled(provider, surface)`; Yandex дополнительно проверяет точный callback allowlist. При достижимых текущих policy/config входах расхождения набора экран ↔ start не найдено.

Точная команда зелёного среза:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit --project=route src/modules/auth/oauthAppleToggle.route.test.ts src/modules/auth/yandexOAuthConfig.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/publicAuthSnapshot.unit.test.ts src/app/app/AppEntryRsc.unit.test.ts src/config/surfaceRoutes.unit.test.ts src/modules/auth/redirectPolicy.unit.test.ts"
```

Результат: `7 passed (7 files)`, `39 passed (39 tests)`.

### С2–С5 и пациентский вход

`DEFAULT_SURFACE_AUTH_POLICY_CONFIG` оставляет OAuth только patient; `surfaceAuthControlAvailable` отказывает staff/platform_admin до чтения настроек. Зелёный срез выше подтверждает code-owned staff/admin composition, patient snapshot, patient named-door start (HTTP 200) и отказ patient portal на distinct staff Host (HTTP 501). Код password login не менялся.

Live UI не запускался: кандидат до landing, а `AGENTS.md` §1a запрещает аудитору поднимать второй Next-сервер. Это названная граница доказательства, не PASS живой приёмки.

### F6

Три уровня поиска:

1. индексированный поиск:

   ```bash
   node /home/dev/brain/tools/code-search.mjs "VK callback redirect uri auth settings" --repo bcb -k 12
   ```

2. точная строка по всему репозиторию:

   ```bash
   rg -n -F "/api/auth/oauth/callback/vk-id" . --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**'
   ```

3. back-references настройки и callback:

   ```bash
   rg -n "vk_id_redirect_uri|VK_ID_CALLBACK|oauth/callback/vk" apps packages deploy scripts docs --glob '!docs/archive/**' --glob '!docs/_TODO/runs/**' --glob '!docs/_TODO/AUTH_DOORS_AUDIT_2026-09-15.md'
   ```

Неверный `/vk-id` остался только в исторической записи исходной находки `AUTH_DOORS_AUDIT_2026-09-15.md:236`. Активная подсказка `AuthProvidersSection.tsx:325`, реальный route `oauth/callback/vk/route.ts:6-9`, runtime getter, registry и settings API согласованы на `/api/auth/oauth/callback/vk` / ключе `vk_id_redirect_uri`.

## Fault injection

Все product-инъекции внесены по одной, прогнаны на переднем плане через host-lock и откатаны.

| Инъекция | Точная команда | Результат |
|---|---|---|
| Инвертировать `!canSurfaceEnterRoute(...)` | `bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=route src/modules/auth/oauthAppleToggle.route.test.ts"` | RED: distinct staff Host вернул 200 вместо 501 |
| Убрать `authPolicySurface` у Google | та же точная команда | RED: shared patient door вернул 501 вместо 200 |
| Убрать explicit surface из Yandex route wiring | та же точная команда | GREEN: `5 passed (5)` — дыра доказательства |
| Убрать explicit surface у VK | та же точная команда | GREEN: `5 passed (5)` — дыра доказательства |
| Убрать explicit surface у Apple | та же точная команда | GREEN: `5 passed (5)` — дыра доказательства |
| Снять patient-only guard в `resolveYandexOAuthConfig` | `bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/auth/yandexOAuthConfig.unit.test.ts"` | RED: staff surface получила Yandex config; `1 failed | 2 passed (3)` |

Итого по точным прогонам выше: шесть product-инъекций; три пойманы, три не пойманы. Временные product/test изменения удалены. Перед созданием этого отчёта команда `git status --short` вернула пустой вывод.

## Итог

Д5 нельзя принимать и ставить галочку. F6 исправлен; start-path по коду использует named door во всех четырёх ветках; новые route-тесты не являются вредными UI/source tests. Однако кандидат открывает на shared Host реальный OAuth-обход сотруднической двери до выдачи сессии, не доказывает три provider wiring-ветки и оставляет затронутый тестовый набор красным из-за устаревшего теста внутренней формы.
