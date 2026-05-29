import { NextResponse } from "next/server";

/** Лёгкий скрипт встраивания: iframe / popup / переход по ссылке на /book. */
const EMBED_SCRIPT = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var base = (script.getAttribute("data-base") || "").replace(/\\/$/, "");
  if (!base) {
    try {
      base = new URL(script.src).origin;
    } catch (e) {
      return;
    }
  }
  var mode = (script.getAttribute("data-mode") || "iframe").toLowerCase();
  var params = new URLSearchParams();
  var pass = [
    "city",
    "cityCode",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "source",
    "branch",
    "specialist",
    "service",
    "promo",
    "embed",
  ];
  pass.forEach(function (key) {
    var v = script.getAttribute("data-" + key.replace(/_/g, "-"));
    if (v) params.set(key, v);
  });
  if (mode === "iframe") params.set("embed", "iframe");
  if (mode === "popup") params.set("embed", "popup");
  var url = base + "/book/new" + (params.toString() ? "?" + params.toString() : "");

  if (mode === "popup") {
    window.open(url, "berson_booking", "width=480,height=800,scrollbars=yes");
    return;
  }
  if (mode === "link") {
    window.location.href = url;
    return;
  }
  var w = script.getAttribute("data-width") || "100%";
  var h = script.getAttribute("data-height") || "720";
  var frame = document.createElement("iframe");
  frame.src = url;
  frame.title = "Запись";
  frame.setAttribute("loading", "lazy");
  frame.style.border = "0";
  frame.style.width = w;
  frame.style.height = h;
  frame.allow = "clipboard-write";
  var host = script.parentNode;
  if (host) host.insertBefore(frame, script.nextSibling);
})();`;

export async function GET() {
  return new NextResponse(EMBED_SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
