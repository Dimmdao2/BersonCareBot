# LOG — Global Admin UI

## 2026-08-20

- Состояние плана синхронизировано с production-кодом: страница аналитики уже подключена к агрегатору,
  закрыты реализованные CONNECT-блоки и предусмотренные заглушки.
- Единственный незакрытый пункт самой страницы — `GA-A-02b`: врачебные заходы не имеют ingest и показываются
  как «—». `GA-L-01/02` (лимиты 10/20 минут) также не реализованы, но принадлежат инфраструктурному контуру.
- Связанные планы сведены в README/ROADMAP: консоль клиник `#1068` реализована; поддержка `#1070` не начата и
  заблокирована DB/RLS security gate.
- Проверка: `pnpm --dir apps/webapp test -- src/modules/platform-analytics/platform-analytics.unit.test.ts
  src/app/api/admin/platform-analytics/platform-analytics.route.test.ts
  src/infra/repos/pgPlatformAnalyticsRoot.unit.test.ts` фактически запустила весь Vitest-проект webapp:
  `403` файла passed, `4` skipped; `1854` теста passed, `12` skipped.

## 2026-08-19

- Заведена папка инициативы. Карточка taskdb не создавалась.
- Записаны owner-решения по аналитике и лимитам видео.
- В `INFRASTRUCTURE_SECURITY_PLAN.md` п. 25 лимит «5–7 минут» помечен УСТАРЕЛО/ЗАМЕНЕНО → 10 мин файл
  упражнения (иначе хостинг iframe) / 20 мин файл CMS.
- Канвас кабинета: аналитика больше не 4 вкладки врача, а один экран с блоками платформы.
- Проверка механик: что уже есть в схеме/событиях — CONNECT; чего нет — STUB / NEW. См. STAGE_01.
- Ссылка хостинга в упражнении вынесена в кабинет врача: `DOCTOR_UI_REWORK` UI-EX-HOST (специалист + пациент).
- Этап 1 аналитики: страница `/app/doctor/analytics` подключена к `GET /api/admin/platform-analytics`
  (агрегаты drizzle, без drill-down). Заглушки: конвертация, дневник симптома, показы iframe.
