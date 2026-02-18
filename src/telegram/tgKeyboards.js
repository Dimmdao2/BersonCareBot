function contactKeyboard() {
  return {
    keyboard: [
      [
        {
          text: "Поделиться контактом",
          request_contact: true,
        },
      ],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

module.exports = { contactKeyboard };
