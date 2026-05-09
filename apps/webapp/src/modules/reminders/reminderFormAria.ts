/** Подсказки доступности по тексту ошибки валидации (русские сообщения из диалогов напоминаний). */

export type ReminderScheduleFieldInvalid = {
  daysMask: boolean;
  quietHours: boolean;
  intervalWindow: boolean;
  slotTimes: boolean;
};

const emptyInvalid: ReminderScheduleFieldInvalid = {
  daysMask: false,
  quietHours: false,
  intervalWindow: false,
  slotTimes: false,
};

export function scheduleInvalidFromError(error: string | null): ReminderScheduleFieldInvalid {
  if (!error?.trim()) return { ...emptyInvalid };

  const quiet = /Тихие часы|тихих часов/i.test(error);
  const days = /маск|день недели|хотя бы один день/i.test(error);
  const slots =
    /слотов|времена слотов|Проверьте времена|validation_error:\s*timesLocal/i.test(error) ||
    error.includes("validation_error: at least one time");
  const interval =
    /Начало окна|Укажите время в формате|Интервал от|меньше конца/i.test(error) &&
    !quiet &&
    !slots;

  return {
    daysMask: days,
    quietHours: quiet,
    intervalWindow: interval,
    slotTimes: slots,
  };
}

export function customReminderFieldsInvalid(error: string | null): { title: boolean; text: boolean } {
  if (!error?.trim()) return { title: false, text: false };
  return {
    title: /Заголовок/i.test(error),
    text: /Текст не длиннее|2000 символов/i.test(error),
  };
}
