// Слой бизнес-логики
// Пример: обработка подписки, доменных операций
import { Topic, listActiveTopics } from '../db/topicsRepo.js';
import { getUserSubscriptions, toggleUserSubscription } from '../db/subscriptionsRepo.js';

export type Subscription = {
  user_id: number;
  topic_id: number;
  is_active: boolean;
};

export class SubscriptionService {
  // methods for subscription business logic
  async listTopicsWithUserState(userId: number): Promise<Array<{topic: Topic; enabled: boolean}>> {
    const topics = await listActiveTopics();
    const userSubs = await getUserSubscriptions(userId);
    return topics.map((topic: Topic) => ({ topic, enabled: userSubs.has(topic.id) }));
  }

  async toggleTopic(userId: number, topicId: number): Promise<boolean> {
    return await toggleUserSubscription(userId, topicId);
  }
}
