// Слой бизнес-логики
// Пример: обработка подписки, рассылки, доменных операций

export type Mailing = {
  id: number;
  topic_id: number;
  title: string;
  status: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
};

export class MailingService {
  // methods for mailing business logic
}

export type Subscription = {
  user_id: number;
  topic_id: number;
  is_active: boolean;
};

export class SubscriptionService {
  // methods for subscription business logic
}
