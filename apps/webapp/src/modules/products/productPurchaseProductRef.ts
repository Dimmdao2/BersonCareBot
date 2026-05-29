export function productPurchaseProductRef(productPurchaseId: string): string {
  return `product_purchase:${productPurchaseId}`;
}

export function parseProductPurchaseProductRef(productRef: string | null | undefined): string | null {
  if (!productRef?.startsWith("product_purchase:")) return null;
  const id = productRef.slice("product_purchase:".length).trim();
  return id || null;
}
