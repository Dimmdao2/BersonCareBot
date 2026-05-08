# treatment-program-shared

Общие примитивы для экранов врача по программам лечения:

- **`treatmentProgramConstructorShellStyles.ts`** — цвета шапок карточек, классы карточек этапа/«общие рекомендации», `tplToolbarTextBtnClass`; алиасы `TPL_*` совпадают с именами в конструкторе шаблона и указывают на те же строки, что `INSTANCE_*`.
- **`InstanceAddLibraryItemDialog.tsx`** — модалка «Элемент из библиотеки» для экрана назначенной программы (POST `.../instances/.../stages/.../items`; для этапа 0 дополнительно POST `.../items/from-freeform-recommendation`). Режим «Свой текст» на этапе 0: **`MarkdownEditorToastUi`** (как в форме каталога рекомендаций), один запрос на composite endpoint. Тесты: `InstanceAddLibraryItemDialog.test.tsx`.
- **`treatmentProgramLibraryTypes.ts`** — типы строк каталога для шаблона и инстанса.
