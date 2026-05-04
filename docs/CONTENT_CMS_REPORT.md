# Отчёт: динамические разделы CMS и контент из БД

## Диагностика (до изменений)

- Разделы контента были **захардкожены** в `saveContentPage` (`ALLOWED_SECTIONS`), в `ContentForm` (dropdown) и в меню пациента (`getMenuForRole`).
- Отдельные страницы `/app/patient/lessons` и `/app/patient/emergency` дублировали логику списков.
- Блок «Уроки» на главной использовал **нерабочие** ссылки `?category=` на `/app/patient/lessons`.
- Поле **`image_url`** не сохранялось (`imageUrl: null` в server action).

## Что сделано

### База данных

- Миграция [`apps/webapp/migrations/039_content_sections.sql`](../apps/webapp/migrations/039_content_sections.sql): таблица `content_sections` (`slug`, `title`, `description`, `sort_order`, `is_visible`, timestamps).
- Seed пятью разделами: `emergency`, `warmups`, `workouts`, `lessons`, `materials` (`ON CONFLICT (slug) DO NOTHING`).

### Репозиторий и DI

- [`apps/webapp/src/infra/repos/pgContentSections.ts`](../apps/webapp/src/infra/repos/pgContentSections.ts): порт `ContentSectionsPort`, `createPgContentSectionsPort()`, пустая заглушка `inMemoryContentSectionsPort`, фабрика `createInMemoryContentSectionsPort()` для тестов.
- [`buildAppDeps.ts`](../apps/webapp/src/app-layer/di/buildAppDeps.ts): `deps.contentSections`.

### CMS (врач)

- **Разделы:** `/app/doctor/content/sections`, `/new`, `/edit/[slug]` + `SectionForm`, `saveContentSection` в [`sections/actions.ts`](../apps/webapp/src/app/app/doctor/content/sections/actions.ts).
- Ссылка **«Разделы»** на списке контента [`doctor/content/page.tsx`](../apps/webapp/src/app/app/doctor/content/page.tsx).
- **Страницы контента:** выбор раздела из БД (`listAll`), валидация `getBySlug(section)` в [`actions.ts`](../apps/webapp/src/app/app/doctor/content/actions.ts); поле **URL картинки** и сохранение `imageUrl`.

### Пациент

- Единый маршрут **[`/app/patient/sections/[slug]`](../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx):** раздел из `content_sections`, список карточек из `content_pages` для `section = slug`.
- **Редиректы:** [`/app/patient/lessons`](../apps/webapp/src/app/app/patient/lessons/page.tsx) → `/app/patient/sections/lessons`, [`/app/patient/emergency`](../apps/webapp/src/app/app/patient/emergency/page.tsx) → `/app/patient/sections/emergency`.
- [`paths.ts`](../apps/webapp/src/app-layer/routes/paths.ts): `lessons` и `emergency` указывают на canonical URL под `/sections/...`.
- Главная: блок каталога разделов из `listVisible()` на текущей главной **не рендерится** (ранее существовал отдельный компонент «Уроки» — удалён; каталог — [`/app/patient/sections`](../apps/webapp/src/app/app/patient/sections/page.tsx)).
- Меню: [`menu/service.ts`](../apps/webapp/src/modules/menu/service.ts) принимает `contentSections`; [`patient/page.tsx`](../apps/webapp/src/app/app/patient/page.tsx) и [`api/menu/route.ts`](../apps/webapp/src/app/api/menu/route.ts) передают `listVisible()` для роли `client`.

### Кэш

- `revalidatePath("/app/patient/sections", "layout")` в сохранении страницы и lifecycle контента; убраны привязки только к `/lessons` и `/emergency`.

### Устаревшие модули

- В [`lessons/service.ts`](../apps/webapp/src/modules/lessons/service.ts) и [`emergency/service.ts`](../apps/webapp/src/modules/emergency/service.ts) добавлены комментарии `@deprecated` (логика списков на пациенте перенесена на `/sections/[slug]`).

## Схема связей

- `content_sections.slug` — справочник разделов.
- `content_pages.section` — FK по смыслу к `content_sections.slug` (текстовая связь, без DB FK).

## Тесты

| Файл | Назначение |
|------|------------|
| `apps/webapp/src/infra/repos/pgContentSections.test.ts` | In-memory порт |
| `apps/webapp/src/app/app/doctor/content/sections/actions.test.ts` | `saveContentSection` |
| `apps/webapp/src/app/app/doctor/content/actions.test.ts` | раздел из БД, `image_url`, unknown section |
| `apps/webapp/src/app/app/doctor/content/ContentForm.test.tsx` | `sections` prop, `image_url` input |
| `apps/webapp/src/modules/menu/service.test.ts` | динамические пункты меню |
| `apps/webapp/src/shared/ui/doctorScreenTitles.test.ts` | заголовки экранов разделов |
| `apps/webapp/src/app-layer/di/buildAppDeps.test.ts` | наличие `contentSections` |

## Чеклист ручной проверки

1. Применить миграции: `pnpm run db:migrate` (в каталоге webapp / по документации проекта).
2. `/app/doctor/content/sections` — видны 5 seed-разделов.
3. Создать раздел → появляется в списке и в dropdown при создании страницы контента.
4. `/app/doctor/content/new` — разделы из БД; сохранение с `image_url` → картинка на `/app/patient/content/[slug]`.
5. `/app/patient/sections/warmups` (и др.) — сетка материалов из `content_pages`.
6. `/app/patient/lessons` и `/app/patient/emergency` — редирект на `/sections/...`.
7. Главная пациента (блок «Уроки») — карточки разделов из БД.
8. `pnpm run ci` — зелёный.

## Медиа-библиотека и выбор файлов в CMS

Цель: не вводить вручную URL картинок и видео; выбирать из загруженных в систему файлов, с возможностью загрузки и администрирования.

### API (webapp)

- `GET /api/admin/media` — список медиа (фильтры/сортировка на стороне сервера по согласованной с UI модели).
- `DELETE /api/admin/media/[id]` — если файл используется в контенте, ответ `409` с телом `usage`; повтор запроса с query `confirmUsed=true` выполняет жёсткое удаление.
- Загрузка медиа через существующий контракт upload (см. `apps/webapp/src/app/api/media/` и модули `modules/media`).

### Интерфейс врача

- Страница библиотеки: **`/app/doctor/content/library`** — просмотр, фильтры, сортировка, загрузка, удаление с учётом использования.
- В форме контента (**`ContentForm`**) поля изображения и видео переведены на выбор из библиотеки (диалог выбора вместо «сырых» URL); для видео тип `api` согласован с server action и отображением на странице пациента.

### Тесты

- Route-обработчики admin media покрыты тестами в `apps/webapp/src/app/api/admin/media/` (`route.test.ts`, `[id]/route.test.ts`).

---

## Дополнения (пациент: вход, PIN, меню, бот)

- **Mini App из Telegram/MAX:** в сценариях `assistant.open` кнопка открытия webapp через `webAppUrlFact` (не `url`); для MAX в facts к URL добавлен `ctx=bot` (как в Telegram). См. `apps/integrator/src/content/*/user/scripts.json`, `apps/integrator/src/integrations/max/webhook.ts`.
- **Профиль — PIN:** при уже созданном PIN показывается статус «PIN-код создан» и «Сбросить PIN»; установка/смена — два шага с подтверждением. См. `apps/webapp/src/app/app/patient/profile/PinSection.tsx`.
- **Профиль — канал OTP:** блок «Подтверждение входа»; сохранение в `user_channel_preferences.is_preferred_for_auth` (миграция `040_auth_preferred_channel.sql`); `check-phone` отдаёт `preferredOtpChannel`, `AuthFlowV2` использует `pickOtpChannelWithPreference`.
- **Запись на приём:** убрана с главной (`PatientHomeBrowserHero`); пункт в гамбургер-меню (`PatientHeader`) и в `getMenuForRole` (`menu/service.ts`).
