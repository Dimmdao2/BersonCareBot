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

ACC security/2FA/sessions не реализуются здесь: это U3S. Отдельного `/app/ops/account` нет.
