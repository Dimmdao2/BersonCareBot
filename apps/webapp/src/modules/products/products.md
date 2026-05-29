# Products (booking stage 7)

Универсальный каталог `be_products` (`product_type`) и покупки `be_product_purchases`. Оплата: `payments` с `purpose=product_purchase`, `productRef=product_purchase:{id}`. После capture — `activatePurchase` → entitlements / `courses.enrollPatient` / `memberships.grantPrepaidCatalogPackage`.

Связь по телефону: `buyer_phone_normalized` + `linkPurchasesForUser`; перед активацией/оплатой гостя — `resolvePlatformUserByPhone` (DI).

Запись: `POST /api/booking/create` + `productPurchaseId`; `listActivePurchasesForBooking`; `consumeVisitForAppointment` / `applyCancelVisitOutcome`.

Доступ к контенту: grants в `content_access_grants_webapp`; проверка — `resolvePatientCanViewContent`, `filterPatientSectionPages`.

Pay link: `be_product_pay_links`, API `/api/booking/public/products/*`, UI `/book/product/{token}`.
