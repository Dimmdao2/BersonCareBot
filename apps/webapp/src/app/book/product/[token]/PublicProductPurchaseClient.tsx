"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicBookPaths } from "@/shared/publicBook/paths";
import toast from "react-hot-toast";

type ProductInfo = {
  id: string;
  title: string;
  priceMinor: number;
  currency: string;
  productType: string;
};

type Props = { token: string };

export function PublicProductPurchaseClient({ token }: Props) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ token });
    const res = await fetch(`/api/booking/public/products/link?${q.toString()}`);
    const json = (await res.json()) as { ok?: boolean; product?: ProductInfo; error?: string };
    if (!json.ok || !json.product) {
      setError(json.error ?? "link_not_found");
      return;
    }
    setProduct(json.product);
  }, [token]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  function purchase() {
    if (!product) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/booking/public/products/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          payLinkToken: token,
          buyerPhone: phone.trim(),
          buyerName: name.trim() || phone.trim(),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        purchase?: { id: string; status: string };
        paymentIntentId?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "purchase_failed");
        return;
      }
      if (json.purchase?.status === "active") {
        toast.success("Покупка активирована");
        router.push(publicBookPaths.done);
        return;
      }
      if (json.paymentIntentId && json.purchase?.id) {
        router.push(
          `${publicBookPaths.productPay(token)}?purchaseId=${encodeURIComponent(json.purchase.id)}&phone=${encodeURIComponent(phone.trim())}`,
        );
        return;
      }
      setError("payment_unavailable");
    });
  }

  const amountRub =
    product != null
      ? (product.priceMinor / 100).toLocaleString("ru-RU", { style: "currency", currency: product.currency || "RUB" })
      : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">{product?.title ?? "Продукт"}</h1>
      {amountRub ? <p className="text-sm">К оплате: {amountRub}</p> : null}
      <label className="flex flex-col gap-1 text-sm">
        Имя
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Телефон
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={pending || !product || !phone.trim()} onClick={purchase}>
        {product && product.priceMinor > 0 ? "Перейти к оплате" : "Получить"}
      </Button>
    </div>
  );
}
