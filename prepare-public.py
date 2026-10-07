from pathlib import Path
import base64
import re
import zipfile
import hashlib

root = Path(__file__).resolve().parent
public = root / "public"
public.mkdir(exist_ok=True)
allowed = {"index.html", "about.html", "style.css", "404.html", "_headers", "_redirects", "robots.txt", "sitemap.xml", "favicon-unset.svg", "favicon-earth.svg", "favicon-earth.ico", "favicon.ico", "apple-touch-icon-earth.png"}
assets = {"assets/boulder-relief.avif", "assets/ultralight.png", "assets/source-serif-regular.woff2", "assets/source-serif-semibold.woff2", "assets/source-serif-LICENSE.md"}
allowed |= assets
allowed.add("preview.js")
unexpected = {p.relative_to(public).as_posix() for p in public.rglob("*") if p.is_file()} - allowed
if unexpected:
    raise SystemExit(f"Unexpected publication files: {sorted(unexpected)}")

# The approved pages are already publication-ready. Preserve their exact bytes.
style_hashes = set()
for name in ("index.html", "about.html"):
    source = (root / name).read_bytes()
    (public / name).write_bytes(source)
    for css in re.findall(rb"<style>(.*?)</style>", source, re.DOTALL):
        digest = base64.b64encode(hashlib.sha256(css).digest()).decode("ascii")
        style_hashes.add(f"'sha256-{digest}'")
style_sources = " ".join(["'self'", *sorted(style_hashes)])

for asset in ("style.css", "preview.js", "favicon-unset.svg", "favicon-earth.svg", "favicon-earth.ico", "favicon.ico", "apple-touch-icon-earth.png"):
    (public / asset).write_bytes((root / asset).read_bytes())
for asset in assets:
    target = public / asset
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((root / asset).read_bytes())
(public / "404.html").write_text('''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex">
  <title>Page not found — Tim Weigelt</title>
  <link rel="icon" href="/favicon-earth.ico" type="image/x-icon" sizes="16x16 32x32 48x48">
  <link rel="icon" href="/favicon-earth.svg" type="image/svg+xml" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon-earth.png" sizes="180x180">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main>
    <h1>Page not found.</h1>
    <p>That page isn’t here. <a href="/">Return home</a>.</p>
  </main>
</body>
</html>
''')
# Preserve approved HTML, including mailto links, through Cloudflare's edge.
(public / "_headers").write_text(f'''/*
  Cache-Control: public, max-age=0, must-revalidate, no-transform
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src {style_sources}; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000

/favicon-earth.ico
  Content-Type: image/x-icon

/favicon.ico
  Content-Type: image/x-icon
''')
(public / "_redirects").write_text('''# Hostname canonicalization is configured in Cloudflare Redirect Rules.
''')
(public / "robots.txt").write_text('''User-agent: *
Allow: /

Sitemap: https://timweigelt.com/sitemap.xml
''')
(public / "sitemap.xml").write_text('''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://timweigelt.com/</loc></url>
  <url><loc>https://timweigelt.com/about</loc></url>
</urlset>
''')
assert {p.relative_to(public).as_posix() for p in public.rglob("*") if p.is_file()} == allowed
for name in ("index.html", "about.html"):
    assert (public / name).read_bytes() == (root / name).read_bytes()
    text = (public / name).read_text()
    assert 'noindex' not in text
    assert 'localhost' not in text
    assert '@gmail.com' not in text and '@proton.me' not in text
with zipfile.ZipFile(root / "site-upload.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(allowed):
        archive.write(public / name, name)
print("Prepared only:", ", ".join(sorted(allowed)))
