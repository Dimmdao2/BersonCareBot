// src/content/telegram.ts

export type NotificationSettings = {
  notify_spb: boolean;
  notify_msk: boolean;
  notify_online: boolean;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export const telegramContent = {
  mainMenu: {
    book: '📅 Запись на приём',
    ask: '❓ Задать вопрос',
    more: '⚙️ Меню',
  },

  mainMenuKeyboard: [
    [{ text: '📅 Запись на приём' }, { text: '❓ Задать вопрос' }, { text: '⚙️ Меню' }],
  ],

  requestContactKeyboard: {
    keyboard: [[{ text: '📲 Отправить номер телефона', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },

  moreMenuInline: {
    inline_keyboard: [
      [{ text: '🔔 Настройки уведомлений', callback_data: 'menu_notifications' }],
      [{ text: '📄 Мои записи', callback_data: 'menu_my_bookings' }],
    ],
  } as InlineKeyboardMarkup,

  messages: {
    welcome:
      'Добро пожаловать! Я помогу вам записаться на приём, настроить уведомления или задать вопрос.',
    chooseMenu: 'Выберите действие в меню.',
    describeQuestion: 'Опишите ваш вопрос.',
    questionAccepted: 'Вопрос принят. Я отвечу вам в ближайшее время.',
    confirmPhoneForRubitime:
      'Для привязки записи отправьте ваш номер через кнопку ниже.',
    notImplemented: 'Раздел в разработке.',
    noBookings: 'У вас нет активных записей.',
    bookingOffline: (url: string) => `Для очной записи перейдите по ссылке: ${url}`,
    bookingOnline: 'Опишите причину обращения.',
    bookingMy: "Раздел 'Мои записи' в разработке.",
  },

  inline: {
    booking: [
      { text: 'Записаться очно', callback_data: 'booking:offline' },
      { text: 'Онлайн-консультация', callback_data: 'booking:online' },
      { text: 'Мои записи', callback_data: 'booking:my' },
    ],
  },

  notificationSettings: {
    title: '🔔 Настройки уведомлений',
    subtitle: 'Выберите интересующие вас категории:',
    spb: 'Петербург (приёмы)',
    msk: 'Москва (приёмы и акции)',
    online: 'Онлайн-уроки и вебинары'
  },

  buildNotificationKeyboard: (settings: NotificationSettings): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        {
          text: `${settings.notify_spb ? '✅' : '❌'} Петербург (приёмы)`,
          callback_data: 'notify_toggle_spb',
        },
      ],
      [
        {
          text: `${settings.notify_msk ? '✅' : '❌'} Москва (приёмы и акции)`,
          callback_data: 'notify_toggle_msk',
        },
      ],
      [
        {
          text: `${settings.notify_online ? '✅' : '❌'} Онлайн-уроки и вебинары`,
          callback_data: 'notify_toggle_online',
        },
      ],
    ],
  }),
} as const;

export type TelegramContent = typeof telegramContent;
