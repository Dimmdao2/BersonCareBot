export const publicBookPaths = {
  root: "/book",
  new: "/book",
  newService: "/book/service",
  newSlot: "/book/slot",
  newConfirm: "/book/confirm",
  pay: "/book/pay",
  product: (token: string) => `/book/product/${encodeURIComponent(token)}`,
  productPay: (token: string) => `/book/product/${encodeURIComponent(token)}/pay`,
  done: "/book/done",
  embedScript: "/book/embed.js",
} as const;
