Содержимое модалки открылось: ДА.

# Живая приёмка содержимого модалки Э4b — DEV `:5200`, 15.09.2026

Общий стенд `http://127.0.0.1:5200`, обычный вход врача `dimmdao@yandex.ru`.
Проверено на живой модалке, без второго Next-сервера. Runtime основного дерева в момент прохода:

```bash
git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD
# f7c374cc2
```

Фикстура создана в `bcb_webapp_dev`: две учётки с медицинской историей внутри организации врача,
а строка конфликта — только штатной дверью
`app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)` под её настоящим
`pre_session` port-context. Решения врача не нажимались.

Живой проход выполнен под общим замком хоста:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && node .live_acceptance_e4b_modal.mjs"
# fixture: db=bcb_webapp_dev as=postgres org=a0000000-0000-4000-8000-000000000001 conflict=0ab701cb-3ceb-4916-a965-d3e1a6e00321
# desktop detail statuses: 200
# mobile detail statuses: 200
# cleanup FIXTURE_ROWS_LEFT=0
# RELEASED test lock (rc=0, 23s)
```

Одноразовый browser-driver после прохода удалён и не сохранён как автоматический UI-тест (§10a).

## Сверка с оракулом Э4b

| Пункт оракула | Есть/нет | На каком снимке видно |
|---|---|---|
| Какие назначения и от какого числа | **ЕСТЬ.** «Реабилитация поясницы» — 20 авг. 2026 г., 10:00; «Восстановление плеча» — 5 сент. 2026 г., 12:30. | [desktop](01-desktop-1440x1024.png), [mobile](02-mobile-390x844-top.png) |
| Последняя активность в каждой учётке | **ЕСТЬ.** 10 сент. 2026 г., 09:15 и 14 сент. 2026 г., 18:40. | [desktop](01-desktop-1440x1024.png), [mobile](02-mobile-390x844-top.png) |
| Как человек записан с обеих сторон (ФИО) | **ЕСТЬ.** «Иванова Анна Сергеевна» и «Петрова Анна Сергеевна». | [desktop](01-desktop-1440x1024.png), [mobile](02-mobile-390x844-top.png) |
| Два действия | **ЕСТЬ** на desktop и mobile. | [desktop](01-desktop-1440x1024.png), [mobile](02-mobile-390x844-top.png) |
| Отказ подписан «Отказать и передать администраторам платформы» | **ЕСТЬ** и полностью читается на desktop. **НЕТ полностью читаемой подписи на mobile:** текст кнопки обрезан за границей viewport и соседней кнопкой. | [desktop](01-desktop-1440x1024.png), дефект на [mobile](02-mobile-390x844-top.png) |

Desktop-снимок показывает всю модалку и оба действия без прокрутки. Mobile-снимок показывает обе
учётки и оба назначения; нижняя закреплённая панель действий видна одновременно с содержимым.

Размеры PNG измерены командой:

```bash
node -e "const fs=require('node:fs'); for (const f of process.argv.slice(1)) { const b=fs.readFileSync(f); console.log(f+' '+b.readUInt32BE(16)+'x'+b.readUInt32BE(20)); }" docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/01-desktop-1440x1024.png docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/02-mobile-390x844-top.png
# docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/01-desktop-1440x1024.png 1440x1024
# docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/02-mobile-390x844-top.png 390x844
```

## Найденный дефект

На viewport `390x844` две кнопки нижней панели остаются в одной строке равной ширины. Длинная подпись
отказа не помещается: её начало уходит за левый край снимка, конец перекрывается/обрезается перед кнопкой
«Слить в этой организации». Само действие существует в DOM с правильным полным accessible-текстом, но
человек на mobile не может прочитать его целиком. Дефект показан на
[02-mobile-390x844-top.png](02-mobile-390x844-top.png). По брифу код не исправлялся.

## НЕ СДЕЛАНО

- Не исправлялся найденный mobile-дефект и вообще не менялся код продукта.
- Не нажимались «Слить в этой организации» и «Отказать и передать администраторам платформы».
- Не запускались автоматические UI-тесты и полный CI.
- Не применялись миграции и не выполнялся privilege reconcile.
- Не использовалась учётка `dimmdao@gmail.com`; PROD не затрагивался.
- Строка вердикта в `feat`/очередь не записывалась.

