# Лог изменений: архив / purge клиента и связанные доработки webapp

**Период:** 2026-04-08  
**Связанный отчёт:** [DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md](./DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md)

Ниже — хронологическое описание доработок (в т.ч. не только карточки клиента, но и общие правила окружения webapp, затронутые в той же ветке работ).

---

## 1. Документация и комментарии в коде

- Уточнён комментарий к полю `ClientIdentity.isArchived` в `apps/webapp/src/modules/doctor-clients/ports.ts`: архив доступен врачу и админу через `PATCH .../archive`, снятие архива — тем же endpoint с `{ archived: false }` (раньше формулировка «только админ» не соответствовала коду).

---

## 2. Единая логика PATCH archive (врач + админ)

- Вынесена общая реализация в `apps/webapp/src/modules/doctor-clients/clientArchiveChange.ts`:
  - схема тела `clientArchiveBodySchema`;
  - `applyClientArchiveChange(userId, archived)` — проверка `role === client`, `getClientIdentity`, `setUserArchived`.
- Порт БД: **`createPgDoctorClientsPort()`** из `pgDoctorClients.ts` (без `buildAppDeps`), чтобы не нарушать границу «модули не импортируют composition root» (проверка в `buildAppDeps.test.ts`).
- Маршруты:
  - `apps/webapp/src/app/api/doctor/clients/[userId]/archive/route.ts` — только guard (сессия + `canAccessDoctor`) и вызов `applyClientArchiveChange`;
  - `apps/webapp/src/app/api/admin/users/[userId]/archive/route.ts` — guard (только `admin`) и тот же `applyClientArchiveChange`.
- Выравнивание поведения: для цели не-клиент (`role !== client`) админский API теперь возвращает **404 `not_client`**, а не «тихий» успех при 0 обновлённых строк, как у doctor-роута.

---

## 3. Тесты archive API

- `archive/route.test.ts` (doctor): мок **`@/infra/repos/pgDoctorClients`** (`createPgDoctorClientsPort`), плюс по-прежнему мок `getPool`.
- `archive/route.test.ts` (admin): убран неиспользуемый мок `buildAppDeps`.
- OAuth callback tests: в мок `@/config/env` добавлен **`webappReposAreInMemory`** (изменения в §4).

---

## 4. Окружение webapp: отказ от «тихих» stub без БД (связано с общей политикой, не только с архивом)

Цель: при **разработке** и **production runtime** не подменять PostgreSQL in-memory репозиториями без явной причины; ошибка конфигурации должна быть заметной.

- **`apps/webapp/src/config/env.ts`**
  - экспорт **`isTestEnv`**;
  - функция **`webappReposAreInMemory()`**:
    - при непустом `DATABASE_URL` → всегда false (PG);
    - в **Vitest** без URL → true (in-memory для тестов);
    - в **`next dev`** без URL → **throw** с понятным текстом;
    - в **production** без URL при `next build` → true (сборка без БД в CI), иначе PG не используется до появления URL.
- **`apps/webapp/src/app-layer/di/buildAppDeps.ts`**: ветвление портов через **`const inMemoryRepos = webappReposAreInMemory()`** сразу после **всех** `import` (раньше константа стояла между двумя группами import — валидно, но неудобно для линтеров/чтения); вместо прямого `env.DATABASE_URL ? ...`.
- **`apps/webapp/src/instrumentation.ts`**: при `NODE_ENV === "production"`, пустом `DATABASE_URL` и **`npm_lifecycle_event === "start"`** (`next start` / типичный `pnpm start`) — **throw** до обработки запросов.
- Точечно обновлены вызовы: **`oauth/callback/route.ts`**, **`onlineIntakeDeps.ts`**, **`phoneOtpLimits.ts`** — используют `webappReposAreInMemory()`.
- **`getPool()`** в `infra/db/client.ts` по-прежнему бросает при отсутствии URL — дополнительная страховка (в т.ч. standalone без `npm` lifecycle).

---

## 5. UI списка клиентов и режим «Архив» (навигация)

- На странице **`apps/webapp/src/app/app/doctor/clients/page.tsx`** query **`scope=archived`** превращается в вызов **`listClients({ archivedOnly: true })`** (порт `pgDoctorClients`).
- Это **одна линия** с URL: отдельного «второго» фильтра архива нет — `archivedOnly` — это флаг API при выбранном режиме списка.
- В **`DoctorClientsPanel`** дополнительно применяются клиентские фильтры (поиск `q`, telegram/max/appointment) к уже загруженному списку — они не дублируют архив.

---

## 6. Итог для операций

Сводная таблица по окружению вынесена в основной отчёт, раздел **«5. Окружение webapp и DATABASE_URL»**: [DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md](./DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md).

- **Прод** с реальной БД: `DATABASE_URL` обязателен; ошибки конфигурации заметнее (dev, `next start` через `instrumentation`, первый `getPool()`).
- **CI `next build`**: сборка без Postgres возможна за счёт in-memory ветки на этапе `next build`.
- Логика **архива / purge** не менялась в этих правках — только выбор репозиториев и проверки env.
