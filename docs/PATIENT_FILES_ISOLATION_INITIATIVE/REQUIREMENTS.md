# REQUIREMENTS — Patient Files Library Isolation

> Source spec: `docs/_INBOX/patient-files-library-isolation.md` (от владельца, 2026-06-18).
> Scope: **M** — несколько правил; трогает media-модель + вид библиотеки + загрузку + именование/дедуп.
> Closes held question **flat-8** (куда индив-упражнение).

---

## 1. Owner requirements — VERBATIM (6 правил)

> ### Правила
> 1. **Системная папка «Пациенты»** в медиа-библиотеке (зарезервированная, авто-создаётся). Все файлы пациентов
>    (видео индив-упражнений + загрузки со страницы пациента) хранятся ТОЛЬКО внутри неё.
> 2. **Авто-подпапка на каждого пациента** внутри «Пациенты» (создаётся автоматически). Имя по умолчанию =
>    **Фамилия Имя Отчество** пациента. При **дубле ФИО** — добавлять **последние 4 цифры телефона** (полный номер НЕ писать).
>    Врач **может переименовать** подпапку (необязательно).
> 3. **Скрыты из общего вида библиотеки.** В режиме «вся библиотека / по всем папкам» врач эти файлы НЕ видит
>    (чтобы не замусоривать его собственные файлы). Видны ТОЛЬКО в отдельном режиме — внутри папки «Пациенты».
> 4. **Загрузки со страницы пациента** (вкладка «Файлы») идут ТОЛЬКО в папку этого пациента. Врач МОЖЕТ:
>    сохранить файл себе на диск; структурировать по подпапкам ВНУТРИ папки пациента. НЕ может: перекидывать
>    эти файлы напрямую в другие (общие) папки библиотеки.
> 5. **Индив-упражнение врача** (видео с пациентом на приёме) пишется в **индивидуальную программу пациента**;
>    его видео ложится в папку этого пациента (правила 1–3).
> 6. Переименование самих видео — не обязательно, но **возможность должна быть**.

---

## 2. Definition of Done — VERBATIM

> - Загрузка со страницы пациента → файл в подпапке этого пациента (авто-создана; имя ФИО, +last4 при дубле).
> - В общем виде библиотеки (все папки) файлов пациентов НЕ видно; видно только внутри «Пациенты»/подпапки.
> - Подпапку можно переименовать; структурировать внутри — можно; вынести в общие папки — нельзя (нет операции move наружу).
> - Индив-упражнение → в индив-программу пациента, видео — в его папке.
> - Тесты: исключение из общего скоупа (видимость), маршрут загрузки в папку пациента, дедуп имени по ФИО, запрет move наружу.

---

## 3. Micro-question (НЕ блок — зафиксирован дефолт)

> last4 телефона добавляю **только при дубле ФИО** (полный номер не пишем). Если хочешь last4 в имени ВСЕГДА — скажи, поправлю.

**Default accepted for the plan:** last4 phone суффикс добавляется ТОЛЬКО при коллизии ФИО.

---

## 4. Code-exploration findings — что УЖЕ существует

⚠️ Главное: **инфраструктура «системного скоупа» в media-библиотеке уже построена**, но называется
**«Файлы клиентов»**, а НЕ «Пациенты», и **`patient_files` (вкладка «Файлы» страницы пациента) пока не подключена к ней вообще**.
План должен ПЕРЕИСПОЛЬЗОВАТЬ существующее, а не строить с нуля (§6 ALWAYS — no duplication).

### 4.1 Media-библиотека: системный скоуп УЖЕ есть

- **Схема `media_folders`** (`apps/webapp/db/schema/schema.ts:1833`):
  - `kind` ∈ `{standard, client_files_root, client_patient}` (check-constraint, строка 1866).
  - `patientUserId` (nullable FK → `platformUsers`).
  - `nameNormalized` = `lower(trim(name))` (generated), unique-индексы: `uq_media_folders_child_name`,
    `uq_media_folders_root_name`, `uq_media_folders_client_patient_user` (1 папка на пациента),
    `uq_media_folders_client_files_root` (singleton root).
  - ➜ Схема УЖЕ поддерживает «system root + per-patient subfolder». **Новых таблиц не нужно.**
- **`media_files.folderId`** (FK → `media_folders`, строка 1052) — файлы привязываются к папке.
- **Repo `pgClientMediaFolders.ts`** (`apps/webapp/src/infra/repos/`):
  - `pgEnsureClientFilesRootFolder()` — авто-создаёт/промоутит singleton root (имя из `CLIENT_FILES_ROOT_FOLDER_NAME`).
  - `pgEnsureClientPatientFolder(patientUserId)` — авто-создаёт подпапку пациента под root, с дедупом
    (primary name → fallback name при коллизии 23505).
  - `clientFilesSubtreeFolderIdsSql()` — рекурсивный CTE: id всех папок поддерева client-files.
  - `isSystemManagedMediaFolder(kind)` — true для `client_files_root` | `client_patient`.
  - `pgValidateUserAssignableMediaFolder` / `pgValidateManualFolderParent` — гейты назначения/родителя.
- **Имя папки / дедуп** (`apps/webapp/src/modules/media/clientFilesFolders.ts`):
  - `CLIENT_FILES_ROOT_FOLDER_NAME = "Файлы клиентов"` ← **по правилу 1 ожидается «Пациенты».** (см. open-q O1)
  - `clientPatientFolderBaseName(displayName)` — обрезка до 180.
  - `clientPatientFolderFallbackName(displayName, patientUserId)` — fallback = `base · <первые 8 символов uuid>`.
    ⚠️ **Сейчас fallback — uuid8, НЕ last4 телефона** (правило 2 требует last4). Это разрыв.
- **Имя по ФИО**: `pgClientMediaFolders.resolvePatientDisplayName()` строит `firstName + lastName`.
  ⚠️ **Сейчас НЕ Фамилия Имя Отчество** — нет `patronymic`, порядок имя→фамилия. `platformUsers` имеет
  `firstName`, `lastName`, `patronymic`, `phoneNormalized` (схема строки 59, 60, 83, 52) — данные для ФИО+last4 есть.

### 4.2 Скрытие из общего вида — УЖЕ есть

- **`MediaListParams.excludeClientFiles`** (`apps/webapp/src/modules/media/types.ts:88`) — default true:
  «при листинге без явного folder-скоупа спрятать файлы под subtree «Файлы клиентов»».
- **Реализация** в `s3MediaStorage.ts:259-260`: при `folderId === undefined` и `excludeClientFiles !== false`
  добавляет `m.folder_id IS NULL OR m.folder_id NOT IN clientFilesSubtreeFolderIdsSql()`.
  ➜ **Правило 3 (скрытие из «все папки») уже реализовано для media_files.** Видно только при явном folder-скоупе.
- **`MediaLibraryFolderScopeSelect.tsx`** (`shared/ui/doctor/media/`) — селект скоупа с пунктом «Файлы клиентов»
  (`clientFilesRootId`), и `foldersForLibraryScopeSelect()` фильтрует список до `kind === "standard"`.

### 4.3 Патиент-видео (со стороны пациента) — УЖЕ маршрутизируется в папку

- **`apps/webapp/src/app/api/patient/media/program-submission/presign/route.ts:75,84`** —
  `pgEnsureClientPatientFolder(...)` → `createMediaFile({ folderId: patientFolder.id })`.
  ➜ Видео-сабмишены пациента УЖЕ ложатся в его папку в media-библиотеке.

### 4.4 Разрыв: вкладка «Файлы» страницы пациента (`patient_files`) — ОТДЕЛЬНАЯ система

- **Таблица `patient_files`** (`apps/webapp/db/schema/patientFiles.ts`) — отдельная от `media_files`:
  собственные `s3Key`/`s3Bucket`, `category`, `visitId`. **НЕ имеет `folderId` и не связана с `media_folders`.**
- **Модуль** `apps/webapp/src/modules/patient-files/{ports.ts,service.ts}` + `infra/repos/pgPatientFiles.ts`
  (drizzle, чисто). Порт: `listFiles/getFile/createFile/linkFileToVisit/renameFile`.
- **API** `app/api/doctor/patients/[userId]/files/route.ts`:
  - POST создаёт строку `patient_files` + presigned PUT, S3-ключ `patient-files/{fileId}/{safeName}`.
    ⚠️ **НЕ создаёт папку пациента, не пишет в media-библиотеку.** Это главный разрыв для правила 4.
  - GET листит `patient_files` (НЕ media-библиотеку).
  - PATCH (`[fileId]/route.ts`) — `linkFileToVisit` + `renameFile` (правило 6 — переименование уже есть здесь).
- **UI** `app/app/doctor/patients/[userId]/tabs/PatientTabFiles.tsx` — двухпанельный список + загрузка + rename
  (карточный режим имеет inline-rename, правило 6). Использует shared `CatalogSplitLayout` и doctor primitives.

### 4.5 Переименование папки пациента — СЕЙЧАС ЗАПРЕЩЕНО (разрыв с правилом 2)

- **`app/api/admin/media/folders/[id]/route.ts`** PATCH: если `isSystemManagedMediaFolder(existing.kind)` →
  **409 `system_folder_readonly`**. Т.к. `client_patient` system-managed, **врач сейчас НЕ может переименовать**
  подпапку пациента. Правило 2 требует разрешить rename подпапки (но НЕ root, НЕ move наружу).

---

## 5. Architecture constraints (§6 ALWAYS + repo rules)

- ⛔ **No raw SQL для новых фич** — только Drizzle. (Замечание: существующие `clientFilesSubtreeFolderIdsSql` /
  list-предикаты в `s3MediaStorage.ts` уже используют `sql\`\`` теги внутри drizzle-query — это легаси media-репо,
  расширять его — переиспользование существующего предиката, НЕ новый raw-SQL feature. Новых таблиц/новых сырых
  запросов не вводим.)
- **DI**: `modules/*` не импортируют `@/infra/db/*` или `@/infra/repos/*`; только через `ports.ts` +
  `buildAppDeps`. Route-handlers тонкие.
- **No duplicate UI/backend** — переиспользовать `clientMediaFolders` / `pgEnsureClientPatientFolder` /
  `excludeClientFiles` / `MediaLibraryFolderScopeSelect`. НЕ строить вторую папочную систему.
- **UI search before server search**; **SSR before excess fetch**.
- **Tests scoped per stage** (step/phase level; полный CI только перед push).
- **Doctor UI primitives** (§16) — `shared/ui/doctor/**`, без голых `<h2>`, `rounded-xl` секции и т.д.
- **Patient/Doctor UI isolation** (§17).

---

## 6. Open questions (для владельца — сверх зафиксированного микро-вопроса)

- **O1 — Имя системной папки.** Существующая инфра называет root **«Файлы клиентов»**
  (`CLIENT_FILES_ROOT_FOLDER_NAME`). Правило 1 говорит **«Пациенты»**. Варианты:
  (a) переименовать root-константу в «Пациенты» (затрагивает legacy-promote по `nameNormalized` и существующие
  prod-папки — нужна осторожная миграция/совместимость), либо (b) оставить «Файлы клиентов» как внутренний root,
  показывать ярлык «Пациенты» в UI. **Дефолт плана: (a) переименовать в «Пациенты»** с сохранением совместимости
  promote-логики; подтвердить у владельца, не сломает ли это уже созданные prod-папки «Файлы клиентов».
- **O2 — Унификация хранилищ.** Правило 4 требует, чтобы загрузки со страницы пациента жили в media-библиотеке
  внутри папки пациента. Сейчас это отдельная таблица `patient_files` с отдельным S3-ключом. Варианты:
  (a) **двойная запись/связь** — создавать `media_files`-строку в папке пациента ПЛЮС хранить `patient_files`
  (с категорией/привязкой к визиту) и связать их (`patient_files.media_file_id`); вкладка «Файлы» и библиотека
  видят один файл; (b) мигрировать `patient_files` полностью в `media_files` + расширить `media_files` категориями
  (большой рефактор). **Дефолт плана: (a)** — минимальный разрыв, переиспользует обе системы, сохраняет
  AI-roadmap по `patient_files`. Подтвердить у владельца.
- **O3 — Индив-упражнение врача «на приёме» (правило 5).** Не найден существующий doctor-side эндпойнт, который
  записывает видео индив-упражнения в момент приёма (есть discussion/program-activity, но без media-upload в папку
  пациента). Нужно подтвердить точку входа: это будущая фича или уже существующий поток attach-видео к program item?
  **Дефолт плана:** обеспечить, чтобы ЛЮБОЙ doctor-side upload видео индив-упражнения проходил через
  `pgEnsureClientPatientFolder` (как у patient-side submission); если эндпойнта ещё нет — стадия добавляет helper +
  точку подключения, фактический UI индив-упражнения — вне scope (отдельная инициатива).
- **O4 — Дедуп last4 vs существующий uuid8 fallback.** `clientPatientFolderFallbackName` сейчас даёт `base · uuid8`.
  Правило 2 требует last4 телефона. План заменит uuid8 на last4(`phoneNormalized`); если телефона нет — нужен
  вторичный fallback (предлагаю uuid8 как и раньше, чтобы гарантировать уникальность). Подтвердить у владельца
  поведение «нет телефона».

---

_Подготовлено PLANNER. Далее — Plan-auditor по `docs/AGENT_AUTORUN_SCHEME.md`._
