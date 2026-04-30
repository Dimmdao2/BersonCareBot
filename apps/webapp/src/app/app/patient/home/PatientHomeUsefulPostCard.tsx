import Link from "next/link";
import type { ResolvedUsefulPostCard } from "@/modules/patient-home/patientHomeResolvers";
import { cn } from "@/lib/utils";
import { patientBadgePrimaryClass, patientHomeUsefulPostCardShellClass } from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";

type Props = {
  post: ResolvedUsefulPostCard;
};

export function PatientHomeUsefulPostCard({ post }: Props) {
  return (
    <section aria-labelledby="patient-home-useful-post-heading" className="h-full">
      <Link
        href={post.href}
        prefetch={false}
        aria-label={post.showTitle ? undefined : post.title}
        className={cn(
          patientHomeUsefulPostCardShellClass,
          "group relative isolate block min-h-[172px] overflow-hidden p-0 lg:h-[300px] lg:min-h-0",
        )}
      >
        <PatientHomeSafeImage
          src={post.imageUrl}
          alt=""
          className="absolute inset-0 z-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
          fallback={
            <div className="absolute inset-0 bg-[linear-gradient(205deg,#f1ecf1_10%,#f9f4ff_52%,#fafaf5_80%)]" />
          }
        />
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="relative z-[2] flex min-h-[172px] flex-col justify-end p-4 lg:h-full lg:p-5">
          {post.badgeLabel ?
            <span
              className={cn(
                patientBadgePrimaryClass,
                "mb-2 h-6 w-fit bg-white/90 px-2.5 text-[11px] font-semibold uppercase text-[var(--patient-color-primary)]",
              )}
            >
              {post.badgeLabel}
            </span>
          : null}
          <h2
            id="patient-home-useful-post-heading"
            className={cn(
              post.showTitle
                ? "line-clamp-3 text-xl font-medium leading-6 tracking-[-0.015em] text-white lg:text-2xl lg:leading-7"
                : "sr-only",
            )}
          >
            {post.title}
          </h2>
        </div>
      </Link>
    </section>
  );
}
