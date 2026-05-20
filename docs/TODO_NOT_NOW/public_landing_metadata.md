# Публичный лендинг — title и meta из настроек

**Статус:** черновик (не сейчас)  
**План:** [`.cursor/plans/archive/public_landing_metadata_system_settings.plan.md`](../../.cursor/plans/archive/public_landing_metadata_system_settings.plan.md) (`status: draft`)

## Суть

Вынести **заголовок вкладки** (`<title>`) и **meta description** для главной страницы `/` из хардкода в **`system_settings`** (scope `global`). Врач (и админ) редактируют две строки в настройках кабинета; лендинг подставляет их при SSR через `generateMetadata` и `buildAppDeps`.

Не входит: тексты блоков на самой странице (hero, «Обо мне» и т.д.) — только служебные meta документа. Manifest PWA / `appleWebApp` — отдельное решение позже.

## Код сейчас

- **Не сделано:** ключа `public_landing_document_meta` нет в `ALLOWED_KEYS`; doctor/admin PATCH не расширены; в [`apps/webapp/src/app/page.tsx`](../../apps/webapp/src/app/page.tsx) по-прежнему константы `ogTitle` / `ogDescription` и `export const metadata`.
- **Зачем откладывали:** низкий приоритет относительно активных треков; продуктовая ценность — удобство правки без деплоя, не блокер.

## Когда брать

По запросу продукта (кастомизация бренда лендинга / iOS «На экран Домой») или в рамках инициативы PWA — см. [`../PWA_INITIATIVE/PHASE_01_ROOT_LANDING.md`](../PWA_INITIATIVE/PHASE_01_ROOT_LANDING.md).
