/**
 * MVP stub: purchases module. Planned port: PurchasePort (listPurchases(userId), getPurchaseSectionState(userId)).
 * Will be wired to real data when courses/accesses/subscriptions are implemented.
 */
export type PurchaseSectionState = {
  title: string;
  description: string;
};

export function getPurchaseSectionState(): PurchaseSectionState {
  return {
    title: "Мои покупки",
    description:
      "В MVP раздел остается заглушкой и готовится под будущие покупки курсов, доступы и подписки.",
  };
}
