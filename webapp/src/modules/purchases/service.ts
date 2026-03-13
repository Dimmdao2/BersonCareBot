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
