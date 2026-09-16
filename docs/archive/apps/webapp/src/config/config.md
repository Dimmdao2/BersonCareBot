# config

Конфигурация вебаппа: переменные окружения и флаги.

Чтение env (DATABASE_URL, секреты, URL медиа и т.д.), проверка наличия обязательных переменных, флаг production. Используется в app-layer/di, в модулях auth и integrator, в инфра (БД, вебхуки).

`productSurfaces.ts` — единственный источник user-visible имени и origin для staff/patient-default
поверхностей (`STAFF_SURFACE`, `PATIENT_DEFAULT_SURFACE`, `PLATFORM_NAME`); см. комментарий в файле.
`productSurfaceNames.ts` — литералы имён без чтения env (безопасно импортировать из `'use client'`,
в отличие от `env.ts`/`productSurfaces.ts`); `env.ts` и `productSurfaces.ts` берут дефолт оттуда же.
Клиентский display патч-имени (env-переопределяемого `PATIENT_APP_NAME`, TPB-09) — НЕ через этот
литерал: `'use client'`-компоненты берут его через `useSurfaceName()` из
`@/shared/ui/PlatformProvider`, куда server-resolved значение приходит из `RootLayout`
(`app/layout.tsx`). `STAFF_SURFACE_NAME` env-переопределения не имеет (владелец, TPB-01) — его
безопасно импортировать из `productSurfaceNames.ts` напрямую.
