import Link from "next/link";
import type { ResolvedUsefulPostCard } from "@/modules/patient-home/patientHomeResolvers";
import { cn } from "@/lib/utils";
import { patientHomeUsefulPostCardShellClass, patientHomeUsefulPostCoverBadgeClass } from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";

type Props = {
  post: ResolvedUsefulPostCard;
};

export function PatientHomeUsefulPostCard({ post }: Props) {
  return (
    <section
      aria-labelledby="patient-home-useful-post-heading"
      className="flex h-full min-h-[172px] min-w-0 max-w-full flex-col lg:min-h-0"
    >
      <Link
        href={post.href}
        prefetch={false}
        aria-label={post.showTitle ? undefined : post.title}
        className={cn(
          patientHomeUsefulPostCardShellClass,
          "group relative isolate flex h-full min-h-[172px] min-w-0 max-w-full flex-1 overflow-hidden p-0 lg:min-h-[300px]",
        )}
      >
        <PatientHomeSafeImage
          src={post.imageUrl}
          alt=""
          className="absolute inset-0 z-0 block h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
          fallback={
            <div className="absolute inset-0 bg-[linear-gradient(205deg,#f1ecf1_10%,#f9f4ff_52%,#fafaf5_80%)]" />
          }
        />
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        {post.badgeLabel ?
          <span
            className={cn(
              patientHomeUsefulPostCoverBadgeClass,
              "pointer-events-none absolute right-10 top-4 z-[3] max-w-[calc(100%-5rem)] max-[360px]:right-8 max-[360px]:top-3 max-[360px]:max-w-[7.5rem] lg:right-5 lg:top-5 lg:max-w-[calc(100%-2.5rem)]",
            )}
          >
            {post.badgeLabel}
          </span>
        : null}
        <div className="relative z-[2] flex min-h-[172px] flex-col justify-end p-4 lg:h-full lg:p-5">
          <h2
            id="patient-home-useful-post-heading"
            className={cn(
              post.showTitle
                ? "line-clamp-3 text-xl font-semibold leading-6 tracking-[-0.015em] text-white lg:text-2xl lg:leading-7"
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
