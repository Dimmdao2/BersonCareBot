# Календарный пояс пациента — журнал

## 2026-05-17

- Заведена папка **`docs/PATIENT_CALENDAR_TIMEZONE_INITIATIVE/`**, добавлены **`README.md`**, **`MASTER_PLAN.md`**, этот **`LOG.md`**.
- Зафиксировано в плане: поведение **`react-timezone-select`** (дедуп по `(offset, hasDst)`), перенос видимых городов на «выжившие» IANA (`Europe/Bucharest`, `Asia/Dubai`), опора на **`searchTerms`** для «проигравших» ключей.
- Кодовая база на момент записи уже содержит: bootstrap при входе, `POST`/`GET`/`PATCH` `calendar-timezone`, профиль без блока «Дополнительно», `patientTimezoneSelectLabels`, `browserCalendarIana`, тест `route.test.ts` (см. коммит(ы) на `main` за 2026-05-17).
