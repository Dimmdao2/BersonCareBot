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
 * Дубли по СТРОКЕ (не по смыслу) сюда не смешаны специально: например `commonSaveFailed` /
 * `settingsPatientHomeSaveFailed` (были `neUdalosSohranit` / `neUdalosSohranit2`) или
 * `commonNetworkUnavailable` / `patientRemindersMuteToggleNetworkUnavailable` (были `setNedostupna` /
 * `setNedostupna2`) отличаются пунктуацией видимого текста и являются НАХОДКОЙ (см. отчёт по этой
 * работе), но не объединены — объединение изменило бы видимый текст на части call-site'ов, а
 * перенос в этой работе задуман механическим (без изменения текстов). Имена этих пар нарочно
 * отражают, ГДЕ каждая используется, а не искусственный порядковый суффикс.
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
  authInvalidFactor: 'Код неверный. Проверьте код в приложении и введите новый.',
  authInvalidRecoveryCode: 'Резервный код неверный или уже использован. Введите другой резервный код.',
  authLoginChallengeExpired: 'Время подтверждения истекло. Войдите снова и запросите новый код.',
  authLoginFactorFallback: 'Не удалось подтвердить вход. Введите код ещё раз.',
  authOwnerRequired: 'Подключить рабочий кабинет может только владелец. Войдите под аккаунтом владельца.',
  authPasswordChangedSessionReissueFailed:
    'Пароль изменён, но сеанс завершён. Войдите снова с новым паролем.',
  authPasswordChangeFailed: 'Пароль не изменён из-за временной ошибки. Повторите попытку позже.',
  authPasswordLoginUnavailable:
    'Для аккаунта не настроен вход по паролю. Используйте другой способ входа.',
  authPasswordNotAvailableForRole:
    'Вход по паролю не доступен. Выполните вход по коду или выберите другой способ',
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
  authPasskeyEnrollStartFailed: 'Не удалось начать добавление ключа доступа',
  authPasskeyVerifyFailed: 'Не удалось подтвердить ключ доступа',
  authTooManyRequestsRetryLater: 'Слишком много запросов. Попробуйте позже.',
  messagingLinkFetchFailed: 'Не удалось получить ссылку',
  commonSendFailed: 'Не удалось отправить',
  exerciseSessionEntryAddFailed: 'Не удалось добавить запись',
  authCodeSendFailed: 'Не удалось отправить код',
  patientReminderUpdateFailed: 'Не удалось обновить',
  exerciseSessionMarkFailed: 'Не удалось отметить занятие',
  doctorWarmupScheduleSaveFailed: 'Не удалось сохранить расписание',
  doctorFinanceSaveError: 'Ошибка сохранения',
  settingsOperatorAlertsSaveFailed: 'Не удалось сохранить настройки операторских алертов.',
  settingsOperatorAlertsFallbackEmailSaveFailed: 'Не удалось сохранить резервный e-mail.',
  messagingCodeRequestFailed: 'Не удалось запросить код',
  messagingBindingStartFailed: 'Не удалось начать привязку',
  authTooManyAttemptsRetryLater: 'Слишком много попыток. Попробуйте позже.',
  authProviderUnavailable: 'Провайдер недоступен',
  authSignupStartFailed: 'Не удалось начать регистрацию',
  authEmailNotVerifiedRetryLogin: 'Email не подтверждён. Подтвердите адрес и повторите вход.',
  authAttemptsTooFrequent: 'Слишком частые попытки',
  authCodeInvalidOrExpired: 'Неверный или просроченный код',
  messagingMessageSent: 'Сообщение отправлено',

  // --- auth/account ---
  authOtherSessionsEnded: 'Другие сеансы завершены',
  authPasskeyAdded: 'Ключ доступа добавлен',
  authPasskeyRemoved: 'Ключ доступа удалён',
  authPasskeyAddFailed: 'Не удалось добавить ключ доступа',
  authPasskeyRemoveFailed: 'Не удалось удалить ключ доступа',
  authPasswordChanged: 'Пароль изменён',

  // --- patient ---
  authEmailAlreadyRegistered: 'Аккаунт с этой почтой уже существует.',
  patientDiaryDataPurged: 'Данные дневников удалены',
  authEmailCodeSentIfExists: 'Если аккаунт с этой почтой существует, мы отправили код.',
  commonDone: 'Готово',
  patientRemindersMuteToggleDone: 'Готово.',
  authCodeExpired: 'Код истёк. Запросите новый.',
  authCodeAlreadyUsed: 'Код уже использован. Начните вход снова.',
  authCodeAlreadySentCheckEmail: 'Код уже отправлен. Проверьте почту.',
  messagingBotCommandCopied: 'Команда скопирована — вставьте её в чат с ботом в Max',
  settingsSaved: 'Настройка сохранена',
  commonNoServerConnection: 'Нет соединения с сервером. Проверьте сеть.',
  authPasskeyUseFailed: 'Не удалось использовать ключ доступа',
  patientReminderPauseUpdateFailed: 'Не удалось изменить паузу уведомлений.',
  messagingDetectAppFailed: 'Не удалось определить мессенджер.',
  commonEmailSendFailed: 'Не удалось отправить письмо',
  commonRequestSendFailed: 'Не удалось отправить запрос. Попробуйте снова.',
  messagingPhoneVerifyFailed: 'Не удалось подтвердить номер в мессенджере',
  messagingPhoneCheckFailed: 'Не удалось проверить номер',
  commonSaveFailedRetryLater: 'Не удалось сохранить. Попробуйте позже.',
  commonSaveFailedRetryLaterAlt: 'Не удалось сохранить, попробуйте позже.',
  paymentSucceeded: 'Оплата прошла',
  commonGenericError: 'Ошибка',
  messagingOpenBotChat: 'Откройте чат с ботом и отправьте контакт по кнопке.',
  authEmailCodeSent: 'Отправили код на почту.',
  authSignupPasswordTooShort: 'Пароль — не менее 8 символов.',
  authResendCooldown: 'Подождите минуту перед повторной отправкой.',
  patientDiaryDuplicateEntry: 'Похожая запись в моменте уже сохранена только что',
  doctorSignupUnavailable: 'Регистрация кабинета специалиста пока недоступна.',
  commonNetworkUnavailable: 'Сеть недоступна',
  patientRemindersMuteToggleNetworkUnavailable: 'Сеть недоступна.',
  patientPwaOpenFromHomeScreenFirst: 'Сначала откройте приложение с иконки на главном экране',
  patientRatingThanks: 'Спасибо за оценку!',
  paymentRequired: 'Требуется оплата',
  exerciseSpecifyDateTime: 'Укажите дату и время',
  commonSpecifyEmail: 'Укажите email',
  authSpecifyEmailNameSurname: 'Укажите email, фамилию и имя',
  patientSpecifyNameSurname: 'Укажите фамилию и имя',
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
  treatmentProgramRecommendationsGroupNotFound: 'Не найдена системная группа «Рекомендации» для этапа',
  treatmentProgramTestingGroupNotFound: 'Не найдена системная группа «Тестирование» для этапа',
  doctorArchiveFailed: 'Не удалось архивировать. Попробуйте снова или обратитесь к администратору.',
  doctorContentAccessUpdateFailed: 'Не удалось изменить доступ к материалу',
  doctorSectionAccessUpdateFailed: 'Не удалось изменить доступ к разделу',
  doctorGroupUpdateFailed: 'Не удалось изменить группу',
  doctorSymptomSettingsUpdateFailed: 'Не удалось изменить настройки симптома',
  doctorOrderUpdateFailed: 'Не удалось изменить порядок элементов',
  treatmentProgramStageOrderUpdateFailed: 'Не удалось изменить порядок этапов',
  doctorContentOrderUpdateFailed: 'Не удалось изменить порядок материалов',
  doctorSectionOrderUpdateFailed: 'Не удалось изменить порядок разделов',
  doctorSectionVisibilityUpdateFailed: 'Не удалось изменить видимость раздела',
  doctorSubscriptionUpdateFailed: 'Не удалось обновить абонемент',
  doctorDataUpdateFailed: 'Не удалось обновить данные',
  doctorInviteRevokeFailed: 'Не удалось отозвать приглашение.',
  doctorSubscriptionRecalcFailed: 'Не удалось пересчитать абонемент',
  doctorActionApplyFailed: 'Не удалось применить действие',
  doctorPhoneCopyFailed: 'Не удалось скопировать телефон',
  treatmentProgramElementGroupChangeFailed: 'Не удалось сменить группу элемента',
  doctorUnarchiveFailed: 'Не удалось снять архив.',
  commonSaveFailed: 'Не удалось сохранить',
  doctorInviteCreateFailed: 'Не удалось создать приглашение',
  commonDeleteFailed: 'Не удалось удалить',
  treatmentProgramStageDeleteFailed: 'Не удалось удалить этап',
  treatmentProgramGroupDeleteFailed: 'Не удалось удалить группу',
  doctorMergeCompleted: 'Объединение выполнено.',
  doctorDesignSaved: 'Оформление сохранено',
  commonNetworkError: 'Ошибка сети',
  doctorSubscriptionRecalcNetworkError: 'Ошибка сети при пересчёте',
  commonCancelled: 'Отменено',
  doctorReplySentListStale: 'Ответ отправлен, но список не обновился. Откройте обсуждение заново.',
  doctorArchivePublishParamsInvalid: 'Параметры «Архив» или «Публикация» в адресе недопустимы — применены значения по умолчанию.',
  doctorMergeUuidMismatch: 'Первые 4 символа не совпали с UUID дубликата — merge отменён.',
  paymentRecorded: 'Платёж записан',
  doctorInviteRevoked: 'Приглашение отозвано.',
  treatmentProgramAssigned: 'Программа лечения назначена',
  commonReset: 'Сброшено',
  commonNetworkUnavailableRetry: 'Сеть недоступна. Попробуйте ещё раз.',
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

  // --- admin ---
  adminProbeSettingsSaved: 'Настройки проб сохранены.',
  adminSettingSaveFailed: 'Не удалось сохранить настройку',
  adminTelegramModeSaveFailed: 'Не удалось сохранить режим Telegram',
  adminIntegrationToggleSaveFailed: 'Не удалось сохранить рубильник интеграции',
  adminLocationColorsSaveFailed: 'Не удалось сохранить цвета локаций',
  adminGlobalIntegrationTogglesLoadFailed: 'Не удалось загрузить глобальные рубильники интеграций',
  adminLoginSettingsLoadFailed: 'Не удалось загрузить настройки способов входа',
  adminLocationColorsLoadFailed: 'Не удалось загрузить цвета локаций',
  adminTelegramCredentialsLoadFailed: 'Не удалось загрузить учётные данные Telegram',
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
  settingsConfirmSavedFailed: 'Не удалось подтвердить сохранённые настройки',
  settingsCodeCopyFailed: 'Не удалось скопировать код',
  settingsPatientHomeSaveFailed: 'Не удалось сохранить.',
  settingsPartialSaveFailed: 'Не удалось сохранить часть настроек',
  settingsCredentialSaveFailed: 'Не удалось сохранить credential',
  settingsReceiptEmailSaveFailed: 'Не удалось сохранить email для чека.',
  settingsSaveFailed: 'Не удалось сохранить настройки',
  settingsReminderSettingsSaveFailed: 'Не удалось сохранить настройки напоминаний',
  settingsSecuritySaveFailed: 'Не удалось сохранить настройку безопасности',
  settingsSaveFailedRetry: 'Не удалось сохранить настройку. Повторите попытку.',
  settingsSpecialistCardsSaveFailed: 'Не удалось сохранить настройку визиток специалистов. Повторите попытку.',
  settingsSaveFailedValidationHint: 'Не удалось сохранить. Проверьте: код темы (латиница, цифры, _), длину подписи, уникальность кодов; при заполненной проекции рассылок код должен существовать в справочнике тем.',
  settingsPageSaveFailedRetry: 'Не удалось сохранить страницу. Повторите попытку.',
  commonSaveError: 'Ошибка при сохранении',
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
  bookingSpecifyBranch: 'Укажите филиал',
  bookingEndTimeMustBeAfterStart: 'Время окончания должно быть позже начала',
  bookingAppointmentNotFound: 'Запись не найдена',

  // --- domain/comments ---
  commentNotFound: 'Комментарий не найден',
  commentUnknownType: 'Неизвестный comment_type',
  commentUnknownTargetType: 'Неизвестный target_type комментария',
  commonInvalidUuid: 'Некорректный UUID',
  commentTextEmpty: 'Текст комментария не может быть пустым',
  commentTextRequired: 'Текст комментария обязателен',

  // --- domain/courses ---
  courseEnrollOnlyPublished: 'Доступна только запись на опубликованный курс',
  courseNotFound: 'Курс не найден',
  courseNameRequired: 'Название курса обязательно',
  courseIntroLessonMustBePublishedNotArchived: 'Страница вступительного урока должна быть опубликована и не в архиве',
  courseIntroLessonMustBeLoggedInOnly: 'Страница вступительного урока должна быть отмечена «Только для залогиненных»',
  courseIntroLessonNotFound: 'Страница вступительного урока не найдена',
  courseIntroLessonMustBeFromLessonsSection: 'Вступительным уроком может быть только страница из раздела «Уроки»',
  courseEnrollmentClosed: 'Запись на курс закрыта',

  // --- domain/lfk-assignments ---
  exerciseAssignmentInvalidIdentifiers: 'Некорректные идентификаторы',

  // --- domain/lfk-exercises ---
  exerciseNameRequired: 'Название упражнения обязательно',
  exerciseNotFound: 'Упражнение не найдено',
  exerciseArchivedRestoreToEdit: 'Упражнение в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/lfk-templates ---
  exerciseTemplateAddAtLeastOne: 'Добавьте хотя бы одно упражнение',
  exerciseComplexArchivedRestoreToEdit: 'Комплекс в архиве. Верните из архива, чтобы редактировать.',
  exerciseTemplateNameRequired: 'Название шаблона обязательно',
  exerciseTemplatePublishedCannotRemoveAll: 'Нельзя удалить все упражнения из опубликованного шаблона',
  exerciseTemplateNameNeeded: 'Нужно название шаблона',
  exerciseTemplatePublishDraftOnly: 'Опубликовать можно только черновик',
  exerciseTemplateNotFound: 'Шаблон не найден',

  // --- domain/messaging ---
  messagingNotSent: 'Не отправлено',

  // --- domain/recommendations ---
  recommendationNameRequired: 'Название рекомендации обязательно',
  recommendationNotFound: 'Рекомендация не найдена',
  recommendationArchivedRestoreToEdit: 'Рекомендация в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/tests ---
  testSetNotFound: 'Набор не найден',
  testSetArchivedRestoreToChangeComposition: 'Набор в архиве. Верните из архива, чтобы менять состав.',
  testSetArchivedRestoreToEdit: 'Набор в архиве. Верните из архива, чтобы редактировать.',
  testSetNameRequired: 'Название набора обязательно',
  testNameRequired: 'Название теста обязательно',
  testUnknownMeasurementKind: 'Неизвестный идентификатор вида измерения',
  testInvalidScoringStructure: 'Некорректная структура scoring',
  testInvalidPublicationStatus: 'Некорректный статус публикации',
  testInvalidScoreKind: 'Некорректный вид оценки',
  testDuplicateInSet: 'Один и тот же тест не может входить в набор дважды',
  testMeasurementLabelRequired: 'Подпись вида измерения не может быть пустой',
  testLabelTooLong: 'Слишком длинная подпись',
  commonListStaleReloadPage: 'Список устарел: обновите страницу и попробуйте снова',
  testNotFound: 'Тест не найден',
  testArchivedRestoreToEdit: 'Тест в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/treatment-program ---
  treatmentProgramNoGroupAddRestriction: 'Без группы можно добавить только рекомендацию или клинический тест',
  treatmentProgramNoGroupKeepRestriction: 'Без группы можно оставить только рекомендацию или клинический тест',
  treatmentProgramUseTestResultRecording: 'Для клинического теста используйте запись результатов',
  treatmentProgramUseTestResultSubmission: 'Для клинического теста используйте отправку результатов',
  treatmentProgramUseComplexExpand: 'Для комплекса ЛФК используйте разворот комплекса',
  treatmentProgramUseComplexExpandFromLfk: 'Для комплекса ЛФК используйте разворот комплекса (from-lfk-complex)',
  treatmentProgramStageSkipReasonRequired: 'Для пропуска этапа укажите причину',
  treatmentProgramStageElementNotFound: 'Элемент этапа не найден',
  treatmentProgramElementNotAvailableForChecklist: 'Элемент недоступен для чек-листа',
  treatmentProgramElementNotFound: 'Элемент не найден',
  treatmentProgramElementNotClinicalTest: 'Элемент не является клиническим тестом',
  treatmentProgramElementDisabled: 'Элемент отключён',
  treatmentProgramElementNotFoundInProgram: 'Элемент программы не найден',
  treatmentProgramStageNotAvailable: 'Этап недоступен',
  treatmentProgramStageUnknownDraftId: 'Этап: неизвестный черновой идентификатор',
  treatmentProgramStageNotFound: 'Этап не найден',
  treatmentProgramGeneralStageMustStayFirst: 'Этап «Общие рекомендации» должен оставаться первым',
  treatmentProgramStageGroupNotFound: 'Группа этапа не найдена',
  treatmentProgramGroupNotFound: 'Группа не найдена',
  treatmentProgramGroupNotFoundOrWrongStage: 'Группа не найдена или не принадлежит этапу',
  treatmentProgramCommentsUnavailableForCourseProgram: 'Комментарии недоступны для программы курса',
  treatmentProgramCommentsUnavailableForPromoProgram: 'Комментарии недоступны для промо-программы',
  treatmentProgramLfkComplexNotFoundOrArchived: 'Комплекс ЛФК не найден или в архиве',
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
  treatmentProgramElementAddFailed: 'Не удалось добавить элемент',
  treatmentProgramStageAddFailed: 'Не удалось добавить этап',
  treatmentProgramGroupAddFailed: 'Не удалось добавить группу',
  treatmentProgramRecommendationAddFailed: 'Не удалось добавить рекомендацию',
  treatmentProgramPersonalExerciseCreateFailed: 'Не удалось создать личное упражнение',
  treatmentProgramElementReplaceFailed: 'Не удалось заменить элемент',
  treatmentProgramExpectedDaysInvalid: 'Ожидаемый срок в днях должен быть неотрицательным целым числом',
  treatmentProgramRecurringRecommendationNotCompletable: 'Постоянная рекомендация не отмечается выполненной',
  treatmentProgramNotFound: 'Программа не найдена',
  treatmentProgramPromoNotConfigured: 'Промо-программа не настроена',
  treatmentProgramEmptyLoadSettingsRequest: 'Пустой запрос настроек нагрузки',
  treatmentProgramExecutionModeRecommendationsOnly: 'Режим выполнения задаётся только для рекомендаций',
  treatmentProgramResultNotFound: 'Результат не найден',
  treatmentProgramTemplateNotFound: 'Шаблон программы не найден',
  treatmentProgramStageSystemGroupNotFound: 'Системная группа этапа не найдена',
  treatmentProgramTestingSystemGroupNotFound: 'Системная группа «Тестирование» не найдена',
  treatmentProgramSystemGroupHideForbidden: 'Системную группу нельзя скрыть',
  testStartNewAttemptFirst: 'Сначала начните новую попытку',
  testStartAttemptFirst: 'Сначала начните попытку',
  treatmentProgramFreeTextGeneralStageOnly: 'Свободный текст можно добавить только на этап «Общие рекомендации»',
  treatmentProgramTestMismatchItem: 'Тест не соответствует пункту программы',
  testSpecifyOutcome: 'Укажите итог (passed / failed / partial) или числовой score при настроенных порогах',
  treatmentProgramLoadWeightOutOfRange: 'Вес: число от 0 до 500',
  treatmentProgramRecommendationsGroupOnlyRecommendations: 'В группу «Рекомендации» можно помещать только рекомендации',
  treatmentProgramTestingGroupOnlyClinicalTests: 'В группу «Тестирование» можно помещать только клинические тесты',
  exerciseComplexEmpty: 'В комплексе нет упражнений',
  treatmentProgramEnterObservationText: 'Введите текст наблюдения',
  treatmentProgramSelectGroupForElementType: 'Выберите группу для этого типа элемента',

  // --- other ---
  commonLinkCopyFailed: 'Не удалось скопировать ссылку',
  commonLinkCopied: 'Ссылка скопирована',

  // --- fallback texts found by the strengthened coverage gate (DEFECT 2b, 2026-09-13 verification
  // pass) — literal reachable through a ternary branch alongside another branch (dynamic or a
  // second literal), which the original gate's argument-only check could not see. ---
  adminOperationFailed: 'Операция не выполнена',
  adminCheckAccessLadder: 'Проверьте лестницу доступа',
  doctorMergeAccessDenied: 'Доступ запрещён: нужны роль admin и режим администратора.',
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
  doctorSubscriptionPackageUpdateFailed: 'Не удалось изменить абонемент',
  doctorSubscriptionPackageAddFailed: 'Не удалось добавить абонемент',
  doctorSubscriptionPackageArchived: 'Абонемент отправлен в архив',
  doctorSubscriptionPackageRestored: 'Абонемент восстановлен',
  doctorTemplateSaveFailed: 'Не удалось сохранить шаблон',
  doctorTemplatePreviewFailed: 'Не удалось построить предпросмотр',
  doctorDesignSaveFailed: 'Не удалось сохранить оформление',
  treatmentProgramNoActivePromoPrograms: 'Активных промо-программ нет',
  messagingSelectChannel: 'Выберите мессенджер.',
  messagingNoBinding: 'Нет привязки к мессенджеру.',
  messagingContactRequestFailed: 'Не удалось запросить контакт.',
  bookingStaffConfirmationRequired: 'Нужно согласование',
  bookingCancelFailed: 'Не удалось отменить',
  patientEntryUpdated: 'Запись обновлена',
  mediaVideoTooShort: 'Видео должно быть не короче 10 секунд',
  mediaUploadFailed: 'Не удалось загрузить файл',
  adminDuplicateSettingsKeyInBatch: 'В запросе повторяется один и тот же ключ настроек',
  adminInvalidRequestBodyExtraFields: 'Некорректное тело запроса (лишние поля)',
  adminEmptySettingsList: 'Пустой список настроек',
  // Технический fallback на случай, если пойманное исключение — не Error (редкий путь); текст не
  // трогаем (см. правило «перенос механический»), просто даём ему честное имя вместо литерала.
  commonUnknownError: 'error',
  settingsSmtpSaveFailedRetry: 'Сервер не смог сохранить SMTP. Повторите позже.',
  settingsInvalidDsn: 'Укажите корректный HTTP(S) DSN',
  settingsBotSaveFailed: 'Не удалось сохранить настройки бота.',
  authPasswordUpdatedPleaseLogin: 'Пароль обновлён. Войдите.',
  authAccessConfigured: 'Доступ настроен.',
  authReenterPasswordToContinueSetup: 'Войдите с паролем ещё раз, чтобы продолжить защищённую настройку.',
} as const;

export type NotificationTextKey = keyof typeof notificationText;

/**
 * Параметризованные тексты — тот же словарь, но текст зависит от значения, известного только в
 * момент вызова (id, число, метка). Ключ и группировка по смыслу — как у обычных записей выше;
 * вынесены в отдельный объект, потому что содержимое не `string`, а `(...) => string`.
 */
export const notificationTextFactory = {
  /** `assertUuid` (`booking-engine/service.ts`) — метка поля с некорректным UUID. */
  invalidUuid: (label: string) => `Некорректный UUID: ${label}`,
  /** `appointmentStatusFsm.ts` — недопустимый переход между статусами записи. */
  invalidStatusTransition: (from: string, to: string) => `Недопустимый переход статуса: ${from} → ${to}`,
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
