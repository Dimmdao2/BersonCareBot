export type PurchaseSectionState = {
  title: string;
  description: string;
};

export function getPurchaseSectionState(): PurchaseSectionState {
  return {
    title: "Мои покупки",
    description: "Курсы, доступы к материалам и покупки по ссылке.",
  };
}
