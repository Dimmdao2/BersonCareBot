# Матрица несоответствий (до rework Close Audit Gaps)

Дата: 2026-04-01. Источник: сверка кода с планом «Close Remaining Audit Gaps».

| Зона | Статус | Комментарий |
|------|--------|-------------|
| PIN triple-fire / AuthFlowV2 | implemented | `PinInput` + ключи сброса в `AuthFlowV2` |
| Журнал прошедших записей | implemented | merge native + projection в cabinet |
| LFK overview newest-first | implemented | `dayKeys.reverse()` в lfk-stats |
| Logout APP_BASE_URL | implemented | `logout/route.ts` |
| CMS hub + news/motivation | implemented | отдельные страницы, не редиректы |
| Список разделов CMS | missing | таблица в `sections/page.tsx`, не плоский список как страницы |
| ContentLifecycleDropdown | partial | глаз + дубли publish в меню |
| Media grid/table/confirm | implemented | object-contain, confirm, outline delete |
| Upload PNG/MOV + тесты | partial | MIME в route есть, тесты только JPEG/PDF |
| Desktop file input accept | missing | desktop input без `accept` |
| nginx 413 | manual-prod | только доки, конфиг на хосте |
| FINAL_AUDIT / AGENT_LOG | inaccurate | утверждения про редиректы news/motivation |

---

## После rework (2026-04-01)

См. [REWORK_CLOSE_AUDIT_GAPS_REPORT.md](./REWORK_CLOSE_AUDIT_GAPS_REPORT.md) — пункты «missing/partial» по коду закрыты; `nginx 413` остаётся **manual-prod**.
