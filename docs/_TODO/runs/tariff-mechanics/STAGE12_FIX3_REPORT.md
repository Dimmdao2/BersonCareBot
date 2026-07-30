## ИТОГ

Безусловный `onClose()` скрывал API-отказ → загрузка теперь возвращает статус успеха, а панель закрывается только после успешной загрузки; для ненастроенного и исчерпанного объёма показаны конкретные действия без выдуманных чисел ([PatientTabFiles.tsx:209](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/tabs/PatientTabFiles.tsx:209>), [PatientTabFiles.tsx:298](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/tabs/PatientTabFiles.tsx:298>)) → существующий тест рендерит панель и проверяет обе причины отказа ([tariffMechanics.route.test.ts:198](/home/dev/dev-projects/bcb-wt-[redacted-token].route.test.ts:198)) → при временном возврате `onClose()` на отказе оба сценария упали, после восстановления получили 6/6 зелёных.

Проверки: route 6/6, patient-files service 1/1, webapp typecheck и lint — успешно. Full CI не запускался.

Коммит: `9ee6971c9`. Push/merge не выполнялись; миграция `0275` не затронута.

Открыто: item 4.10 — удаление файлов и освобождение объёма — остаётся отдельной задачей stage 4.