import { MARKETING_LANDING_GALLERY } from "@/shared/ui/marketing/marketingLandingGallery";
import { MarketingLandingImage } from "@/shared/ui/marketing/MarketingLandingImage";

/** Сетка скриншотов и фото из `public/landing/` (см. `marketingLandingGallery.ts`). */
export function MarketingLandingGallery() {
  if (MARKETING_LANDING_GALLERY.length === 0) return null;

  return (
    <section aria-label="Скриншоты и материалы" className="scroll-mt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {MARKETING_LANDING_GALLERY.map((item) => (
          <div
            key={item.file}
            className={item.ratio === "phone" ? "flex justify-center sm:justify-start" : ""}
          >
            <MarketingLandingImage
              src={`/landing/${item.file}`}
              alt={item.alt}
              ratio={item.ratio}
              className={item.ratio === "phone" ? "mx-auto sm:mx-0" : ""}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
