# doctor

Раздел **`/app/doctor`** (layout: `layout.tsx`) — кабинет врача и админа.

**Каркас UI:** фиксированная шапка `DoctorHeader`, отступ контента `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`, страницы оборачиваются в `AppShell` с `variant="doctor"`. Максимальная ширина колонки и горизонтальные отступы шапки и контента заданы в `shared/ui/doctorWorkspaceLayout.ts` (сейчас `max-w-7xl`, `px-4` / `md:px-6`). Подробнее: `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md` (подраздел «Единый каркас страниц»).

**Главная** (`page.tsx`): только пользователи с ролью врач или админ. Сообщение из «рабочего пространства» и блок «Список пациентов» (заглушка или список из конфигурации). Данные из `doctorCabinet.getDoctorWorkspaceState()`. Без кнопки «Назад» на корне раздела.
