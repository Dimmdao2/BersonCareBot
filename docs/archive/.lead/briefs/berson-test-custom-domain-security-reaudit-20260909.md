# Тест или взгляд — повторная security-приёмка Berson Care TEST custom domain #787

Ты независимый аудитор exact candidate `7e8a32b32` в текущей ветке. Сначала прочитай карту `AGENTS.md`, затем
целиком §1 (включая миграции и разбор прав), §1b, §5, §10a, §10b и §24. Authority: действующий
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, owner-решения внутри него и предыдущий
отчёт `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_TEST_CUSTOM_DOMAIN_2026-09-09.md`.

До чтения тестов классифицируй каждый пункт как «тест или взгляд». Проверь только исправленную DB/security-поверхность:

- staff больше не имеет прямого INSERT/UPDATE lifecycle-полей `org_custom_domain_bindings`;
- единственный `app.save_custom_domain_binding_intent(text, uuid, text, text)` выводит организацию из проверенного
  actor context, не принимает её от клиента и не позволяет выбирать identity/timestamps/readiness/activation;
- same-organization intent сохраняется, cross-organization spoofing и захват чужого hostname отклоняются;
- quarantine/anti-squatting, retry/supersede/clear и блокировки не регрессировали;
- owner, grants, generated DEV/TEST declaration и Drizzle repository binding соответствуют узкому seam;
- миграция не содержит локальных GRANT/REVOKE и проходит owner-aware named-DEV rollback-only preflight.

Не запускай отдельный Next, не трогай общий `:5200`, TEST/PROD/DNS/TLS/nginx и не создавай фикстуру второй организации.
Новые тесты допустимы только если до написания названы независимый oracle, дорогая молчаливая поломка и конечное
наблюдаемое последствие. Не писать тесты на SQL-текст, список прав, число полей, названия или UI. Сначала переиспользуй
существующий DEV proof; если live same/cross-org нельзя доказать без отсутствующей реальной второй организации,
зафиксируй точную границу, но не объявляй ложный PASS. Временный fault injection полностью откати.

Продуктовый fix не делай. Итог: один бинарный verdict, конкретные reachable findings либо PASS, команды и результаты,
четырёхточечный разбор прав, обновлённый audit-artifact и строка audit queue. Закоммить только audit/test artifacts;
production files должны остаться точно как в candidate. Долгие команды выполняй на переднем плане и дождись завершения.
