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
 * Дубли по СТРОКЕ (не по смыслу) сюда не смешаны специально: например `neUdalosSohranit` /
 * `neUdalosSohranit2` или `setNedostupna` / `setNedostupna2` отличаются пунктуацией и являются
 * НАХОДКОЙ (см. отчёт по этой работе), но не объединены — объединение изменило бы видимый текст
 * на части call-site'ов, а перенос в этой работе задуман механическим (без изменения текстов).
 *
 * Добавляя новый код: заведите ключ здесь и сошлитесь на него с call-site — не кладите строку
 * инлайново. Статический gate `scripts/check-notification-text-coverage.mjs` (часть `pnpm lint`)
 * не даёт новым `toast.error/success('...')`/`new UserFacingError('...')` со строковым литералом
 * появиться мимо этого файла.
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


  // --- auth/account ---
  drugieSeansyZaversheny: 'Другие сеансы завершены',
  klyuchDostupaDobavlen: 'Ключ доступа добавлен',
  klyuchDostupaUdalen: 'Ключ доступа удалён',
  neUdalosDobavitKlyuch: 'Не удалось добавить ключ доступа',
  neUdalosUdalitKlyuch: 'Не удалось удалить ключ доступа',
  parolIzmenen: 'Пароль изменён',

  // --- patient ---
  akkauntSEtoyPochtoy: 'Аккаунт с этой почтой уже существует.',
  dannyeDnevnikovUdaleny: 'Данные дневников удалены',
  esliAkkauntSEtoy: 'Если аккаунт с этой почтой существует, мы отправили код.',
  gotovo: 'Готово',
  gotovo2: 'Готово.',
  kodIstekZaprositeNovyy: 'Код истёк. Запросите новый.',
  kodUzheIspolzovanNachnite: 'Код уже использован. Начните вход снова.',
  kodUzheOtpravlenProverte: 'Код уже отправлен. Проверьте почту.',
  komandaSkopirovanaVstavteEe: 'Команда скопирована — вставьте её в чат с ботом в Max',
  nastroykaSohranena: 'Настройка сохранена',
  netSoedineniyaSServerom: 'Нет соединения с сервером. Проверьте сеть.',
  neUdalosIspolzovatKlyuch: 'Не удалось использовать ключ доступа',
  neUdalosIzmenitPauzu: 'Не удалось изменить паузу уведомлений.',
  neUdalosOpredelitMessendzher: 'Не удалось определить мессенджер.',
  neUdalosOtpravitPismo: 'Не удалось отправить письмо',
  neUdalosOtpravitZapros: 'Не удалось отправить запрос. Попробуйте снова.',
  neUdalosPodtverditNomer: 'Не удалось подтвердить номер в мессенджере',
  neUdalosProveritNomer: 'Не удалось проверить номер',
  neUdalosSohranitPoprobuyte: 'Не удалось сохранить. Попробуйте позже.',
  neUdalosSohranitPoprobuytePozzhe: 'Не удалось сохранить, попробуйте позже.',
  oplataProshla: 'Оплата прошла',
  oshibka: 'Ошибка',
  otkroyteChatSBotom: 'Откройте чат с ботом и отправьте контакт по кнопке.',
  otpraviliKodNaPochtu: 'Отправили код на почту.',
  parolNeMenee8: 'Пароль — не менее 8 символов.',
  podozhditeMinutuPeredPovtornoy: 'Подождите минуту перед повторной отправкой.',
  pohozhayaZapisVMomente: 'Похожая запись в моменте уже сохранена только что',
  registratsiyaKabinetaSpetsialistaPoka: 'Регистрация кабинета специалиста пока недоступна.',
  setNedostupna: 'Сеть недоступна',
  setNedostupna2: 'Сеть недоступна.',
  snachalaOtkroytePrilozhenieS: 'Сначала откройте приложение с иконки на главном экране',
  spasiboZaOtsenku: 'Спасибо за оценку!',
  trebuetsyaOplata: 'Требуется оплата',
  ukazhiteDatuIVremya: 'Укажите дату и время',
  ukazhiteEmail: 'Укажите email',
  ukazhiteEmailFamiliyuI: 'Укажите email, фамилию и имя',
  ukazhiteFamiliyuIImya: 'Укажите фамилию и имя',
  uvedomleniyaNePodderzhivayutsya: 'Уведомления не поддерживаются',
  vhodPoKlyuchuDostupa: 'Вход по ключу доступа отключён',
  vosstanovlenieParolyaPoEmail: 'Восстановление пароля по email временно недоступно.',
  voyditeChtobySohranitVypolnenie: 'Войдите, чтобы сохранить выполнение.',
  vremyaPrivyazkiIstekloNachnite: 'Время привязки истекло. Начните снова.',
  vvediteEmail: 'Введите email',
  vvediteEmailIParol: 'Введите email и пароль',
  vvediteKod: 'Введите код',
  vvediteKodINovyy: 'Введите код и новый пароль (не менее 8 символов)',
  vvediteTekstSoobscheniya: 'Введите текст сообщения',
  vyberiteIntensivnost: 'Выберите интенсивность',
  vyberiteSimptomIZnachenie: 'Выберите симптом и значение',
  zanyatieOtmecheno: 'Занятие отмечено',
  zapisano: 'Записано.',
  zapisDobavlena: 'Запись добавлена',
  zapisOtmenena: 'Запись отменена',
  zapisPerenesena: 'Запись перенесена',
  zapisSohranena: 'Запись сохранена',
  zapisUdalena: 'Запись удалена',
  zapolniteVsePolya: 'Заполните все поля',

  // --- doctor ---
  abonementSozdan: 'Абонемент создан',
  bezGruppyDopustimyTolko: 'Без группы допустимы только рекомендации и клинические тесты',
  chernovikSohranen: 'Черновик сохранён',
  faylUdalenIzChata: 'Файл удалён из чата, но список не обновился. Откройте обсуждение заново.',
  faylUdalenMestoV: 'Файл удалён. Место в хранилище освобождено.',
  izmeneniyaSohraneny: 'Изменения сохранены',
  klinicheskieTestyNelzyaDobavlyat: 'Клинические тесты нельзя добавлять на этап «Общие рекомендации»',
  kommentariyNeSohranen: 'Комментарий не сохранён.',
  naboryTestovNelzyaDobavlyat: 'Наборы тестов нельзя добавлять на этап «Общие рекомендации»',
  naEtapeObschieRekomendatsiiNelzya: 'На этапе «Общие рекомендации» нельзя разворачивать комплекс ЛФК',
  nazvanieGruppyNeMozhet: 'Название группы не может быть пустым',
  neNaydenaSistemnayaGruppa: 'Не найдена системная группа «Рекомендации» для этапа',
  neNaydenaSistemnayaGruppaTestirovanie: 'Не найдена системная группа «Тестирование» для этапа',
  neUdalosArhivirovatPoprobuyte: 'Не удалось архивировать. Попробуйте снова или обратитесь к администратору.',
  neUdalosIzmenitDostup: 'Не удалось изменить доступ к материалу',
  neUdalosIzmenitDostupK: 'Не удалось изменить доступ к разделу',
  neUdalosIzmenitGruppu: 'Не удалось изменить группу',
  neUdalosIzmenitNastroyki: 'Не удалось изменить настройки симптома',
  neUdalosIzmenitPoryadok: 'Не удалось изменить порядок элементов',
  neUdalosIzmenitPoryadokEtapov: 'Не удалось изменить порядок этапов',
  neUdalosIzmenitPoryadokMaterialov: 'Не удалось изменить порядок материалов',
  neUdalosIzmenitPoryadokRazdelov: 'Не удалось изменить порядок разделов',
  neUdalosIzmenitVidimost: 'Не удалось изменить видимость раздела',
  neUdalosObnovitAbonement: 'Не удалось обновить абонемент',
  neUdalosObnovitDannye: 'Не удалось обновить данные',
  neUdalosOtozvatPriglashenie: 'Не удалось отозвать приглашение.',
  neUdalosPereschitatAbonement: 'Не удалось пересчитать абонемент',
  neUdalosPrimenitDeystvie: 'Не удалось применить действие',
  neUdalosSkopirovatTelefon: 'Не удалось скопировать телефон',
  neUdalosSmenitGruppu: 'Не удалось сменить группу элемента',
  neUdalosSnyatArhiv: 'Не удалось снять архив.',
  neUdalosSohranit: 'Не удалось сохранить',
  neUdalosSozdatPriglashenie: 'Не удалось создать приглашение',
  neUdalosUdalit: 'Не удалось удалить',
  neUdalosUdalitEtap: 'Не удалось удалить этап',
  neUdalosUdalitGruppu: 'Не удалось удалить группу',
  obedinenieVypolneno: 'Объединение выполнено.',
  oformlenieSohraneno: 'Оформление сохранено',
  oshibkaSeti: 'Ошибка сети',
  oshibkaSetiPriPereschete: 'Ошибка сети при пересчёте',
  otmeneno: 'Отменено',
  otvetOtpravlenNoSpisok: 'Ответ отправлен, но список не обновился. Откройте обсуждение заново.',
  parametryArhivIliPublikatsiya: 'Параметры «Архив» или «Публикация» в адресе недопустимы — применены значения по умолчанию.',
  pervye4SimvolaNe: 'Первые 4 символа не совпали с UUID дубликата — merge отменён.',
  platezhZapisan: 'Платёж записан',
  priglashenieOtozvano: 'Приглашение отозвано.',
  programmaLecheniyaNaznachena: 'Программа лечения назначена',
  sbrosheno: 'Сброшено',
  setNedostupnaPoprobuyteEsche: 'Сеть недоступна. Попробуйте ещё раз.',
  shablonOpublikovan: 'Шаблон опубликован',
  shablonSohranen: 'Шаблон сохранён',
  sistemnuyuGruppuNelzyaUdalit: 'Системную группу нельзя удалить',
  sozdano: 'Создано',
  srokDeystviyaDolzhenByt: 'Срок действия должен быть целым числом ≥ 1',
  telefonSkopirovan: 'Телефон скопирован',
  udaleno: 'Удалено',
  ukazhiteNazvanieShablona: 'Укажите название шаблона',
  vyberiteGruppuIzSpiska: 'Выберите группу из списка',
  zabolevaniePerenesenoVIstoriyu: 'Заболевание перенесено в историю',
  zabolevanieVozvrascheno: 'Заболевание возвращено',
  zapisSozdanaKommentariyNe: 'Запись создана, комментарий не сохранён.',
  zapolniteNazvanieTsenuI: 'Заполните название, цену и добавьте хотя бы одну позицию',

  // --- admin ---
  nastroykiProbSohraneny: 'Настройки проб сохранены.',
  neUdalosSohranitNastroyku: 'Не удалось сохранить настройку',
  neUdalosSohranitRezhim: 'Не удалось сохранить режим Telegram',
  neUdalosSohranitRubilnik: 'Не удалось сохранить рубильник интеграции',
  neUdalosSohranitTsveta: 'Не удалось сохранить цвета локаций',
  neUdalosZagruzitGlobalnye: 'Не удалось загрузить глобальные рубильники интеграций',
  neUdalosZagruzitNastroyki: 'Не удалось загрузить настройки способов входа',
  neUdalosZagruzitTsveta: 'Не удалось загрузить цвета локаций',
  neUdalosZagruzitUchetnye: 'Не удалось загрузить учётные данные Telegram',
  parametrySluzhebnogoImapYaschika: 'Параметры служебного IMAP-ящика сохранены.',
  sbroshenoSnovaDeystvuyutZnacheniya: 'Сброшено: снова действуют значения по умолчанию из кода.',
  sohraneno: 'Сохранено',
  tsvetaLokatsiySohraneny: 'Цвета локаций сохранены',
  vyberiteDeystviePosleOplachennogo: 'Выберите действие после оплаченного периода',
  vyberiteDeystviePosleTriala: 'Выберите действие после триала',

  // --- settings ---
  kodSkopirovanVBufer: 'Код скопирован в буфер обмена',
  nastroykaBezopasnostiSohranena: 'Настройка безопасности сохранена',
  nastroykiBotaSohraneny: 'Настройки бота сохранены',
  neUdalosPodtverditSohranennye: 'Не удалось подтвердить сохранённые настройки',
  neUdalosSkopirovatKod: 'Не удалось скопировать код',
  neUdalosSohranit2: 'Не удалось сохранить.',
  neUdalosSohranitChast: 'Не удалось сохранить часть настроек',
  neUdalosSohranitCredential: 'Не удалось сохранить credential',
  neUdalosSohranitEmail: 'Не удалось сохранить email для чека.',
  neUdalosSohranitNastroyki: 'Не удалось сохранить настройки',
  neUdalosSohranitNastroykiNapominaniy: 'Не удалось сохранить настройки напоминаний',
  neUdalosSohranitNastroykuBezopasnosti: 'Не удалось сохранить настройку безопасности',
  neUdalosSohranitNastroykuPovtorite: 'Не удалось сохранить настройку. Повторите попытку.',
  neUdalosSohranitNastroykuVizitok: 'Не удалось сохранить настройку визиток специалистов. Повторите попытку.',
  neUdalosSohranitProverte: 'Не удалось сохранить. Проверьте: код темы (латиница, цифры, _), длину подписи, уникальность кодов; при заполненной проекции рассылок код должен существовать в справочнике тем.',
  neUdalosSohranitStranitsu: 'Не удалось сохранить страницу. Повторите попытку.',
  oshibkaPriSohranenii: 'Ошибка при сохранении',
  otmenaPrimenena: 'Отмена применена',
  perenosPrimenen: 'Перенос применён',
  podpiskaVosstanovlena: 'Подписка восстановлена',
  proverteEmailDlyaCheka: 'Проверьте email для чека.',
  pushOtklyuchen: 'Push отключён',
  pushVklyuchen: 'Push включён',
  snachalaSohranitePolnyySmtp: 'Сначала сохраните полный SMTP в БД',
  sohranenoNovayaKonfiguratsiyaPrimenyaetsya: 'Сохранено. Новая конфигурация применяется после перезапуска процессов.',
  testovoePismoOtpravleno: 'Тестовое письмо отправлено',
  ukazhiteKorrektnyyEmailPoluchatelya: 'Укажите корректный email получателя',
  vNastroykahNetParolya: 'В настройках нет пароля SMTP',

  // --- domain/booking-engine ---
  neizvestnyyStatusZapisi: 'Неизвестный статус записи',
  ukazhiteFilial: 'Укажите филиал',
  vremyaOkonchaniyaDolzhnoByt: 'Время окончания должно быть позже начала',
  zapisNeNaydena: 'Запись не найдена',

  // --- domain/comments ---
  kommentariyNeNayden: 'Комментарий не найден',
  neizvestnyyCommentType: 'Неизвестный comment_type',
  neizvestnyyTargetTypeKommentariya: 'Неизвестный target_type комментария',
  nekorrektnyyUuid: 'Некорректный UUID',
  tekstKommentariyaNeMozhet: 'Текст комментария не может быть пустым',
  tekstKommentariyaObyazatelen: 'Текст комментария обязателен',

  // --- domain/courses ---
  dostupnaTolkoZapisNa: 'Доступна только запись на опубликованный курс',
  kursNeNayden: 'Курс не найден',
  nazvanieKursaObyazatelno: 'Название курса обязательно',
  stranitsaVstupitelnogoUrokaDolzhna: 'Страница вступительного урока должна быть опубликована и не в архиве',
  stranitsaVstupitelnogoUrokaDolzhnaByt: 'Страница вступительного урока должна быть отмечена «Только для залогиненных»',
  stranitsaVstupitelnogoUrokaNe: 'Страница вступительного урока не найдена',
  vstupitelnymUrokomMozhetByt: 'Вступительным уроком может быть только страница из раздела «Уроки»',
  zapisNaKursZakryta: 'Запись на курс закрыта',

  // --- domain/lfk-assignments ---
  nekorrektnyeIdentifikatory: 'Некорректные идентификаторы',

  // --- domain/lfk-exercises ---
  nazvanieUprazhneniyaObyazatelno: 'Название упражнения обязательно',
  uprazhnenieNeNaydeno: 'Упражнение не найдено',
  uprazhnenieVArhiveVernite: 'Упражнение в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/lfk-templates ---
  dobavteHotyaByOdno: 'Добавьте хотя бы одно упражнение',
  kompleksVArhiveVernite: 'Комплекс в архиве. Верните из архива, чтобы редактировать.',
  nazvanieShablonaObyazatelno: 'Название шаблона обязательно',
  nelzyaUdalitVseUprazhneniya: 'Нельзя удалить все упражнения из опубликованного шаблона',
  nuzhnoNazvanieShablona: 'Нужно название шаблона',
  opublikovatMozhnoTolkoChernovik: 'Опубликовать можно только черновик',
  shablonNeNayden: 'Шаблон не найден',

  // --- domain/messaging ---
  neOtpravleno: 'Не отправлено',

  // --- domain/recommendations ---
  nazvanieRekomendatsiiObyazatelno: 'Название рекомендации обязательно',
  rekomendatsiyaNeNaydena: 'Рекомендация не найдена',
  rekomendatsiyaVArhiveVernite: 'Рекомендация в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/tests ---
  naborNeNayden: 'Набор не найден',
  naborVArhiveVernite: 'Набор в архиве. Верните из архива, чтобы менять состав.',
  naborVArhiveVerniteIz: 'Набор в архиве. Верните из архива, чтобы редактировать.',
  nazvanieNaboraObyazatelno: 'Название набора обязательно',
  nazvanieTestaObyazatelno: 'Название теста обязательно',
  neizvestnyyIdentifikatorVidaIzmereniya: 'Неизвестный идентификатор вида измерения',
  nekorrektnayaStrukturaScoring: 'Некорректная структура scoring',
  nekorrektnyyStatusPublikatsii: 'Некорректный статус публикации',
  nekorrektnyyVidOtsenki: 'Некорректный вид оценки',
  odinITotZhe: 'Один и тот же тест не может входить в набор дважды',
  podpisVidaIzmereniyaNe: 'Подпись вида измерения не может быть пустой',
  slishkomDlinnayaPodpis: 'Слишком длинная подпись',
  spisokUstarelObnoviteStranitsu: 'Список устарел: обновите страницу и попробуйте снова',
  testNeNayden: 'Тест не найден',
  testVArhiveVernite: 'Тест в архиве. Верните из архива, чтобы редактировать.',

  // --- domain/treatment-program ---
  bezGruppyMozhnoDobavit: 'Без группы можно добавить только рекомендацию или клинический тест',
  bezGruppyMozhnoOstavit: 'Без группы можно оставить только рекомендацию или клинический тест',
  dlyaKlinicheskogoTestaIspolzuyte: 'Для клинического теста используйте запись результатов',
  dlyaKlinicheskogoTestaIspolzuyteOtpravku: 'Для клинического теста используйте отправку результатов',
  dlyaKompleksaLfkIspolzuyte: 'Для комплекса ЛФК используйте разворот комплекса',
  dlyaKompleksaLfkIspolzuyteRazvorot: 'Для комплекса ЛФК используйте разворот комплекса (from-lfk-complex)',
  dlyaPropuskaEtapaUkazhite: 'Для пропуска этапа укажите причину',
  elementEtapaNeNayden: 'Элемент этапа не найден',
  elementNedostupenDlyaChek: 'Элемент недоступен для чек-листа',
  elementNeNayden: 'Элемент не найден',
  elementNeYavlyaetsyaKlinicheskim: 'Элемент не является клиническим тестом',
  elementOtklyuchen: 'Элемент отключён',
  elementProgrammyNeNayden: 'Элемент программы не найден',
  etapNedostupen: 'Этап недоступен',
  etapNeizvestnyyChernovoyIdentifikator: 'Этап: неизвестный черновой идентификатор',
  etapNeNayden: 'Этап не найден',
  etapObschieRekomendatsiiDolzhen: 'Этап «Общие рекомендации» должен оставаться первым',
  gruppaEtapaNeNaydena: 'Группа этапа не найдена',
  gruppaNeNaydena: 'Группа не найдена',
  gruppaNeNaydenaIli: 'Группа не найдена или не принадлежит этапу',
  kommentariiNedostupnyDlyaProgrammy: 'Комментарии недоступны для программы курса',
  kommentariiNedostupnyDlyaPromo: 'Комментарии недоступны для промо-программы',
  kompleksLfkNeNayden: 'Комплекс ЛФК не найден или в архиве',
  naEtapeObschieRekomendatsii: 'На этапе «Общие рекомендации» разрешены только рекомендации',
  naEtapeObschieRekomendatsiiElementy: 'На этапе «Общие рекомендации» элементы не привязываются к группам',
  nagruzkuMozhnoMenyatTolko: 'Нагрузку можно менять только для упражнений',
  naznachatMozhnoTolkoOpublikovannyy: 'Назначать можно только опубликованный шаблон',
  nazvanieEtapaNeMozhet: 'Название этапа не может быть пустым',
  nazvanieEtapaObyazatelno: 'Название этапа обязательно',
  nazvanieGruppyObyazatelno: 'Название группы обязательно',
  nazvanieMozhnoMenyatTolko: 'Название можно менять только у личного упражнения',
  nazvanieNeMozhetByt: 'Название не может быть пустым',
  neizvestnyyTipElementaProgrammy: 'Неизвестный тип элемента программы',
  nekorrektnayaVremennayaZona: 'Некорректная временная зона',
  nekorrektnyyPoryadokElementovEtapa: 'Некорректный порядок элементов этапа',
  nekorrektnyyPoryadokEtapov: 'Некорректный порядок этапов',
  nekorrektnyyPoryadokGruppEtapa: 'Некорректный порядок групп этапа',
  nelzyaMenyatNazvanieSistemnoy: 'Нельзя менять название системной группы',
  nelzyaMenyatPoryadokSistemnoy: 'Нельзя менять порядок системной группы',
  nelzyaUdalitIliZamenit: 'Нельзя удалить или заменить элемент с отметкой выполнения или историей теста',
  neOpredelenaOrganizatsiyaPromo: 'Не определена организация промо-программы',
  neUdalosDobavitElement: 'Не удалось добавить элемент',
  neUdalosDobavitEtap: 'Не удалось добавить этап',
  neUdalosDobavitGruppu: 'Не удалось добавить группу',
  neUdalosDobavitRekomendatsiyu: 'Не удалось добавить рекомендацию',
  neUdalosSozdatLichnoe: 'Не удалось создать личное упражнение',
  neUdalosZamenitElement: 'Не удалось заменить элемент',
  ozhidaemyySrokVDnyah: 'Ожидаемый срок в днях должен быть неотрицательным целым числом',
  postoyannayaRekomendatsiyaNeOtmechaetsya: 'Постоянная рекомендация не отмечается выполненной',
  programmaNeNaydena: 'Программа не найдена',
  promoProgrammaNeNastroena: 'Промо-программа не настроена',
  pustoyZaprosNastroekNagruzki: 'Пустой запрос настроек нагрузки',
  rezhimVypolneniyaZadaetsyaTolko: 'Режим выполнения задаётся только для рекомендаций',
  rezultatNeNayden: 'Результат не найден',
  shablonProgrammyNeNayden: 'Шаблон программы не найден',
  sistemnayaGruppaEtapaNe: 'Системная группа этапа не найдена',
  sistemnayaGruppaTestirovanieNe: 'Системная группа «Тестирование» не найдена',
  sistemnuyuGruppuNelzyaSkryt: 'Системную группу нельзя скрыть',
  snachalaNachniteNovuyuPopytku: 'Сначала начните новую попытку',
  snachalaNachnitePopytku: 'Сначала начните попытку',
  svobodnyyTekstMozhnoDobavit: 'Свободный текст можно добавить только на этап «Общие рекомендации»',
  testNeSootvetstvuetPunktu: 'Тест не соответствует пункту программы',
  ukazhiteItogPassedFailed: 'Укажите итог (passed / failed / partial) или числовой score при настроенных порогах',
  vesChisloOt0: 'Вес: число от 0 до 500',
  vGruppuRekomendatsiiMozhno: 'В группу «Рекомендации» можно помещать только рекомендации',
  vGruppuTestirovanieMozhno: 'В группу «Тестирование» можно помещать только клинические тесты',
  vKomplekseNetUprazhneniy: 'В комплексе нет упражнений',
  vvediteTekstNablyudeniya: 'Введите текст наблюдения',
  vyberiteGruppuDlyaEtogo: 'Выберите группу для этого типа элемента',

  // --- other ---
  neUdalosSkopirovatSsylku: 'Не удалось скопировать ссылку',
  ssylkaSkopirovana: 'Ссылка скопирована',
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
