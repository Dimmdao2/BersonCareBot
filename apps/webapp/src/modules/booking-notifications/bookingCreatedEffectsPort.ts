/**
 * Порт пациентского уведомления о созданной записи. Решение владельца 19.08:
 *
 * > «Про событие записи вижу явный косяк — интегратор тут вообще ни при чем. Запись делает вебапп.
 * > Напоминания и отправку уведомлений — интегратор с шедулером.»
 *
 * Запись создаёт вебапп — значит и получателя с текстом определяет он сам, по своей базе, в своём
 * запросе. Интегратору остаётся то, ради чего он есть: доставить строку очереди. Раньше это
 * последствие уходило подписанным HTTP в интегратор, который ходил ЗА ЭТИМИ ЖЕ ДАННЫМИ обратно в
 * вебапп и слал сообщение синхронно, внутри запроса пациента.
 *
 * Порт живёт в модуле (домен не имеет права звать app-layer), реализация — в
 * `@/app-layer/booking/bookingCreatedEffects`.
 */

export type BookingCreatedEffectsInput = {
  organizationId: string;
  /** Идентификатор строки записи (или канонического назначения для путей персонала). */
  bookingId: string;
  canonicalAppointmentId: string;
  platformUserId: string | null;
  contactName: string;
  contactPhone: string | null;
  slotStart: string;
  slotEnd: string;
  bookingType: 'in_person' | 'online';
  city: string | null;
  cityCodeSnapshot: string | null;
  /** Решение вебаппа по настройкам клиники: уведомлять ли пациента. */
  notifyPatient: boolean;
  timeZone: string;
};

export type BookingCreatedEffectsPort = {
  /**
   * Никогда не бросает: запись уже зафиксирована, откатить её отказ доставки не может. Но и не
   * глотает — каждый отказ уходит в тот же порт «пустой аудитории», что и остальные молчания.
   */
  apply(input: BookingCreatedEffectsInput): Promise<void>;
};
