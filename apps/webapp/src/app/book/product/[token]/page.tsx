import { PublicProductPurchaseClient } from "./PublicProductPurchaseClient";

type Props = { params: Promise<{ token: string }> };

export default async function PublicProductPage({ params }: Props) {
  const { token } = await params;
  return <PublicProductPurchaseClient token={token} />;
}
