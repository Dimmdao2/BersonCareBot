import Link from "next/link";

type FeatureCardProps = {
  title: string;
  description: string;
  href?: string;
  status?: "available" | "coming-soon" | "locked";
};

export function FeatureCard({ title, description, href, status = "available" }: FeatureCardProps) {
  const content = (
    <>
      <div className="feature-card__meta">
        <span className={`status-pill status-pill--${status}`}>{status.replace("-", " ")}</span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </>
  );

  if (!href || status === "locked") {
    return <article className="feature-card">{content}</article>;
  }

  return (
    <Link href={href} className="feature-card feature-card--link">
      {content}
    </Link>
  );
}
