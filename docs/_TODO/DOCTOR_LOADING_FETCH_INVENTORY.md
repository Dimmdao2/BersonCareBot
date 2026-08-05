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
| Schedule · shell | directory + timezone + payments/stats visibility | **server** (все табы; scope bootstrap) | SSR |
| Schedule · Записи (`tab=cal`) | calendar feed + KPI + doctor calendar settings | **server bootstrap** (`loadDoctorScheduleCalendarBootstrap`) | SSR; client skips initial fetch |
| Schedule · Записи | calendar/KPI при смене view/date/filter; 30s poll; nearest-window | **refresh** | client |
| Schedule · work/setup | tab data | **inactive until visit** (visitedTabs) | client on first mount |
| Сегодня (`/app/doctor`) | today appointments, unread, people, tasks, pending tests, working bounds | **server** (Suspense stream) | SSR |
| Сегодня · admin banners | health + registration failure | **server** (отдельный Suspense) | SSR stream |
| Сегодня · week/month/stats KPI | deferred right KPI row | **deferred** (не грузится на first paint) | N/A until row restored |
| Templates · list | `listTemplates` promise-props + Suspense | **server bootstrap** | SSR stream |
| Templates · constructor library | exercises/lfk/tests/recs/content/refs | **inactive until select** (`loadTreatmentProgramLibrary` server action) | client on select |
| Templates · detail | `GET /api/doctor/treatment-program-templates/[id]` | **inactive until select** | client on select |
| LFK templates · list + exercise catalog | promise-props + Suspense | **server bootstrap** (parallel promises) | SSR stream |
| Recommendations · list (+ usage for `?selected=`) | `listPromise` + Suspense | **server bootstrap** | SSR stream |
| Clinical tests · list (+ usage) | `listPromise` + Suspense | **server bootstrap** | SSR stream |
| Test sets · list + clinical library | `listPromise` + Suspense | **server bootstrap** | SSR stream |
| Content hub (`/app/doctor/content`) | pages/sections/ratings/courses | **server** (entitlement-gated; baseline 404 = no cms visibility) | SSR; tiles already VirtualizedItemGrid |

Правило: первый видимый экран по `?tab=` — через `loadDoctorPatientCardPageBootstrap`; без `conversations/ensure` на RSC; ensure только на явном открытии чата.

Каталоги Stage 2: shell/toolbar вне Suspense; тяжёлый list через promise-props; inactive editor catalogs не блокируют first paint.

---

## TEST baseline (timing + bundle)

Stage 1 evidence: [`DOCTOR_LOADING_BASELINE.md`](./DOCTOR_LOADING_BASELINE.md) — nginx `bersoncare_webapp_detailed` on `test.bersoncare.ru`, route upstream p50/p95, cron noise, first-load JS from deployed TEST `.next` manifests.
