import Link from "next/link";
import type { CSSProperties } from "react";

/** Тот же каркас и стили, что у встроенной 404 Next.js (`HTTPAccessErrorFallback`). */
const outer: CSSProperties = {
  fontFamily:
    'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
  height: "100vh",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const h1: CSSProperties = {
  display: "inline-block",
  margin: "0 20px 0 0",
  padding: "0 23px 0 0",
  fontSize: 24,
  fontWeight: 500,
  verticalAlign: "top",
  lineHeight: "49px",
};

const descWrap: CSSProperties = { display: "inline-block" };

const h2: CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  lineHeight: "49px",
  margin: 0,
};

const linkWrap: CSSProperties = {
  marginTop: 24,
  fontSize: 14,
  fontWeight: 400,
};

const link: CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
};

export default function NotFound() {
  return (
    <div style={outer}>
      <div>
        <style
          dangerouslySetInnerHTML={{
            __html:
              "body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}",
          }}
        />
        <h1 className="next-error-h1" style={h1}>
          404
        </h1>
        <div style={descWrap}>
          <h2 style={h2}>Страница не найдена</h2>
        </div>
      </div>
      <div style={linkWrap}>
        <Link href="/" style={link}>
          На главную
        </Link>
      </div>
    </div>
  );
}
