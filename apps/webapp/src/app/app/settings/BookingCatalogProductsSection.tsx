"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { BE_PRODUCT_TYPES, type ProductAccessRules, type ProductComposition } from "@/modules/products/types";
import { apiJson } from "@/shared/lib/apiJson";

const TYPE_LABELS: Record<(typeof BE_PRODUCT_TYPES)[number], string> = {
  single_visit: "Разовый приём",
  membership: "Абонемент",
  gift_certificate: "Подарочный сертификат",
  promo: "Акция",
  course: "Курс",
  subscription: "Подписка",
  content_access: "Доступ к материалам",
  individual_offer: "Индивидуальное предложение",
};

type ProductRow = {
  id: string;
  title: string;
  productType: string;
  priceMinor: number;
  payByLinkEnabled: boolean;
  validityDays?: number | null;
  courseId?: string | null;
  subscriptionPackageId?: string | null;
  compositionJson?: ProductComposition;
  accessRulesJson?: ProductAccessRules;
};

export function BookingCatalogProductsSection({
  apiBase = "/api/admin/booking-engine/products",
}: {
  apiBase?: string;
}) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editId, setEditId] = useState("");
  const [title, setTitle] = useState("");
  const [priceRub, setPriceRub] = useState("");
  const [productType, setProductType] = useState<(typeof BE_PRODUCT_TYPES)[number]>("course");
  const [courseId, setCourseId] = useState("");
  const [subscriptionPackageId, setSubscriptionPackageId] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [contentIdsCsv, setContentIdsCsv] = useState("");
  const [serviceIdsCsv, setServiceIdsCsv] = useState("");
  const [visitCount, setVisitCount] = useState("1");
  const [payByLinkEnabled, setPayByLinkEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const json = await apiJson<{ ok?: boolean; products?: ProductRow[] }>(apiBase);
      if (json.products) setProducts(json.products);
    } catch {
      // load errors are non-critical; list simply stays stale
    }
  }, [apiBase]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  function parseCsvIds(raw: string): string[] {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function startEdit(p: ProductRow) {
    setEditId(p.id);
    setTitle(p.title);
    setProductType(p.productType as (typeof BE_PRODUCT_TYPES)[number]);
    setPriceRub(String(p.priceMinor / 100));
    setPayByLinkEnabled(p.payByLinkEnabled);
    setValidityDays(p.validityDays != null ? String(p.validityDays) : "");
    setCourseId(p.courseId ?? "");
    setSubscriptionPackageId(p.subscriptionPackageId ?? "");
    const comp = p.compositionJson ?? {};
    const access = p.accessRulesJson ?? {};
    const contentIds = [...(access.contentIds ?? []), ...(comp.contentIds ?? [])];
    setContentIdsCsv([...new Set(contentIds)].join(", "));
    setServiceIdsCsv((comp.serviceIds ?? []).join(", "));
    setVisitCount(String(comp.visitCount ?? 1));
  }

  function save() {
    setError(null);
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(",", ".")) * 100);
    if (!title.trim() || !Number.isFinite(priceMinor) || priceMinor < 0) {
      setError("invalid_form");
      return;
    }
    const validity =
      validityDays.trim() === "" ? null : Number.parseInt(validityDays, 10);
    if (validityDays.trim() !== "" && (!Number.isFinite(validity) || validity! < 1)) {
      setError("invalid_validity");
      return;
    }
    const contentIds = parseCsvIds(contentIdsCsv);
    const serviceIds = parseCsvIds(serviceIdsCsv);
    const visits = Number.parseInt(visitCount, 10);
    startTransition(async () => {
      try {
        await apiJson(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editId ? { id: editId } : {}),
            title: title.trim(),
            productType,
            priceMinor,
            currency: "RUB",
            validityDays: validity,
            courseId: productType === "course" && courseId.trim() ? courseId.trim() : null,
            subscriptionPackageId:
              productType === "membership" && subscriptionPackageId.trim()
                ? subscriptionPackageId.trim()
                : null,
            payByLinkEnabled,
            accessRulesJson: contentIds.length > 0 ? { contentIds } : {},
            compositionJson:
              productType === "promo" || productType === "gift_certificate"
                ? { visitCount: Number.isFinite(visits) && visits > 0 ? visits : 1, serviceIds }
                : productType === "single_visit"
                  ? { serviceIds }
                  : productType === "subscription" || productType === "content_access"
                    ? { contentIds }
                    : {},
          }),
        });
        setEditId("");
        setTitle("");
        setPriceRub("");
        setValidityDays("");
        setContentIdsCsv("");
        setServiceIdsCsv("");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "save_failed");
      }
    });
  }

  async function createPayLink(productId: string) {
    try {
      const json = await apiJson<{ ok?: boolean; payUrl?: string; error?: string }>(
        `${apiBase}/${productId}/pay-link`,
        { method: "POST", body: "{}" },
      );
      if (json.payUrl) {
        await navigator.clipboard.writeText(`${window.location.origin}${json.payUrl}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "pay_link_failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Продукты</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="text-sm">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1">
              <span>
                {p.title} — {TYPE_LABELS[p.productType as keyof typeof TYPE_LABELS] ?? p.productType}{" "}
                — {(p.priceMinor / 100).toLocaleString("ru-RU")} ₽
              </span>
              <span className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(p)}>
                  Изменить
                </Button>
                {p.payByLinkEnabled ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => createPayLink(p.id)}>
                    Ссылка на оплату
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2">
          <Label htmlFor="prod-title">Название</Label>
          <Input id="prod-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={productType}
            onChange={(e) => setProductType(e.target.value as (typeof BE_PRODUCT_TYPES)[number])}
            aria-label="Тип продукта"
          >
            {BE_PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {productType === "course" ? (
            <Input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="UUID курса"
              aria-label="ID курса"
            />
          ) : null}
          {productType === "membership" ? (
            <Input
              value={subscriptionPackageId}
              onChange={(e) => setSubscriptionPackageId(e.target.value)}
              placeholder="UUID абонемента каталога"
              aria-label="ID абонемента"
            />
          ) : null}
          {productType === "promo" || productType === "gift_certificate" ? (
            <Input
              value={visitCount}
              onChange={(e) => setVisitCount(e.target.value)}
              placeholder="Число визитов"
              aria-label="Число визитов"
            />
          ) : null}
          {productType === "promo" ||
          productType === "gift_certificate" ||
          productType === "single_visit" ? (
            <Input
              value={serviceIdsCsv}
              onChange={(e) => setServiceIdsCsv(e.target.value)}
              placeholder="UUID услуг через запятую"
              aria-label="Услуги"
            />
          ) : null}
          {productType === "subscription" || productType === "content_access" ? (
            <Input
              value={contentIdsCsv}
              onChange={(e) => setContentIdsCsv(e.target.value)}
              placeholder="slug материалов через запятую"
              aria-label="Материалы"
            />
          ) : null}
          <Label htmlFor="prod-validity">Срок (дней)</Label>
          <Input
            id="prod-validity"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
          />
          <Label htmlFor="prod-price">Цена (₽)</Label>
          <Input id="prod-price" value={priceRub} onChange={(e) => setPriceRub(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={payByLinkEnabled}
              onChange={(e) => setPayByLinkEnabled(e.target.checked)}
            />
            Покупка по ссылке
          </label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" disabled={pending} onClick={save}>
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
