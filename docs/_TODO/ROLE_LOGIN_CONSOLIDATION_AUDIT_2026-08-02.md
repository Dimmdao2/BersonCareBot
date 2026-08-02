# Аудит: сведение role-login (`wt/role-login-consolidation`)

Аудитор: независимый, слепой, без исправлений. Дата: 2026-08-02. Ветка на момент аудита:
`wt/role-login-consolidation` @ `3272c70061cca83ec277216c0ef0c2c2a6f74754`.

Authority:

- `docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md` §`#1031` и «Порядок сведения 02.08», пункт 3.
- `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, «Исполнимый порядок сведения…», пункт 3.
- Продуктовые коммиты: `cca512719` (auth doors), `00608ed47` (login presentations).

## Вердикт: **FAIL**

Один достижимый build-breaking дефект в UI-коммите `00608ed47`; поведенческая часть (`cca512719`) прошла слепой
kill-set без замечаний.

## Проверенный человеческий путь

Дверь: `/app/doctor/login`, `/app/patient/login`, `/app/admin/login` — три разных экрана
(`RoleLoginPortalHeader`), у doctor/patient — статичная перекрёстная ссылка, у admin — без неё (по решению
владельца, ссылки не требуется). Password/passkey/OAuth (yandex/google/apple) — все три канала проводят
`portal`/`next` через один и тот же `getPostAuthRedirectTarget` (`redirectPolicy.ts`) и `roleLogin.ts`:
OAuth — через подписанный `state` (`oauthSignedState.ts`), password/passkey — через `role` в JSON-ответе и
клиентский `redirectOk()` в `AuthFlowV2.tsx`. Второго модуля определения роли или вторых redirect rules не
обнаружено — все шесть точек входа (`email-password/login`, `.../factor`, `passkey/login/verify`, yandex-callback,
google-callback, apple-callback) сходятся к тем же двум файлам.

Публичные маршруты (`/book/*`) и сами login-роуты не попадают под guard `proxy.ts` (`isRoleLoginPath` явно
исключает дверь из редиректа) — redirect-loop не воспроизводится. Авторизованный чужой роли получает свой кабинет
с `app_access_denied=1` (`buildOwnHubUrlWithAccessDeniedToast`, уже существовавший в репо примитив, переиспользован
без второй реализации). Открытого редиректа нет: `isSafeRolePortalNext` проверяет origin через `new URL(next,
'http://localhost')` и требует префикс своего portal path — внешний `next` игнорируется (см. тест ниже).
Существующий текст ошибок не менялся (diff не касается строк сообщений; пункт про единый текст для «верных
credentials на чужом portal» в чек-листе спеки оставлен `[ ]`, как и должно быть).

## Найденное

### FAIL — `buttonVariants` не импортирован в `AppEntryLoginContent.tsx`, `tsc --noEmit` красный

- **Файл/строки:** `apps/webapp/src/app/app/AppEntryLoginContent.tsx:71,78,85,92,99`.
- **Коммит:** `00608ed47` (UI-коммит под аудитом) удалил
  `import { buttonVariants } from '@/shared/ui/patient/primitives/button-variants';` (была на строке 8 в
  `ab2413140`), не тронув пять использований `buttonVariants({ size: 'sm' })` в dev-bypass панели.
- **Достижимый сценарий:** любой прогон `pnpm typecheck` (и, соответственно, `next build`, который типизирует
  дерево тем же `tsc`) красный на HEAD ветки. Это build-breaking регресс, не hardening и не style — типовая ошибка
  `TS2304: Cannot find name 'buttonVariants'`.
- **Нарушенная строка authority:** «UI-коммит содержит только presentation/static cross-links… собранный
  диф не ломает существующую сборку» — общее требование раздела аудита (build failures — предмет отчёта по явному
  броду задачи) и общий CORE-принцип §9 full CI/typecheck gate.
- **Evidence:**
  ```
  $ pnpm --dir apps/webapp typecheck
  src/app/app/AppEntryLoginContent.tsx(71,31): error TS2304: Cannot find name 'buttonVariants'.
  src/app/app/AppEntryLoginContent.tsx(78,31): error TS2304: Cannot find name 'buttonVariants'.
  src/app/app/AppEntryLoginContent.tsx(85,31): error TS2304: Cannot find name 'buttonVariants'.
  src/app/app/AppEntryLoginContent.tsx(92,31): error TS2304: Cannot find name 'buttonVariants'.
  src/app/app/AppEntryLoginContent.tsx(99,31): error TS2304: Cannot find name 'buttonVariants'.
  ELIFECYCLE  Command failed with exit code 1.
  ```
  Подтверждено сравнением: `git diff ab2413140 00608ed47 -- apps/webapp/src/app/app/AppEntryLoginContent.tsx`
  показывает только удаление импорта и добавление `RoleLoginPortalHeader`/`roleLoginPortal`; использования
  `buttonVariants` в diff не участвуют — значит удаление импорта единственная причина.

Это handoff воркеру: однострочный fix (вернуть импорт), не в скоупе аудитора.

## Что проверено и не является нарушением

- Второй модуль определения роли/вторые redirect rules/дубли страниц — не найдены (`find` по `*login*page.tsx`
  дал ровно три файла из `cca512719`, все делегируют в общий `AppEntryRsc`).
- Cross-links в `RoleLoginPortalHeader.tsx` статичны (жёстко заданы в `portalCopy`, не зависят от ввода/ответа
  сервера) — раскрытия существования аккаунта через них нет.
- `roleCanUsePortal`: doctor-дверь обслуживает единственную roles-строку `'doctor'` (специалист/админ клиники/
  сотрудник — права внутри клиники, не отдельная roles-строка; `UserRole = 'client' | 'doctor' | 'admin'`).
- Merge-коммит `3272c7006` в ветку — не продуктовый (один файл `NIGHT_WAVE_AUDIT_QUEUE`), не тронул проверяемую
  поверхность.

## Команды и результаты

Подготовка (генерируемые workspace-пакеты отсутствовали в чистом клоне — собраны как существующий prerequisite,
не как часть продуктового изменения):

```
pnpm install --frozen-lockfile
pnpm --dir packages/db-principal build
pnpm --dir packages/operator-db-schema build
pnpm --dir packages/platform-merge build
pnpm --dir packages/error-tracking build
```

Целевые поведенческие тесты (все evidence-файлы из чек-листа спеки):

```
$ pnpm --dir apps/webapp vitest --run --project=route src/proxy.route.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)

$ pnpm --dir apps/webapp vitest --run --project=unit src/modules/auth/redirectPolicy.unit.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ pnpm --dir apps/webapp vitest --run src/shared/ui/auth/RoleLoginPortalHeader.ui.test.tsx
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Расширенный прогон вокруг затронутой поверхности (auth-модуль целиком + всё под `shared/ui/auth`,
`shared/ui/patient/auth`, `proxy.route.test.ts`, `app/app/**`):

```
$ pnpm --dir apps/webapp vitest --run src/modules/auth
 Test Files  10 passed (10)
      Tests  42 passed (42)

$ pnpm --dir apps/webapp vitest --run src/shared/ui/auth src/shared/ui/patient/auth \
    src/proxy.route.test.ts src/app/app
 Test Files  34 passed (34)
      Tests  96 passed (96)
```

Typecheck (см. finding выше):

```
$ pnpm --dir apps/webapp typecheck
... 5× TS2304 Cannot find name 'buttonVariants' в AppEntryLoginContent.tsx
ELIFECYCLE  Command failed with exit code 1.
```

Scoped lint (только изменённые файлы двух коммитов под аудитом; полнорепозиторный `pnpm lint` падает на
несвязанном raw-SQL debt manifest в `pgOnlineIntake.devDb.integration.test.ts`, вне scope этой ветки):

```
$ npx eslint <22 изменённых файла cca512719 + 00608ed47>
(без вывода — чисто)
```

Diff/kill check: `git diff ab2413140 3272c7006 --stat` — 26 файлов, соответствуют перечню двух коммитов;
посторонних файлов/второй поверхности нет.

## Итог

`PASS` заблокирован одним build-breaking дефектом в `00608ed47` (см. finding выше). Поведенческий слой
(`cca512719`) — без замечаний, все шесть каналов входа сведены к единой authority. Возврат воркеру: восстановить
`import { buttonVariants } from '@/shared/ui/patient/primitives/button-variants';` в
`AppEntryLoginContent.tsx` и повторно прогнать `pnpm typecheck`; повторный слепой аудит не требуется — это
не новая поверхность.
