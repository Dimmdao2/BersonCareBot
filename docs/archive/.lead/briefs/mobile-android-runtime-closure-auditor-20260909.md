# Тест или взгляд — #915 Android runtime closure

Это один цельный Android emulator/live-аудит M7-04. Product code и постоянные тесты не менять.

## Authority

- Прочитать карту заголовков `AGENTS.md`, затем полностью §1, §1a, §1b, §9, §10, §10a, §10b, §12 и §24.
- Прочитать `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `apps/mobile-shell/README.md`, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M2-00/M2-00a/M7-04/§6 и `.lead/runs/mobile-emulator-network-recovery-20260909/90-final-audit-report.md`.
- Точный M7-04 критерий: «Android acceptance на эмуляторе покрывает origins/внешние ссылки, камеру, документы, native Jitsi, состояния разрешений и tap уведомления с подставным провайдером».

## Предмет и разрешённая host-операция

Сначала воспроизвести/локализовать `com.android.systemui` ANR существующего API 36 AVD, затем получить стабильный emulator runtime. Владелец уже разрешил user-owned Android SDK/emulator setup в M2-00/M2-00a. Можно под `/home/dev/.local/share/bcb-android` установить один официальный совместимый x86_64 Google APIs system image (например API 35) и создать отдельный AVD, если это рациональнее ремонта API 36. Перед установкой измерить `df -B1 /`; существующий SDK/AVD не удалять, чужие caches не чистить, sudo не использовать. TEST/PROD services/DB/env не менять. Реальные RuStore credentials и provider delivery не использовать.

Использовать fresh уже собранные TEST APK из source либо пересобрать только если artifacts отсутствуют/не соответствуют exact SHA; full CI не запускать. Эмулятор должен стартовать с KVM, без snapshot, на отдельном adb port. Дождаться полного boot foreground-проверкой; не завершать ход в ожидании. После стабильного boot проверить оба приложения обычным UI-путём:

1. compiled exact origin остаётся внутри WebView; сторонний HTTPS URL уходит во внешний browser без bridge;
2. штатный вход Дмитрия Берсона (patient OTP, specialist password по §1a) без bypass;
3. camera Photo/Video screen и permission grant/deny/retry; gallery/document picker и cancel/selection на безопасном локальном sample без upload;
4. Native Jitsi Activity, camera/mic grant/deny/retry, уход назад/home → системный PiP без завершения, возврат, явная кнопка завершения;
5. notification tap с уже существующим fake/substitute provider harness приводит только на allowlisted route; denied notification permission наблюдается отдельно.

Не считать unit/Robolectric/adb прямой вызов plugin-метода заменой обычного UI-пути, но разрешено переиспользовать принятые тесты только для того, что невозможно физически наблюдать в эмуляторе, с явной пометкой partial. Не писать новые постоянные тесты. Не исправлять product code: достижимый дефект — finding и стоп для worker.

## Результат

- Единственный repo-файл: `.lead/runs/mobile-android-runtime-closure-20260909/90-final-audit-report.md`; screenshots можно сохранить рядом.
- Exact SHA/APK hashes, AVD/image/tool versions, команды без секретов, бинарный verdict каждого M7-04 подпункта, cleanup и остаточный blocker.
- Остановить только свой emulator, удалить временные samples/logs; стабильный новый user-owned AVD можно сохранить и задокументировать, если он реально прошёл boot.
- Закоммитить только audit-artifact/screenshots явным staging, не push; дождаться foreground-команд.

Это live view: `убито 0 / непойманных 0`.
