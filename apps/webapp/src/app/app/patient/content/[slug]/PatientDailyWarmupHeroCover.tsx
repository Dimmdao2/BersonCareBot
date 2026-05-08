"use client";

import { Sparkles } from "lucide-react";
import { stripApiMediaForAnonymousGuest } from "@/app/app/patient/home/patientHomeGuestNav";
import { PatientHomeSafeImage } from "@/app/app/patient/home/PatientHomeSafeImage";
import { cn } from "@/lib/utils";

/** Слот обложки на странице материала разминки — меньше карточки на главной, ниже hero. */
const warmupDetailHeroImageSlotClass = cn(
  "pointer-events-none absolute bottom-0 right-4 z-[1] flex items-end justify-end overflow-hidden min-[380px]:right-6 lg:right-10",
  "h-[106px] w-[90px] min-[380px]:h-[114px] min-[380px]:w-[100px] lg:h-[178px] lg:w-[152px] xl:h-[186px] xl:w-[162px]",
);

type Props = {
  imageUrl?: string | null;
  anonymousGuest: boolean;
};

/** Обложка разминки на экране материала: тот же SafeImage/fallback, компактный слот. */
export function PatientDailyWarmupHeroCover({ imageUrl, anonymousGuest }: Props) {
  const heroImageUrl = stripApiMediaForAnonymousGuest(imageUrl ?? null, anonymousGuest);

  return (
    <div className={warmupDetailHeroImageSlotClass} aria-hidden>
      <PatientHomeSafeImage
        src={heroImageUrl}
        alt=""
        className="h-full w-full object-contain object-right-bottom drop-shadow-lg"
        loading="lazy"
        fallback={
          <div className="mb-1.5 mr-1.5 flex size-[80px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[380px]:size-[90px] lg:mb-2 lg:size-[150px] xl:size-[162px]">
            <Sparkles className="size-9 text-[var(--patient-color-primary)] opacity-80 min-[380px]:size-10 lg:size-[3.25rem] xl:size-14" />
          </div>
        }
      />
    </div>
  );
}
