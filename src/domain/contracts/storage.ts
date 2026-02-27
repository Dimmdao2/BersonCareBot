export type DbReadQueryType =
  | 'user.byTelegramId'
  | 'user.byPhone'
  | 'booking.byRubitimeId'
  | 'booking.activeByUser'
  | 'delivery.pending';

export type DbWriteMutationType =
  | 'user.upsert'
  | 'user.state.set'
  | 'user.phone.link'
  | 'booking.upsert'
  | 'delivery.attempt.log'
  | 'event.log';

export type DbReadQuery = {
  type: DbReadQueryType;
  params: Record<string, unknown>;
};

export type DbWriteMutation = {
  type: DbWriteMutationType;
  params: Record<string, unknown>;
};
