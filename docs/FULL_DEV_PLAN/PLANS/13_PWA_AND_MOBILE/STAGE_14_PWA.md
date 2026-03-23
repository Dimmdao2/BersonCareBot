# Этап 14: PWA

> Приоритет: P3
> Зависимости: Этап 2 (дизайн-система), стабилизация UI
> Риск: средний (Service Worker, push notifications)

---

## Подэтап 14.1: Manifest + meta

**Задача:** PWA-манифест и мета-теги.

**Файлы:**
- `apps/webapp/public/manifest.json` (новый)
- `apps/webapp/src/app/layout.tsx`
- Иконки в `public/icons/`

**Действия:**
1. Создать `manifest.json`:
   ```json
   {
     "name": "BersonCare",
     "short_name": "BersonCare",
     "description": "Кабинет здоровья",
     "start_url": "/app",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#4a6fa5",
     "icons": [
       { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
     ]
   }
   ```
2. Добавить мета-теги в `layout.tsx`:
   ```html
   <link rel="manifest" href="/manifest.json" />
   <meta name="theme-color" content="#4a6fa5" />
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-status-bar-style" content="default" />
   ```
3. Создать иконки (192x192 и 512x512).

**Критерий:**
- `display: standalone` — приложение без строки браузера.
- Chrome предлагает установку.

---

## Подэтап 14.2: Service Worker

**Задача:** кэширование для offline.

**Файлы:**
- `pnpm --filter webapp add workbox-webpack-plugin` (или next-pwa)
- `apps/webapp/public/sw.js`

**Действия:**
1. Оценить `next-pwa` (если совместимо с Next.js 16) или ручной Workbox SW.
2. Стратегии:
   - App shell (`/app`, `/_next/static/`): `CacheFirst`.
   - API данные: `NetworkFirst` с offline fallback.
   - Медиа (images, fonts): `CacheFirst` с TTL 30 дней.
3. Precache: основные страницы.
4. Fallback page: `/offline` с сообщением «Нет подключения к интернету».

**Критерий:**
- При offline: приложение открывается, показывает кэшированные данные.
- При восстановлении сети: автоматическая синхронизация.

---

## Подэтап 14.3: Offline дневник

**Задача:** записи дневника сохраняются offline.

**Файлы:**
- Новый: `apps/webapp/src/shared/lib/offlineStore.ts`
- Модули дневника

**Действия:**
1. Использовать IndexedDB (через idb library) для хранения pending записей.
2. При offline: запись сохраняется в IndexedDB, показывается с меткой «⏳ синхронизация».
3. При online: Background Sync API или ручная синхронизация при `navigator.onLine`.
4. Conflict resolution: server wins (если конфликт timestamps).

**Критерий:**
- Запись дневника работает offline.
- При восстановлении сети — синхронизация.
- Дубликаты не создаются.

---

## Подэтап 14.4: Push-уведомления

**Задача:** Web Push через VAPID.

**Файлы:**
- `pnpm --filter integrator add web-push`
- Integrator: push adapter
- Webapp: подписка на push

**Действия:**
1. Сгенерировать VAPID ключи: `web-push generate-vapid-keys`.
2. Webapp: запросить разрешение на push, отправить subscription на API.
3. Таблица: `push_subscriptions (user_id, endpoint, p256dh, auth, created_at)`.
4. Integrator: push delivery adapter (по аналогии с SMS/Telegram).
5. Интеграция с каналами: push = ещё один канал доставки в настройках уведомлений.

**Критерий:**
- Push-уведомления приходят на мобильный.
- Канал push доступен в настройках.
- Подписка сохраняется при обновлении SW.

---

## Подэтап 14.5: Страница «Установить приложение»

**Задача:** инструкция по установке PWA.

**Файлы:**
- Страница: `/app/patient/install`

**Действия:**
1. Содержимое:
   - Заголовок: «Установить BersonCare».
   - Инструкция для iOS: «Нажмите "Поделиться" → "На экран Домой"».
   - Инструкция для Android: «Нажмите ⋮ → "Установить приложение"» или отобразить install prompt.
   - Скриншоты.
2. Если браузер поддерживает `beforeinstallprompt` — показать кнопку «Установить».
3. Пункт в боковом меню.

**Критерий:**
- Страница с инструкцией.
- Install prompt на Android.
- Пункт в меню.

---

## Общий критерий завершения этапа 14

- [ ] PWA manifest, standalone display.
- [ ] Service Worker с кэшированием.
- [ ] Offline дневник.
- [ ] Push-уведомления.
- [ ] Страница установки.
- [ ] `pnpm run ci` проходит.
