# References — Patient App Visual Redesign

Эта папка предназначена для референс-скриншотов макетов главной "Сегодня" пациентского приложения. Они используются как визуальное направление при EXEC Phase 3/4.

## Что класть сюда

Скриншоты из дизайн-инструмента (Figma / макеты), которые показывают желаемый вид:

- mobile home (390 px ширины) — целиком и фрагменты блоков (hero, booking, situations, progress, reminder, mood, SOS, plan);
- desktop home (1280 px) — общий вид и top nav.

Рекомендуется именовать файлы предсказуемо:

- `mobile-home-full.png`
- `mobile-hero.png`
- `mobile-booking.png`
- `mobile-situations.png`
- `mobile-progress.png`
- `mobile-reminder.png`
- `mobile-mood.png`
- `mobile-sos.png`
- `mobile-plan.png`
- `desktop-home-full.png`
- `desktop-top-nav.png`

## Что НЕ хранить здесь

- секреты, токены, переменные окружения;
- большие исходники макетов (Figma project files); только экспорты PNG/JPG/WebP;
- скриншоты с реальными ПДн пациентов.

## Как агент использует эти файлы

- EXEC Phase 3/4 читают `VISUAL_SYSTEM_SPEC.md` как primary source и эту папку как визуальное направление.
- Если папка пустая — агент работает только по `VISUAL_SYSTEM_SPEC.md` и фиксирует это в `LOG.md`.
- Референсы не являются пиксельным контрактом. Структура навигации (no Back на desktop, профиль справа, top nav вместо bottom на desktop, и т.п.) задана в `MASTER_PLAN.md §5`, не в этих скриншотах.

## Версионирование

Если макеты меняются — старые файлы можно перенести в подпапку `archive/` или просто перезаписать новыми и зафиксировать это в `LOG.md`.

