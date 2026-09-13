/**
 * Единый словарь пользовательских текстов ошибок/уведомлений — репозиторий-wide.
 *
 * Владелец, 13.09.2026: «нам нужен файл какой-то... нам нужно перенести все уведомления в одно
 * место... если у нас есть в двух разных местах двумя разными названиями ошибка, которая должна
 * показывать неверный логин или имейл... нахуя это делать два раза». `docs/_TODO/
 * NOTIFICATION_TEXT_CONSOLIDATION_2026-09-13.md` — план и чек-лист приёмки этой работы.
 *
 * ЧТО ЭТО. Готовый человеческий текст для известного, ожидаемого кода ошибки/уведомления —
 * `toast.error(...)`/`toast.success(...)` и `new UserFacingError('...')` по всему репозиторию,
 * плюс тексты, ранее жившие в `staffSecurityErrorText.ts`. Дедуплицировано ПО СМЫСЛУ: одинаковый
 * текст с разных call-site'ов (doctor/patient/admin/booking/…) — один ключ, а не N дублей с
 * разными именами.
 *
 * ЧТО ЭТО НЕ. Это НЕ слой безопасности, который решает, какой сырой текст исключения можно
 * показать пользователю — тот слой (`@/shared/errors/userFacingError`, `@/app-layer/errors/
 * safeUserError`, `classifyApiError`, `respondWithSafeApiError`, `safeActionErrorText`) остаётся
 * как есть и защищён отдельными gate-скриптами (`scripts/check-safe-user-error-door.mjs`,
 * `scripts/check-safe-error-transport.mjs`). Этот файл только поставляет ГОТОВЫЙ безопасный текст
 * для уже классифицированного кода; он не участвует в классификации/транспорте.
 *
 * ПРАВИЛО НАМЕРЕННО НЕОТЛИЧИМЫХ ПАР: где два кода обязаны показывать одинаковый текст по
 * соображениям безопасности (пример — вход под чужой ролью/порталом должен читаться так же, как
 * неверный пароль, чтобы не палить существование аккаунта/роли атакующему), это ОДИН ключ на оба
 * кода, а не два ключа с одинаковым значением. См. `authInvalidCredentialsOrPortalDenied` —
 * используется и `case 'portal_access_denied'`, и серверным ответом `email-password/login`
 * при `invalid_credentials`.
 *
 * ОБНОВЛЕНО (C4, копирайт-аудит 2026-09-13): пары `commonSaveFailed`/`settingsPatientHomeSaveFailed`
 * и `commonNetworkUnavailable`/`patientRemindersMuteToggleNetworkUnavailable`, которые предыдущий
 * проход намеренно НЕ объединял (см. историю ниже — были дублями по строке, не по смыслу, и
 * различались только пунктуацией), в этом проходе собраны в один ключ каждая: раз оба варианта
 * текста всё равно переписывались по C3 (мёртвый тупик без действия), сохранять два ключа с
 * одинаковым новым текстом смысла больше не было. `patientRemindersMuteToggleDone`/`commonDone` —
 * аналогично, третья такая пара, тоже собрана в один ключ.
 *
 * Историческая причина, почему они вообще были разделены (для контекста, уже неактуально):
 * `commonSaveFailed`/`settingsPatientHomeSaveFailed` (были `neUdalosSohranit`/`neUdalosSohranit2`) и
 * `commonNetworkUnavailable`/`patientRemindersMuteToggleNetworkUnavailable` (были `setNedostupna`/
 * `setNedostupna2`) отличались пунктуацией видимого текста и являлись НАХОДКОЙ старого прохода —
 * тогда не объединялись, чтобы перенос оставался механическим (без изменения текстов).
 *
 * Добавляя новый код: заведите ключ здесь и сошлитесь на него с call-site — не кладите строку
 * инлайново. Статический gate `scripts/check-notification-text-coverage.mjs` (часть `pnpm lint`)
 * не даёт новым `toast.error/success('...')`/`new UserFacingError('...')` со строковым литералом
 * появиться мимо этого файла — в ЛЮБОЙ позиции аргумента, включая `??`-фолбэк и тернарник, а не
 * только когда литерал стоит первым аргументом напрямую.
 *
 * `data.message ?? notificationText.someKey` — обычная и ожидаемая форма: сервер может прислать
 * свой текст первым, словарь даёт только запасной текст на случай, если ответ его не содержит.
 * Такой фолбэк — не менее «известный код», чем прямой литерал, и обязан ссылаться на словарь.
 */

export const notificationText = {
  // --- security / staff auth (ранее shared/ui/auth/staffSecurityErrorText.ts) ---
  authBindSpecialistFallback: 'Не удалось подключить рабочий кабинет. Повторите попытку позже.',
  authChangePasswordFallback: 'Пароль не изменён. Проверьте данные и повторите попытку.',
  authChannelDisabled: 'Вход по email временно отключён. Обратитесь к администратору и повторите позже.',
  authConfirmRecoveryFallback:
    'Не удалось подтвердить сохранение кодов. Проверьте, что коды сохранены, и повторите.',
  authDoctorWorkspaceMembershipRequired:
    'Рабочий кабинет не найден. Завершите настройку кабинета и повторите действие.',
  authEmailPasswordLoginFallback:
    'Не удалось войти из-за сбоя на нашей стороне. Повторите попытку позже.',
  authEnrollmentNotStarted: 'Настройка защиты не начата. Начните подключение приложения заново.',
  authFactorAlreadyEnrolled: 'Приложение-аутентификатор уже подключено. Обновите страницу.',
  authFactorLocked: 'Слишком много неверных кодов. Подождите 15 минут и попробуйте снова.',
  authFactorReplacementRequired:
    'Нужно заменить фактор защиты. Войдите с резервным кодом и подключите приложение заново.',
  authForbidden: 'Для этого действия нет доступа. Войдите под нужным аккаунтом и повторите.',
  // Роль/портал не совпали (roleCanUsePortal, pre-session) читается как неверные учётные данные
  // НАМЕРЕННО: раскрыть «этот аккаунт существует, но у него нет доступа к этой двери» означало бы
  // слить роль тому, кто перебирает чужую форму входа с угаданными данными. Тот же текст отдаёт и
  // сервер `email-password/login` для `invalid_credentials` — намеренно один ключ на оба кода.
  authInvalidCredentialsOrPortalDenied:
    'Email или пароль неверны. Проверьте данные или восстановите пароль.',
  // Отдельный текст для 'invalid_credentials' ВНЕ формы логина (например, пользователь исчез
  // между шагами подтверждения второго фактора) — контекст другой, палить нечего, поэтому текст
  // умышленно другой: «войдите заново и запросите новый код», а не «неверный пароль».
  authInvalidCredentialsSessionExpired:
    'Не удалось подтвердить вход. Войдите снова и запросите новый код.',
  authInvalidBody: 'Данные введены неверно. Проверьте их и повторите действие.',
  authOauthProviderRequired: 'Выберите способ входа.',
  authOauthStartFailed:
    'Не удалось начать вход из-за сбоя на нашей стороне. Повторите попытку позже.',
  authInvalidEmailFormat: 'Неверный формат email',
  // Channel-neutral on purpose (G1): this key now also covers the email `invalid_code` case, so
  // it must not say "в приложении" (authenticator-app-only wording).
  authInvalidFactor: 'Код неверный. Проверьте код и введите новый.',
  authLoginFactorEmailConflict: 'Не удалось подтвердить вход. Войдите снова.',
  authInvalidRecoveryCode: 'Резервный код неверный или уже использован. Введите другой резервный код.',
  authLoginChallengeExpired: 'Время подтверждения истекло. Войдите снова и запросите новый код.',
  authLoginFactorFallback: 'Не удалось подтвердить вход. Введите код ещё раз.',
  authOwnerRequired: 'Подключить рабочий кабинет может только владелец. Войдите под аккаунтом владельца.',
  authPasswordChangedSessionReissueFailed:
    'Пароль изменён, но сеанс завершён. Войдите снова с новым паролем.',
  authPasswordChangeFailed: 'Пароль не изменён из-за временной ошибки. Повторите попытку позже.',
  authPasswordLoginUnavailable:
    'Для аккаунта не настроен вход по паролю. Используйте другой способ входа.',
  // C2 (copy audit): «не доступен» → «недоступен» (слитно), добавлена точка в конце.
  authPasswordNotAvailableForRole:
    'Вход по паролю недоступен. Выполните вход по коду или выберите другой способ.',
  authPasswordTemporarilyLocked:
    'Слишком много неверных попыток. Подождите 15 минут или восстановите пароль.',
  authProvisioningPending: 'Настройка аккаунта ещё выполняется. Подождите немного и повторите.',
  authProxyConfiguration: 'Защита входа временно недоступна. Обратитесь к администратору и повторите позже.',
  authRateLimited: 'Слишком много попыток. Подождите 10 минут и повторите.',
  authRetryProvisioningFallback: 'Не удалось завершить настройку аккаунта. Повторите попытку позже.',
  authRevokeSessionsFallback: 'Не удалось завершить другие сеансы. Повторите попытку.',
  authSecuritySessionRequired:
    'Сеанс защиты больше не подтверждён. Выйдите и войдите снова, затем повторите.',
  authSecuritySetupPending: 'Не удалось подготовить защищённый вход. Повторите попытку позже.',
  authSecuritySetupRequired:
    'Сначала подключите двухфакторную защиту в разделе «Аккаунт» → «Безопасность».',
  authSignupIntentNotFound: 'Заявка на создание кабинета не найдена. Начните регистрацию кабинета заново.',
  authSpecialistBindingFailed: 'Рабочий кабинет не подключён. Повторите попытку позже.',
  authStartEnrollmentFallback: 'Не удалось начать настройку защиты. Повторите попытку.',
  authTotpEnrollmentStartFailed: 'Не удалось создать ключ защиты. Повторите попытку позже.',
  authUnauthorized: 'Сеанс входа истёк. Войдите снова и повторите действие.',
  authVerifiedEmailRequired: 'Email не подтверждён. Подтвердите email и повторите настройку защиты.',
  authVerifyEnrollmentFallback: 'Не удалось проверить код. Получите новый код и повторите.',
  authWeakNewPassword: 'Новый пароль должен содержать от 8 до 128 символов. Измените пароль и повторите.',
  authWrongCurrentPassword: 'Текущий пароль указан неверно. Проверьте его и повторите попытку.',

  // --- generic domain constants (ранее собственные именованные константы модулей) ---
  serviceHasNoDoerMessage:
    'Услугу пока некому оказывать. Назначьте специалиста и филиал, в котором он принимает.',

  // --- fallback texts, ранее инлайновые литералы внутри `data.message ?? '...'` (DEFECT 2,
  // 2026-09-13 verification pass) — сервер по-прежнему может прислать свой текст первым, словарь
  // даёт только запасной, когда ответ сервера его не содержит. ---
  authPasskeyEnrollStartFailed: 'Не удалось начать добавление ключа доступа. Повторите попытку.',
  authPasskeyVerifyFailed: 'Не удалось подтвердить ключ доступа. Повторите попытку.',
  // C5 (copy audit): «Попробуйте» → «Повторите попытку», majority phrasing.
  authTooManyRequestsRetryLater: 'Слишком много запросов. Повторите попытку позже.',
  messagingLinkFetchFailed: 'Не удалось получить ссылку. Повторите попытку.',
  commonSendFailed: 'Не удалось отправить. Повторите попытку.',
  exerciseSessionEntryAddFailed: 'Не удалось добавить запись. Повторите попытку.',
  authCodeSendFailed: 'Не удалось отправить код. Повторите попытку.',
  authEmailFactorSendFailed: 'Не удалось отправить код подтверждения. Повторите попытку позже.',
  // Split (reconciliation rule, safety audit): was reused outside the reminders domain at
  // DefaultPromoProgramClient.tsx (promo-program refresh) — a domain noun here would be wrong
  // there. Split into this reminders-only key plus `treatmentProgramPromoRefreshFailed`.
  patientReminderUpdateFailed: 'Не удалось обновить напоминание. Повторите попытку.',
  exerciseSessionMarkFailed: 'Не удалось отметить занятие. Повторите попытку.',
  doctorWarmupScheduleSaveFailed: 'Не удалось сохранить расписание. Повторите попытку.',
  settingsOperatorAlertsSaveFailed: 'Не удалось сохранить настройки операторских алертов. Повторите попытку.',
  settingsOperatorAlertsFallbackEmailSaveFailed: 'Не удалось сохранить резервный e-mail. Повторите попытку.',
  messagingCodeRequestFailed: 'Не удалось запросить код. Повторите попытку.',
  messagingBindingStartFailed: 'Не удалось начать привязку. Повторите попытку.',
  // C5 (copy audit): avoid repeating "попыт-" root twice ("попыток"/"попытку") — «подождите» instead.
  authTooManyAttemptsRetryLater: 'Слишком много попыток. Подождите и повторите позже.',
  // C1 (copy audit): "Провайдер недоступен" named the internal OAuth term and gave no next step.
  authProviderUnavailable: 'Не удалось войти через выбранный способ. Повторите попытку позже.',
  authSignupStartFailed: 'Не удалось начать регистрацию. Повторите попытку.',
  authEmailNotVerifiedRetryLogin: 'Email не подтверждён. Подтвердите адрес и повторите вход.',
  authAttemptsTooFrequent: 'Слишком частые попытки',
  authCodeInvalidOrExpired: 'Неверный или просроченный код',
  messagingMessageSent: 'Сообщение отправлено',

  // --- auth/account ---
  authOtherSessionsEnded: 'Другие сеансы завершены',
  authPasskeyAdded: 'Ключ доступа добавлен',
  authPasskeyRemoved: 'Ключ доступа удалён',
  authPasskeyAddFailed: 'Не удалось добавить ключ доступа. Повторите попытку.',
  authPasskeyRemoveFailed: 'Не удалось удалить ключ доступа. Повторите попытку.',
  authPasswordChanged: 'Пароль изменён',

  // --- patient ---
  authEmailAlreadyRegistered: 'Аккаунт с этой почтой уже существует.',
  patientDiaryDataPurged: 'Данные дневников удалены',
  authEmailCodeSentIfExists: 'Если аккаунт с этой почтой существует, мы отправили код.',
  // C4 (copy audit): collapsed the documented intentional near-dup `patientRemindersMuteToggleDone`
  // ('Готово.') into this key now that both sides are being touched anyway — see file header.
  // C5: no trailing period, matching the majority convention for short single-clause toasts.
  commonDone: 'Готово',
  authCodeExpired: 'Код истёк. Запросите новый.',
  authCodeAlreadyUsed: 'Код уже использован. Начните вход снова.',
  authCodeAlreadySentCheckEmail: 'Код уже отправлен. Проверьте почту.',
  messagingBotCommandCopied: 'Команда скопирована — вставьте её в чат с ботом в Max',
  settingsSaved: 'Настройка сохранена',
  commonNoServerConnection: 'Нет соединения с сервером. Проверьте сеть.',
  authPasskeyUseFailed: 'Не удалось использовать ключ доступа. Повторите попытку.',
  patientReminderPauseUpdateFailed: 'Не удалось изменить паузу уведомлений. Повторите попытку.',
  messagingDetectAppFailed: 'Не удалось определить мессенджер. Повторите попытку.',
  commonEmailSendFailed: 'Не удалось отправить письмо. Повторите попытку.',
  // C5 (copy audit): «Попробуйте» → «Повторите попытку», majority phrasing.
  commonRequestSendFailed: 'Не удалось отправить запрос. Повторите попытку.',
  messagingPhoneVerifyFailed: 'Не удалось подтвердить номер в мессенджере. Повторите попытку.',
  messagingPhoneCheckFailed: 'Не удалось проверить номер. Повторите попытку.',
  // C2/C4 (copy audit): `commonSaveFailedRetryLaterAlt` was a near-duplicate (comma splice instead
  // of a period) — retired, both call sites now use this key. C5: «Попробуйте» → «Повторите
  // попытку» to match the majority phrasing used across the dictionary.
  commonSaveFailedRetryLater: 'Не удалось сохранить. Повторите попытку позже.',
  paymentSucceeded: 'Оплата прошла',
  commonGenericError: 'Что-то пошло не так. Повторите попытку.',
  messagingOpenBotChat: 'Откройте чат с ботом и отправьте контакт по кнопке.',
  authEmailCodeSent: 'Отправили код на почту.',
  authSignupPasswordTooShort: 'Пароль — не менее 8 символов.',
  authResendCooldown: 'Подождите минуту перед повторной отправкой.',
  // C2 (copy audit): было грамматически некорректно («в моменте» + «только что» вместе).
  patientDiaryDuplicateEntry: 'Похожая запись уже была сохранена только что.',
  doctorSignupUnavailable: 'Регистрация кабинета специалиста пока недоступна.',
  // C3/C4 (copy audit): dead-end text with no next action; collapsed the documented intentional
  // near-dup `patientRemindersMuteToggleNetworkUnavailable` into this key (see file header) now
  // that both sides are being reworded anyway.
  commonNetworkUnavailable: 'Проверьте подключение и повторите попытку.',
  patientPwaOpenFromHomeScreenFirst: 'Сначала откройте приложение с иконки на главном экране',
  patientRatingThanks: 'Спасибо за оценку!',
  paymentRequired: 'Требуется оплата',
  exerciseSpecifyDateTime: 'Укажите дату и время',
  commonSpecifyEmail: 'Укажите email',
  authSpecifyEmailNameSurname: 'Укажите email, фамилию и имя',
  commonSpecifyNameSurname: 'Укажите фамилию и имя',
  commonPushNotSupported: 'Уведомления не поддерживаются',
  authPasskeyLoginDisabled: 'Вход по ключу доступа отключён',
  authPasswordRecoveryUnavailable: 'Восстановление пароля по email временно недоступно.',
  authLoginRequiredToSaveProgress: 'Войдите, чтобы сохранить выполнение.',
  authBindingExpired: 'Время привязки истекло. Начните снова.',
  authEnterEmail: 'Введите email',
  authEnterEmailAndPassword: 'Введите email и пароль',
  authEnterCode: 'Введите код',
  authEnterCodeAndNewPassword: 'Введите код и новый пароль (не менее 8 символов)',
  messagingEnterText: 'Введите текст сообщения',
  exerciseSelectIntensity: 'Выберите интенсивность',
  patientSelectSymptomAndValue: 'Выберите симптом и значение',
  exerciseSessionMarked: 'Занятие отмечено',
  exercisePracticeRecorded: 'Записано.',
  patientEntryAdded: 'Запись добавлена',
  bookingAppointmentCancelled: 'Запись отменена',
  bookingAppointmentRescheduled: 'Запись перенесена',
  patientDiaryEntrySaved: 'Запись сохранена',
  patientDiaryEntryDeleted: 'Запись удалена',
  commonFillAllFields: 'Заполните все поля',

  // --- doctor ---
  doctorSubscriptionCreated: 'Абонемент создан',
  treatmentProgramNoGroupRestrictedElements: 'Без группы допустимы только рекомендации и клинические тесты',
  doctorDraftSaved: 'Черновик сохранён',
  doctorFileDeletedListStale: 'Файл удалён из чата, но список не обновился. Откройте обсуждение заново.',
  doctorFileDeletedStorageFreed: 'Файл удалён. Место в хранилище освобождено.',
  doctorChangesSaved: 'Изменения сохранены',
  treatmentProgramClinicalTestsNotAllowedOnGeneralStage: 'Клинические тесты нельзя добавлять на этап «Общие рекомендации»',
  doctorCommentNotSaved: 'Комментарий не сохранён.',
  treatmentProgramTestSetsNotAllowedOnGeneralStage: 'Наборы тестов нельзя добавлять на этап «Общие рекомендации»',
  treatmentProgramLfkComplexNotAllowedOnGeneralStage: 'На этапе «Общие рекомендации» нельзя разворачивать комплекс ЛФК',
  treatmentProgramGroupNameEmpty: 'Название группы не может быть пустым',
  treatmentProgramRecommendationsGroupNotFound: 'Не найдена системная группа «Рекомендации» для этапа. Обновите страницу и повторите попытку.',
  treatmentProgramTestingGroupNotFound: 'Не найдена системная группа «Тестирование» для этапа. Обновите страницу и повторите попытку.',
  // C5 (copy audit): «Попробуйте» → «Повторите попытку», majority phrasing.
  doctorArchiveFailed: 'Не удалось архивировать. Повторите попытку или обратитесь к администратору.',
  doctorContentAccessUpdateFailed: 'Не удалось изменить доступ к материалу. Повторите попытку.',
  doctorSectionAccessUpdateFailed: 'Не удалось изменить доступ к разделу. Повторите попытку.',
  doctorGroupUpdateFailed: 'Не удалось изменить группу. Повторите попытку.',
  doctorSymptomSettingsUpdateFailed: 'Не удалось изменить настройки симптома. Повторите попытку.',
  doctorOrderUpdateFailed: 'Не удалось изменить порядок элементов. Повторите попытку.',
  treatmentProgramStageOrderUpdateFailed: 'Не удалось изменить порядок этапов. Повторите попытку.',
  doctorContentOrderUpdateFailed: 'Не удалось изменить порядок материалов. Повторите попытку.',
  doctorSectionOrderUpdateFailed: 'Не удалось изменить порядок разделов. Повторите попытку.',
  doctorSectionVisibilityUpdateFailed: 'Не удалось изменить видимость раздела. Повторите попытку.',
  doctorSubscriptionUpdateFailed: 'Не удалось обновить абонемент. Повторите попытку.',
  doctorDataUpdateFailed: 'Не удалось обновить данные. Повторите попытку.',
  doctorInviteRevokeFailed: 'Не удалось отозвать приглашение. Повторите попытку.',
  doctorSubscriptionRecalcFailed: 'Не удалось пересчитать абонемент. Повторите попытку.',
  doctorActionApplyFailed: 'Не удалось применить действие. Повторите попытку.',
  doctorPhoneCopyFailed: 'Не удалось скопировать телефон. Повторите попытку.',
  treatmentProgramElementGroupChangeFailed: 'Не удалось сменить группу элемента. Повторите попытку.',
  doctorUnarchiveFailed: 'Не удалось снять архив. Повторите попытку.',
  // C3/C4 (copy audit): dead-end (no next action); also collapsed the documented intentional
  // near-dup `settingsPatientHomeSaveFailed` into this key (see file header) now that both sides
  // are being reworded anyway.
  commonSaveFailed: 'Не удалось сохранить. Повторите попытку.',
  doctorInviteCreateFailed: 'Не удалось создать приглашение. Повторите попытку.',
  commonDeleteFailed: 'Не удалось удалить. Повторите попытку.',
  treatmentProgramStageDeleteFailed: 'Не удалось удалить этап. Повторите попытку.',
  treatmentProgramGroupDeleteFailed: 'Не удалось удалить группу. Повторите попытку.',
  doctorMergeCompleted: 'Объединение выполнено.',
  doctorDesignSaved: 'Оформление сохранено',
  // C3 (copy audit): dead-end; named explicitly alongside commonNetworkUnavailable in the brief.
  commonNetworkError: 'Проверьте подключение и повторите попытку.',
  // C3 (copy audit): 'Ошибка X' -> 'Не удалось X'; dead-end, added retry action.
  doctorSubscriptionRecalcNetworkError: 'Не удалось пересчитать из-за сети. Проверьте подключение и повторите попытку.',
  commonCancelled: 'Отменено',
  doctorReplySentListStale: 'Ответ отправлен, но список не обновился. Откройте обсуждение заново.',
  doctorArchivePublishParamsInvalid: 'Параметры «Архив» или «Публикация» в адресе недопустимы — применены значения по умолчанию.',
  doctorMergeUuidMismatch: 'Первые 4 символа не совпали с идентификатором дубликата — объединение отменено.',
  // G3 (safety audit): was a template literal baking in the raw HTTP status.
  doctorMergeResponseInvalid: 'Не удалось разобрать ответ сервера. Повторите попытку.',
  doctorMergeFailed: 'Не удалось объединить аккаунты. Повторите попытку.',
  paymentRecorded: 'Платёж записан',
  doctorInviteRevoked: 'Приглашение отозвано.',
  treatmentProgramAssigned: 'Программа лечения назначена',
  commonReset: 'Сброшено',
  // C4/C5 (copy audit): near-duplicate of `commonNetworkUnavailable` found while normalising
  // «Попробуйте» → «Повторите попытку» — collapsed, both call sites now use that key.
  doctorTemplatePublished: 'Шаблон опубликован',
  doctorTemplateSaved: 'Шаблон сохранён',
  treatmentProgramSystemGroupDeleteForbidden: 'Системную группу нельзя удалить',
  commonCreated: 'Создано',
  doctorSubscriptionDurationInvalid: 'Срок действия должен быть целым числом ≥ 1',
  doctorPhoneCopied: 'Телефон скопирован',
  commonDeleted: 'Удалено',
  doctorTemplateNameRequired: 'Укажите название шаблона',
  treatmentProgramSelectGroupFromList: 'Выберите группу из списка',
  doctorConditionMovedToHistory: 'Заболевание перенесено в историю',
  doctorConditionRestored: 'Заболевание возвращено',
  doctorEntryCreatedCommentNotSaved: 'Запись создана, комментарий не сохранён.',
  doctorFillNamePriceAndItem: 'Заполните название, цену и добавьте хотя бы одну позицию',
  // G3 (safety audit, extended repo-wide sweep): were ad hoc literals inline in server-action
  // result objects (`lifecycleActions.ts`, `contentPageAuthActions.ts`, `reorderContentPages.ts`,
  // `reorderContentSections.ts`, `sectionVisibilityActions.ts`) — the client toast read them
  // through an untyped `.error` field, the exact shape the gate now flags.
  commonMissingIdentifier: 'Не указан идентификатор.',
  doctorContentLifecycleMissingData: 'Некорректные данные запроса.',
  doctorContentLifecycleUnknownAction: 'Неизвестное действие.',
  doctorContentSectionMissing: 'Не указан раздел.',
  commonEmptyOrder: 'Пустой порядок.',
  doctorContentPagesInvalidIds: 'Некорректные идентификаторы страниц.',
  doctorContentSectionsInvalidSlugs: 'Некорректные идентификаторы разделов.',
  commonOrderSaveFailed: 'Не удалось сохранить порядок. Повторите попытку.',

  // --- admin ---
  adminProbeSettingsSaved: 'Настройки проб сохранены.',
  adminSettingSaveFailed: 'Не удалось сохранить настройку. Повторите попытку.',
  adminTelegramModeSaveFailed: 'Не удалось сохранить режим Telegram. Повторите попытку.',
  adminIntegrationToggleSaveFailed: 'Не удалось сохранить рубильник интеграции. Повторите попытку.',
  adminLocationColorsSaveFailed: 'Не удалось сохранить цвета локаций. Повторите попытку.',
  adminGlobalIntegrationTogglesLoadFailed: 'Не удалось загрузить глобальные рубильники интеграций. Повторите попытку.',
  adminLoginSettingsLoadFailed: 'Не удалось загрузить настройки способов входа. Повторите попытку.',
  adminLocationColorsLoadFailed: 'Не удалось загрузить цвета локаций. Повторите попытку.',
  adminTelegramCredentialsLoadFailed: 'Не удалось загрузить учётные данные Telegram. Повторите попытку.',
  adminImapSettingsSaved: 'Параметры служебного IMAP-ящика сохранены.',
  adminResetToCodeDefaults: 'Сброшено: снова действуют значения по умолчанию из кода.',
  commonSaved: 'Сохранено',
  adminLocationColorsSaved: 'Цвета локаций сохранены',
  adminSelectActionAfterPaidPeriod: 'Выберите действие после оплаченного периода',
  adminSelectActionAfterTrial: 'Выберите действие после триала',

  // --- settings ---
  settingsCodeCopied: 'Код скопирован в буфер обмена',
  settingsSecuritySaved: 'Настройка безопасности сохранена',
  settingsBotSaved: 'Настройки бота сохранены',
  settingsConfirmSavedFailed: 'Не удалось подтвердить сохранённые настройки. Повторите попытку.',
  settingsCodeCopyFailed: 'Не удалось скопировать код. Повторите попытку.',
  settingsPartialSaveFailed: 'Не удалось сохранить часть настроек. Повторите попытку.',
  // C1 (copy audit): "credential" was an untranslated internal term.
  settingsCredentialSaveFailed: 'Не удалось сохранить учётные данные. Повторите попытку.',
  settingsReceiptEmailSaveFailed: 'Не удалось сохранить email для чека. Повторите попытку.',
  settingsSaveFailed: 'Не удалось сохранить настройки. Повторите попытку.',
  settingsReminderSettingsSaveFailed: 'Не удалось сохранить настройки напоминаний. Повторите попытку.',
  settingsSecuritySaveFailed: 'Не удалось сохранить настройку безопасности. Повторите попытку.',
  settingsSaveFailedRetry: 'Не удалось сохранить настройку. Повторите попытку.',
  settingsSpecialistCardsSaveFailed: 'Не удалось сохранить настройку визиток специалистов. Повторите попытку.',
  settingsSaveFailedValidationHint: 'Не удалось сохранить. Проверьте: код темы (латиница, цифры, _), длину подписи, уникальность кодов; при заполненной проекции рассылок код должен существовать в справочнике тем.',
  settingsPageSaveFailedRetry: 'Не удалось сохранить страницу. Повторите попытку.',
  settingsCancellationApplied: 'Отмена применена',
  settingsRescheduleApplied: 'Перенос применён',
  settingsSubscriptionRestored: 'Подписка восстановлена',
  settingsCheckReceiptEmail: 'Проверьте email для чека.',
  settingsPushDisabled: 'Push отключён',
  settingsPushEnabled: 'Push включён',
  settingsSmtpFullConfigRequired: 'Сначала сохраните полный SMTP в БД',
  settingsSavedConfigAppliesAfterRestart: 'Сохранено. Новая конфигурация применяется после перезапуска процессов.',
  settingsTestEmailSent: 'Тестовое письмо отправлено',
  settingsInvalidRecipientEmail: 'Укажите корректный email получателя',
  settingsSmtpPasswordMissing: 'В настройках нет пароля SMTP',

  // --- domain/booking-engine ---
  bookingUnknownStatus: 'Неизвестный статус записи',
  // Публичная запись: отказ инфраструктуры (не прошёл reverse proxy) — читателю здесь нечего
  // делать с деталью про заголовок X-Real-IP, и знать её он не должен (re-audit NEW-4).
  bookingServiceTemporarilyUnavailable:
    'Запись временно недоступна. Повторите попытку позже.',
  bookingSpecifyBranch: 'Укажите филиал',
  bookingEndTimeMustBeAfterStart: 'Время окончания должно быть позже начала',
  bookingAppointmentNotFound: 'Запись не найдена. Обновите страницу и повторите попытку.',

  // --- domain/comments ---
  commentNotFound: 'Комментарий не найден. Обновите страницу и повторите попытку.',
  // G2 (safety audit): was two keys, 'Неизвестный comment_type' / 'Неизвестный target_type
  // комментария' — both named a live database column to the end user. Collapsed to one neutral
  // key; the discriminating detail (which check failed) belongs in the server log only.
  commentInvalidType: 'Не удалось сохранить комментарий. Обновите страницу и повторите попытку.',
  commonInvalidUuid: 'Некорректный UUID',
  commentTextEmpty: 'Текст комментария не может быть пустым',
  commentTextRequired: 'Текст комментария обязателен',

  // --- domain/courses ---
  courseEnrollOnlyPublished: 'Доступна только запись на опубликованный курс',
  courseNotFound: 'Курс не найден. Обновите страницу и повторите попытку.',
  courseNameRequired: 'Название курса обязательно',
  courseIntroLessonMustBePublishedNotArchived: 'Страница вступительного урока должна быть опубликована и не в архиве',
  // C1 (copy audit): kept the established product label «Только для залогиненных» (used verbatim
  // on the actual toggle in `ContentPagesSectionList.tsx`/`ContentSectionsListClient.tsx`), just
  // put it in active voice with a concrete next action instead of passive "должна быть отмечена".
  courseIntroLessonMustBeLoggedInOnly:
    'Отметьте страницу как «Только для залогиненных», чтобы использовать её как вступительный урок.',
  courseIntroLessonNotFound: 'Страница вступительного урока не найдена. Обновите страницу и повторите попытку.',
  courseIntroLessonMustBeFromLessonsSection: 'Вступительным уроком может быть только страница из раздела «Уроки»',
  courseEnrollmentClosed: 'Запись на курс закрыта',

  // --- domain/lfk-assignments ---
  exerciseAssignmentInvalidIdentifiers: 'Некорректные идентификаторы',

  // --- domain/lfk-exercises ---
  exerciseNameRequired: 'Название упражнения обязательно',
  exerciseNotFound: 'Упражнение не найдено. Обновите страницу и повторите попытку.',
  exerciseArchivedRestoreToEdit: 'Упражнение в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/lfk-templates ---
  exerciseTemplateAddAtLeastOne: 'Добавьте хотя бы одно упражнение',
  exerciseComplexArchivedRestoreToEdit: 'Комплекс в архиве. Верните из архива, чтобы редактировать.',
  exerciseTemplateNameRequired: 'Название шаблона обязательно',
  exerciseTemplatePublishedCannotRemoveAll: 'Нельзя удалить все упражнения из опубликованного шаблона',
  exerciseTemplateNameNeeded: 'Нужно название шаблона',
  exerciseTemplatePublishDraftOnly: 'Опубликовать можно только черновик',
  exerciseTemplateNotFound: 'Шаблон не найден. Обновите страницу и повторите попытку.',

  // --- domain/messaging ---
  messagingNotSent: 'Сообщение не отправлено. Повторите попытку.',

  // --- domain/recommendations ---
  recommendationNameRequired: 'Название рекомендации обязательно',
  recommendationNotFound: 'Рекомендация не найдена. Обновите страницу и повторите попытку.',
  recommendationArchivedRestoreToEdit: 'Рекомендация в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/tests ---
  testSetNotFound: 'Набор не найден. Обновите страницу и повторите попытку.',
  testSetArchivedRestoreToChangeComposition: 'Набор в архиве. Верните из архива, чтобы менять состав.',
  testSetArchivedRestoreToEdit: 'Набор в архиве. Верните из архива, чтобы редактировать.',
  testSetNameRequired: 'Название набора обязательно',
  testNameRequired: 'Название теста обязательно',
  testUnknownMeasurementKind: 'Неизвестный идентификатор вида измерения',
  // C1 (copy audit): "scoring" was an untranslated internal schema field name.
  testInvalidScoringStructure: 'Некорректные правила подсчёта баллов теста',
  testInvalidPublicationStatus: 'Некорректный статус публикации',
  testInvalidScoreKind: 'Некорректный вид оценки',
  testDuplicateInSet: 'Один и тот же тест не может входить в набор дважды',
  testMeasurementLabelRequired: 'Подпись вида измерения не может быть пустой',
  testLabelTooLong: 'Слишком длинная подпись',
  commonListStaleReloadPage: 'Список устарел: обновите страницу и попробуйте снова',
  testNotFound: 'Тест не найден. Обновите страницу и повторите попытку.',
  testArchivedRestoreToEdit: 'Тест в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/treatment-program ---
  treatmentProgramNoGroupAddRestriction: 'Без группы можно добавить только рекомендацию или клинический тест',
  treatmentProgramNoGroupKeepRestriction: 'Без группы можно оставить только рекомендацию или клинический тест',
  // C4 (copy audit): `treatmentProgramUseTestResultSubmission` was a near-duplicate of this key
  // (same meaning, different verb) at a different call site — collapsed into one; both sites now
  // point here. Likewise `treatmentProgramUseComplexExpandFromLfk` below only differed from
  // `treatmentProgramUseComplexExpand` by appending the internal identifier `(from-lfk-complex)` —
  // collapsed into one key too.
  treatmentProgramUseTestResultRecording: 'Для клинического теста используйте запись результатов',
  treatmentProgramUseComplexExpand: 'Для комплекса ЛФК используйте разворот комплекса',
  treatmentProgramStageSkipReasonRequired: 'Для пропуска этапа укажите причину',
  treatmentProgramStageElementNotFound: 'Элемент этапа не найден. Обновите страницу и повторите попытку.',
  treatmentProgramElementNotAvailableForChecklist: 'Элемент недоступен для чек-листа',
  treatmentProgramElementNotFound: 'Элемент не найден. Обновите страницу и повторите попытку.',
  treatmentProgramElementNotClinicalTest: 'Элемент не является клиническим тестом',
  treatmentProgramElementDisabled: 'Элемент отключён',
  treatmentProgramElementNotFoundInProgram: 'Элемент программы не найден. Обновите страницу и повторите попытку.',
  treatmentProgramStageNotAvailable: 'Этап недоступен',
  treatmentProgramStageNotFound: 'Этап не найден. Обновите страницу и повторите попытку.',
  treatmentProgramGeneralStageMustStayFirst: 'Этап «Общие рекомендации» должен оставаться первым',
  treatmentProgramStageGroupNotFound: 'Группа этапа не найдена. Обновите страницу и повторите попытку.',
  treatmentProgramGroupNotFound: 'Группа не найдена. Обновите страницу и повторите попытку.',
  treatmentProgramGroupNotFoundOrWrongStage: 'Группа не найдена или не принадлежит этапу. Обновите страницу и повторите попытку.',
  treatmentProgramCommentsUnavailableForCourseProgram: 'Комментарии недоступны для программы курса',
  treatmentProgramCommentsUnavailableForPromoProgram: 'Комментарии недоступны для промо-программы',
  treatmentProgramLfkComplexNotFoundOrArchived: 'Комплекс ЛФК не найден или в архиве. Обновите страницу и повторите попытку.',
  treatmentProgramGeneralStageRecommendationsOnly: 'На этапе «Общие рекомендации» разрешены только рекомендации',
  treatmentProgramGeneralStageNoGroupBinding: 'На этапе «Общие рекомендации» элементы не привязываются к группам',
  treatmentProgramLoadChangeExerciseOnly: 'Нагрузку можно менять только для упражнений',
  treatmentProgramAssignPublishedOnly: 'Назначать можно только опубликованный шаблон',
  treatmentProgramStageNameEmpty: 'Название этапа не может быть пустым',
  treatmentProgramStageNameRequired: 'Название этапа обязательно',
  treatmentProgramGroupNameRequired: 'Название группы обязательно',
  treatmentProgramExerciseNameEditPersonalOnly: 'Название можно менять только у личного упражнения',
  treatmentProgramNameEmpty: 'Название не может быть пустым',
  treatmentProgramUnknownElementType: 'Неизвестный тип элемента программы',
  commonInvalidTimezone: 'Некорректная временная зона',
  treatmentProgramInvalidStageElementOrder: 'Некорректный порядок элементов этапа',
  treatmentProgramInvalidStageOrder: 'Некорректный порядок этапов',
  treatmentProgramInvalidStageGroupOrder: 'Некорректный порядок групп этапа',
  treatmentProgramSystemGroupNameLocked: 'Нельзя менять название системной группы',
  treatmentProgramSystemGroupOrderLocked: 'Нельзя менять порядок системной группы',
  treatmentProgramElementDeleteReplaceLocked: 'Нельзя удалить или заменить элемент с отметкой выполнения или историей теста',
  treatmentProgramPromoOrgUndefined: 'Не определена организация промо-программы',
  treatmentProgramElementAddFailed: 'Не удалось добавить элемент. Повторите попытку.',
  treatmentProgramStageAddFailed: 'Не удалось добавить этап. Повторите попытку.',
  treatmentProgramGroupAddFailed: 'Не удалось добавить группу. Повторите попытку.',
  treatmentProgramRecommendationAddFailed: 'Не удалось добавить рекомендацию. Повторите попытку.',
  treatmentProgramPersonalExerciseCreateFailed: 'Не удалось создать личное упражнение. Повторите попытку.',
  treatmentProgramElementReplaceFailed: 'Не удалось заменить элемент. Повторите попытку.',
  treatmentProgramExpectedDaysInvalid: 'Ожидаемый срок в днях должен быть неотрицательным целым числом',
  treatmentProgramRecurringRecommendationNotCompletable: 'Постоянная рекомендация не отмечается выполненной',
  treatmentProgramNotFound: 'Программа не найдена. Обновите страницу и повторите попытку.',
  treatmentProgramPromoNotConfigured: 'Промо-программа не настроена',
  treatmentProgramEmptyLoadSettingsRequest: 'Пустой запрос настроек нагрузки',
  treatmentProgramExecutionModeRecommendationsOnly: 'Режим выполнения задаётся только для рекомендаций',
  treatmentProgramResultNotFound: 'Результат не найден. Обновите страницу и повторите попытку.',
  treatmentProgramTemplateNotFound: 'Шаблон программы не найден. Обновите страницу и повторите попытку.',
  treatmentProgramStageSystemGroupNotFound: 'Системная группа этапа не найдена. Обновите страницу и повторите попытку.',
  treatmentProgramTestingSystemGroupNotFound: 'Системная группа «Тестирование» не найдена. Обновите страницу и повторите попытку.',
  treatmentProgramSystemGroupHideForbidden: 'Системную группу нельзя скрыть',
  testStartNewAttemptFirst: 'Сначала начните новую попытку',
  testStartAttemptFirst: 'Сначала начните попытку',
  treatmentProgramFreeTextGeneralStageOnly: 'Свободный текст можно добавить только на этап «Общие рекомендации»',
  treatmentProgramTestMismatchItem: 'Тест не соответствует пункту программы',
  // C1 (copy audit): leaked the internal enum values (`passed`/`failed`/`partial`) and the
  // English field name `score` verbatim into doctor-facing text.
  testSpecifyOutcome:
    'Укажите результат теста («сдано», «не сдано» или «частично») или числовое значение, если заданы пороги.',
  treatmentProgramLoadWeightOutOfRange: 'Вес: число от 0 до 500',
  treatmentProgramRecommendationsGroupOnlyRecommendations: 'В группу «Рекомендации» можно помещать только рекомендации',
  treatmentProgramTestingGroupOnlyClinicalTests: 'В группу «Тестирование» можно помещать только клинические тесты',
  exerciseComplexEmpty: 'В комплексе нет упражнений',
  treatmentProgramEnterObservationText: 'Введите текст наблюдения',
  treatmentProgramSelectGroupForElementType: 'Выберите группу для этого типа элемента',

  // --- other ---
  commonLinkCopyFailed: 'Не удалось скопировать ссылку. Повторите попытку.',
  commonLinkCopied: 'Ссылка скопирована',

  // --- fallback texts found by the strengthened coverage gate (DEFECT 2b, 2026-09-13 verification
  // pass) — literal reachable through a ternary branch alongside another branch (dynamic or a
  // second literal), which the original gate's argument-only check could not see. ---
  adminOperationFailed: 'Операция не выполнена',
  // C1 (copy audit): this was a dead-end imperative with no next action ("Проверьте лестницу
  // доступа" — check what, how?) and, since `accessPolicyFromDraft`'s validation errors are now
  // `UserFacingError`s with their own specific text (see `CommercialConstructorClient.tsx`), this
  // key only surfaces for a genuinely unexpected error — so it now says so plainly.
  adminCheckAccessLadder: 'Не удалось проверить лестницу доступа. Повторите попытку.',
  // C1 (copy audit): `accessPolicyFromDraft` (`CommercialConstructorClient.tsx`) validation text —
  // was a plain `Error`, invisible to `safeUserMessage`; now `UserFacingError` referencing this key.
  adminAccessLadderFieldsRequired: 'Заполните все поля лестницы доступа.',
  adminAccessLadderNotificationOffsetRequired: 'В каждом уведомлении заполните срок.',
  doctorMergeAccessDenied: 'Доступ запрещён: нужна роль «Администратор» и включённый режим администратора.',
  doctorInviteLinkStillActive: 'Ссылка приглашения ещё действует',
  doctorInviteLinkCreated: 'Ссылка приглашения создана',
  doctorSymptomClosed: 'Симптом закрыт',
  doctorClinicalValueAdded: 'Значение добавлено',
  doctorDiagnosisClosed: 'Диагноз закрыт',
  doctorDiagnosisStatusChanged: 'Статус изменён',
  doctorSymptomAdded: 'Симптом добавлен',
  doctorDiagnosisAdded: 'Диагноз добавлен',
  doctorSubscriptionPackageUpdated: 'Абонемент изменён',
  doctorSubscriptionPackageAdded: 'Абонемент добавлен',
  doctorSubscriptionPackageUpdateFailed: 'Не удалось изменить абонемент. Повторите попытку.',
  doctorSubscriptionPackageAddFailed: 'Не удалось добавить абонемент. Повторите попытку.',
  doctorSubscriptionPackageArchived: 'Абонемент отправлен в архив',
  doctorSubscriptionPackageRestored: 'Абонемент восстановлен',
  doctorTemplateSaveFailed: 'Не удалось сохранить шаблон. Повторите попытку.',
  doctorTemplatePreviewFailed: 'Не удалось построить предпросмотр. Повторите попытку.',
  doctorDesignSaveFailed: 'Не удалось сохранить оформление. Повторите попытку.',
  treatmentProgramNoActivePromoPrograms: 'Активных промо-программ нет',
  treatmentProgramPromoRefreshFailed: 'Не удалось обновить промо-программы. Повторите попытку.',
  messagingSelectChannel: 'Выберите мессенджер.',
  messagingNoBinding: 'Нет привязки к мессенджеру.',
  messagingContactRequestFailed: 'Не удалось запросить контакт. Повторите попытку.',
  bookingStaffConfirmationRequired: 'Нужно согласование',
  bookingCancelFailed: 'Не удалось отменить. Повторите попытку.',
  patientEntryUpdated: 'Запись обновлена',
  mediaVideoTooShort: 'Видео должно быть не короче 10 секунд',
  mediaUploadFailed: 'Не удалось загрузить файл. Повторите попытку.',
  adminDuplicateSettingsKeyInBatch: 'В запросе повторяется один и тот же ключ настроек',
  adminInvalidRequestBodyExtraFields: 'Некорректное тело запроса (лишние поля)',
  adminEmptySettingsList: 'Пустой список настроек',
  // G5 (safety audit): was `commonUnknownError: 'error'` — a bare English word that was the
  // ENTIRE error experience for manual appointment cancel/reschedule (the only two call sites),
  // because `safeUserMessage` never recognised `ApiRequestError`. Real text now, key renamed
  // since it is no longer a generic catch-all — see `BookingManualLifecycleSection.tsx`.
  bookingManualLifecycleActionFailed: 'Не удалось выполнить действие с записью. Повторите попытку.',
  settingsSmtpSaveFailedRetry: 'Сервер не смог сохранить SMTP. Повторите позже.',
  settingsInvalidDsn: 'Укажите корректный HTTP(S) DSN',
  settingsBotSaveFailed: 'Не удалось сохранить настройки бота. Повторите попытку.',
  authPasswordUpdatedPleaseLogin: 'Пароль обновлён. Войдите.',
  authAccessConfigured: 'Доступ настроен.',
  authReenterPasswordToContinueSetup: 'Войдите с паролем ещё раз, чтобы продолжить защищённую настройку.',
  // Тот же смысл плюс подтверждение почты: отдельный ключ, потому что текст показывается в
  // другой момент — сразу после подтверждения адреса, а не при повторном входе.
  authEmailVerifiedReenterPasswordToContinueSetup:
    'Почта подтверждена. Войдите с паролем ещё раз, чтобы продолжить защищённую настройку.',

  // --- fallback texts formerly inline as the second/third argument of `readSafeApiErrorText`/
  // `safeActionErrorText`/`mechanicWriteClearanceRefusalResponse` (DEFECT 3, 2026-09-13 second
  // verification pass) — the gate only inspected `toast.error/success`/`new UserFacingError`'s OWN
  // argument, so a literal one level deeper as a helper's fallback parameter was invisible to it.
  // C3 (copy audit, 2026-09-13 third pass): this whole block was dead-end text (bare state, no next
  // action) — every key below got ". Повторите попытку." appended, and the "Ошибка X" shapes were
  // converted to "Не удалось X" first. ---
  doctorLfkOverridesResetFailed: 'Не удалось сбросить настройки. Повторите попытку.',
  treatmentProgramAssignError: 'Не удалось назначить. Повторите попытку.',
  doctorProgramInstanceDiscussionsLoadFailed: 'Не удалось загрузить обсуждения. Повторите попытку.',
  doctorProgramItemDiscussionLoadFailed: 'Не удалось загрузить обсуждение. Повторите попытку.',
  doctorMeasureKindsReferenceUnavailable: 'Справочник видов измерений недоступен. Повторите попытку.',
  doctorMeasureKindCreateError: 'Не удалось создать вид измерения. Повторите попытку.',
  doctorCourseArchiveFailed: 'Не удалось отправить курс в архив. Повторите попытку.',
  doctorCourseCreateFailed: 'Не удалось создать курс. Повторите попытку.',
  doctorMeasureKindsConnectionError: 'Не удалось соединиться с сервером. Повторите попытку.',
  commonCreateFailed: 'Не удалось создать. Повторите попытку.',
  testSetCompositionParseError: 'Не удалось разобрать состав. Повторите попытку.',
  testSetDraftCreateFailed: 'Не удалось создать черновик набора. Повторите попытку.',
  testSetCompositionSaveError: 'Не удалось сохранить состав. Повторите попытку.',
  doctorExerciseRecommendationsSaveFailed: 'Не удалось сохранить рекомендации. Повторите попытку.',
  treatmentProgramTemplateLoadFailed: 'Не удалось загрузить шаблон. Повторите попытку.',
  treatmentProgramTitleDescriptionSaveFailed: 'Не удалось сохранить название и описание. Повторите попытку.',
  treatmentProgramTemplateArchiveFailed: 'Не удалось отправить шаблон в архив. Повторите попытку.',
  treatmentProgramTemplateStatusUpdateFailed: 'Не удалось обновить статус шаблона. Повторите попытку.',
  treatmentProgramGroupOrderUpdateFailed: 'Не удалось изменить порядок групп. Повторите попытку.',
  treatmentProgramGroupSaveFailed: 'Не удалось сохранить группу. Повторите попытку.',
  treatmentProgramTestsFromSetAddFailed: 'Не удалось добавить тесты из набора. Повторите попытку.',
  treatmentProgramExercisesFromComplexAddFailed: 'Не удалось добавить упражнения из комплекса. Повторите попытку.',
  patientCourseEnrollFailed: 'Не удалось записаться. Повторите попытку.',
  // C3 (copy audit): avoid repeating "попытку" (test attempt vs. retry action).
  testAttemptStartFailed: 'Не удалось начать прохождение теста. Повторите попытку.',
  patientProgramItemDiscussionLoadFailed: 'Не удалось загрузить комментарии. Повторите попытку.',
  patientProgramItemCommentSendFailed: 'Не удалось отправить комментарий. Повторите попытку.',
  patientProgramItemCompleteMarkFailed: 'Не удалось отметить выполнение. Повторите попытку.',
  patientProgramItemParamsSaveFailed: 'Не удалось сохранить параметры. Повторите попытку.',
  patientProgramStatisticsLoadFailed: 'Не удалось загрузить статистику. Повторите попытку.',
  commentUpdateError: 'Не удалось обновить. Повторите попытку.',
  commentDeleteError: 'Не удалось удалить. Повторите попытку.',
  // C1 (copy audit): the platform variant only ever fires when a platform-owned write got
  // misrouted through a per-clinic tariff check (a bug, not an explainable refusal — see the
  // route's catch block), so its text now names that plainly and the route appends the sanctioned
  // "Код для поддержки: <digest>" suffix itself. The doctor-cabinet variant is a real, expected
  // refusal (clinic tariff really doesn't include the feature), so it gets actionable next-step
  // text instead of engineer-speak ("тарифная механика").
  adminNotificationTemplatePlatformSaveClearanceDenied:
    'Не удалось сохранить платформенный шаблон: запрос ошибочно попал в проверку тарифа клиники.',
  doctorNotificationTemplateSaveClearanceDenied:
    'Сохранить шаблон нельзя: тариф клиники не даёт доступа к этой функции. Обратитесь к владельцу клиники или в поддержку.',
  // Defect 4 (2026-09-13 second verification pass): a raw `Error.message` from a failed settings
  // reset was interpolated straight into a toast — a DB driver message can carry table/column/bound
  // parameter values. Routed through `safeUserMessage` instead; these are its dictionary-backed
  // fallbacks (this one plus the two sibling save-failure toasts in the same file, found by the
  // same-shape sweep across the repo — see the report for the full list of sites fixed this way).
  adminOperatorHealthProbeResetFailed: 'Не удалось сбросить настройки проб. Повторите попытку.',
  adminProbeSettingsSaveFailed: 'Настройки проб не сохранены',
  adminImapSettingsSaveFailed: 'IMAP-настройки не сохранены',
  adminBillingProviderSettingsSaveFailed: 'Настройки не сохранены',
} as const;

export type NotificationTextKey = keyof typeof notificationText;

/**
 * Параметризованные тексты — тот же словарь, но текст зависит от значения, известного только в
 * момент вызова (id, число, метка). Ключ и группировка по смыслу — как у обычных записей выше;
 * вынесены в отдельный объект, потому что содержимое не `string`, а `(...) => string`.
 */
export const notificationTextFactory = {
  /**
   * `assertUuid` (`booking-engine/service.ts`) — C1 (copy audit): `label` here is always a raw
   * camelCase internal field name (`organizationId`, `specialistId`, `appointmentId`, …), so it is
   * accepted but deliberately NOT interpolated into the user-facing text anymore — same class of
   * leak G2 fixed for `comment_type`/`target_type`. Kept as a parameter only so a future caller can
   * still pass it for logging without a signature change; the message itself stays generic.
   */
  invalidUuid: (_label: string) => `Некорректный идентификатор.`,
  /**
   * `appointmentStatusFsm.ts` — C1 (copy audit): `from`/`to` are raw FSM status codes
   * (`cancelled_by_specialist`, `no_show`, …); showing them verbatim leaks internal enum values the
   * same way G2 flagged for DB column names, so the text no longer interpolates them.
   */
  invalidStatusTransition: (_from: string, _to: string) =>
    `Недопустимый переход между статусами записи.`,
  /** `instanceEditorBatchApply.ts` — некорректный порядковый номер элемента/этапа/группы. */
  invalidOrder: (label: string) => `Некорректный порядок: ${label}`,
  /** `instance-service.ts` / `instanceEditorBatchApply.ts` — общий шаблон валидации числа в диапазоне. */
  integerRangeRequired: (label: string, min: number, max: number) =>
    `${label}: целое число от ${min} до ${max}`,
  /** `instanceEditorBatchApply.ts` — черновой идентификатор не найден среди присланных элементов. */
  unknownDraftId: (label: string) => `${label}: неизвестный черновой идентификатор`,
  /** `modules/tests/service.ts` — тест из набора не найден по id. */
  testNotFoundById: (testId: string) => `Тест не найден: ${testId}`,
  /** `modules/tests/service.ts` — тест архивирован и не может входить в набор. */
  testArchivedCannotBeInSet: (title: string) => `Тест архивирован и не может входить в набор: ${title}`,
} as const;
