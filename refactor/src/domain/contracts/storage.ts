/** Категории read-запросов к хранилищу через доменный порт. */
export type DbReadQueryType =
  | 'user.byTelegramId'
  | 'user.byPhone'
  | 'booking.byRubitimeId'
  | 'booking.activeByUser'
  | 'delivery.pending';

/** Категории write-мутаций к хранилищу через доменный порт. */
export type DbWriteMutationType =
  | 'user.upsert'
  | 'user.state.set'
  | 'user.phone.link'
  | 'booking.upsert'
  | 'delivery.attempt.log'
  | 'event.log';

/** Универсальный контракт read-запроса к БД. */
export type DbReadQuery = {
  type: DbReadQueryType;
  params: Record<string, unknown>;
};

/** Универсальный контракт write-мутации к БД. */
export type DbWriteMutation = {
  type: DbWriteMutationType;
  params: Record<string, unknown>;
};
