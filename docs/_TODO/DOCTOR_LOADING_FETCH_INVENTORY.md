# Doctor loading — post-load fetch inventory

Классификация client `fetch` на карточке пациента и соседних doctor routes после workstream «ускорение кабинета».

| Surface | Fetch / источник | Класс | Первый экран |
|--------|-------------------|-------|----------------|
| Карточка · Обзор | clinical, appointments, notes, tasks, packages, program list, program detail, calendar, messages snapshot, program-activity | **server bootstrap** (tab=overview) | SSR |
| Карточка · Обзор | calendar при смене месяца | **refresh** (user navigation) | client |
| Карточка · Обзор | packages после `patient:packages-changed` | **mutation refresh** | client event |
| Карточка · вкладки ≠ overview | данные вкладки при client switch | **inactive until visit** | client on first mount |
| Карточка · header | FIO PATCH | **mutation** | client |
| Карточка · header | «Открыть чат» | **lazy** (`DoctorClientEmbeddedChat` + ensure on open) | client on click |
| Communications · comments | feed/patients | **server bootstrap** (tab=comments) | SSR |
| Communications · другие табы | tab data | **client** в shell | client |
| Schedule | directory + timezone | **server** (все табы; scope bootstrap) | SSR |
| Сегодня (`/app/doctor`) | dashboard bundle | **server** | SSR |

Правило: первый видимый экран по `?tab=` — через `loadDoctorPatientCardPageBootstrap`; без `conversations/ensure` на RSC; ensure только на явном открытии чата.
