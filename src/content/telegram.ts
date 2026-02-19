export const telegramContent = {
  menu: {
    book: "📅 Запись на приём",
    notifications: "🔔 Настройки уведомлений",
    question: "❓ Задать вопрос"
  },
  messages: {
    welcome: "Добро пожаловать! Я помогу вам записаться на приём, настроить уведомления или задать вопрос.",
    chooseMenu: "Выберите действие в меню.",
    describeQuestion: "Опишите ваш вопрос.",
    questionAccepted: "Вопрос принят. Я отвечу вам в ближайшее время.",
    notImplemented: "Раздел в разработке.",
    bookingOffline: (url: string) => `Для очной записи перейдите по ссылке: ${url}`,
    bookingOnline: "Опишите причину обращения.",
    bookingMy: "Раздел 'Мои записи' в разработке."
  },
  inline: {
    booking: [
      { text: "Записаться очно", callback_data: "booking:offline" },
      { text: "Онлайн-консультация", callback_data: "booking:online" },
      { text: "Мои записи", callback_data: "booking:my" }
    ]
  }
} as const;

export type TelegramContent = typeof telegramContent;
