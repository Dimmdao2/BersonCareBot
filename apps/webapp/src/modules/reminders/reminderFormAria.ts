/** Подсказки доступности по тексту ошибки валидации (русские сообщения из диалогов напоминаний). */

export type ReminderScheduleFieldInvalid = {
  daysMask: boolean;
  intervalWindow: boolean;
  slotTimes: boolean;
};

const emptyInvalid: ReminderScheduleFieldInvalid = {
  daysMask: false,
  intervalWindow: false,
  slotTimes: false,
};

export function scheduleInvalidFromError(error: string | null): ReminderScheduleFieldInvalid {
  if (!error?.trim()) return { ...emptyInvalid };

  const days = /маск|день недели|хотя бы один день/i.test(error);
  const slots =
    /слотов|время напоминаний|Проверьте время напоминаний|validation_error:\s*timesLocal/i.test(
      error,
    ) || error.includes('validation_error: at least one time');
  const interval =
    /Начало (?:окна|периода)|Укажите время в формате|Интервал от|меньше конца/i.test(error) &&
    !slots;

  return {
    daysMask: days,
    intervalWindow: interval,
    slotTimes: slots,
  };
}
