#!/usr/bin/env python3
"""
Process raw chromium DOM dumps into clean, self-contained static HTML snapshots.
Inlines Next.js CSS, strips scripts/hydration markers, injects theme-e.css.
"""

import re
import sys
import urllib.request
from pathlib import Path

BASE_URL = "http://127.0.0.1:5200"
LAB_DIR = Path(__file__).parent
OUT_DIR = LAB_DIR

PAGES = [
    ("dashboard", "/tmp/raw_dashboard.html"),
    ("catalog-exercises", "/tmp/raw_catalog-exercises.html"),
    ("comms", "/tmp/raw_comms.html"),
    ("schedule", "/tmp/raw_schedule.html"),
    ("patients", "/tmp/raw_patients.html"),
]


def fetch_css(href: str) -> str:
    """Fetch CSS content from the dev server."""
    url = BASE_URL + href
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  WARNING: could not fetch {url}: {e}", file=sys.stderr)
        return f"/* FAILED TO FETCH: {href} */"


def process_page(name: str, raw_path: str) -> int:
    raw = Path(raw_path).read_text(encoding="utf-8", errors="replace")

    # ------------------------------------------------------------------ #
    # 1. Find all /_next/static/...css hrefs (including query strings)
    # ------------------------------------------------------------------ #
    css_hrefs = re.findall(
        r'href="(/_next/static/[^"]*?\.css(?:\?[^"]*)?)"',
        raw,
    )
    # Deduplicate while preserving order
    seen = set()
    css_hrefs_unique = []
    for h in css_hrefs:
        if h not in seen:
            seen.add(h)
            css_hrefs_unique.append(h)

    print(f"  Found {len(css_hrefs_unique)} CSS files to inline")

    # ------------------------------------------------------------------ #
    # 2. Fetch and inline CSS
    # ------------------------------------------------------------------ #
    inlined_css_parts = []
    for href in css_hrefs_unique:
        # URL-decode common escapes for display; fetch original href
        display = href.replace("%5B", "[").replace("%5D", "]")
        print(f"    Inlining: {display}")
        css_content = fetch_css(href)
        inlined_css_parts.append(f"/* Source: {display} */\n{css_content}")

    inlined_block = (
        '<style data-inlined-css>\n'
        + "\n\n".join(inlined_css_parts)
        + '\n</style>'
    )

    # Insert the inlined CSS block before </head>
    if "</head>" in raw:
        raw = raw.replace("</head>", inlined_block + "\n</head>", 1)
    else:
        # Fallback: insert at start of <body>
        raw = raw.replace("<body", inlined_block + "\n<body", 1)

    # ------------------------------------------------------------------ #
    # 3. Remove all <script> blocks and self-closing <script> tags
    # ------------------------------------------------------------------ #
    # Multi-line script blocks with content
    raw = re.sub(r'<script\b[^>]*>.*?</script>', '', raw, flags=re.DOTALL)
    # Self-closing scripts
    raw = re.sub(r'<script\b[^>]*/>', '', raw)

    # ------------------------------------------------------------------ #
    # 4. Remove <link> / preload tags whose href contains /_next/
    # ------------------------------------------------------------------ #
    raw = re.sub(
        r'<link\b[^>]*\bhref="[^"]*/_next/[^"]*"[^>]*/?>',
        '',
        raw,
    )
    # Also remove <link> with as= (preloads) pointing to /_next/
    raw = re.sub(
        r'<link\b[^>]*/_next/[^>]*/?>',
        '',
        raw,
    )

    # ------------------------------------------------------------------ #
    # 5. Remove Next.js hydration comment markers
    # ------------------------------------------------------------------ #
    raw = re.sub(r'<!--\$(?:--\?>|[^-])*?-->', '', raw)
    raw = raw.replace('<!--/$-->', '')
    raw = raw.replace('<!--/$?-->', '')
    raw = raw.replace('<!--$-->', '')
    raw = raw.replace('<!--$?-->', '')
    raw = raw.replace('<!--$!-->', '')

    # ------------------------------------------------------------------ #
    # 6. Insert <link rel="stylesheet" href="theme-e.css"> before </body>
    # ------------------------------------------------------------------ #
    theme_link = '<link rel="stylesheet" href="theme-e.css">'
    if "</body>" in raw:
        raw = raw.replace("</body>", theme_link + "\n</body>", 1)
    else:
        raw = raw + "\n" + theme_link

    # ------------------------------------------------------------------ #
    # 7. Write output
    # ------------------------------------------------------------------ #
    out_path = OUT_DIR / f"{name}.html"
    out_path.write_text(raw, encoding="utf-8")
    size = out_path.stat().st_size
    print(f"  Written: {out_path} ({size:,} bytes)")
    return size


def main():
    print(f"Processing {len(PAGES)} pages...")
    results = []
    for name, raw_path in PAGES:
        print(f"\n[{name}]")
        if not Path(raw_path).exists():
            print(f"  ERROR: raw file not found: {raw_path}")
            results.append((name, 0, False))
            continue
        try:
            size = process_page(name, raw_path)
            results.append((name, size, True))
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            results.append((name, 0, False))

    print("\n\nSummary:")
    print(f"{'Name':<25} {'Bytes':>10} {'OK':>5}")
    print("-" * 45)
    for name, size, ok in results:
        print(f"{name:<25} {size:>10,} {'yes' if ok else 'FAIL':>5}")


if __name__ == "__main__":
    main()
