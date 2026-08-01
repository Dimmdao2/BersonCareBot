# shared staff account

Канонический личный раздел сотрудника: `/app/account`.

- `profile` (default): существующие account email и timezone; исторические specialist defaults показываются только
  при наличии clinical workspace и сохраняют прежний write-path.
- `notifications`: существующая персональная матрица каналов/тем; organization-specific task projection читается
  только при наличии clinical workspace.
- `install`: существующий `StaffPwaInstallSection` без копии PWA-механики.

Доступ проверяет U1 capability `account.self` через `requireStaffAccountPage`; membership и specialist binding не
являются условием личного аккаунта. Organization context, если он есть, используется только для shell и сохранённых
specialist-specific defaults. Management-only staff не получает клинические controls, а account не выдаёт
organization-management capability.

Security tab содержит добровольные 2FA/sessions controls и смену пароля с текущим паролем. Для legacy
owner-membership без `specialist_id` здесь же доступен owner-only repair «Подключить рабочий кабинет» без
предварительного TOTP. Уже настроенный фактор по-прежнему нужно подтвердить в текущем сеансе; отдельного
платформенного требования для всего персонала нет. Отдельного `/app/ops/account` нет.
