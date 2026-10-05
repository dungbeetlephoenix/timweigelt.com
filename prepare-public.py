from pathlib import Path
from html import escape
import re
import zipfile
import hashlib

root = Path(__file__).resolve().parent
public = root / "public"
public.mkdir(exist_ok=True)
style_version = hashlib.sha256((root / "style.css").read_bytes()).hexdigest()[:12]
allowed = {"index.html", "about.html", "style.css", "404.html", "_headers", "_redirects", "robots.txt", "sitemap.xml", "favicon-unset.svg", "favicon-earth.svg", "favicon-earth.ico", "favicon.ico", "apple-touch-icon-earth.png"}
unexpected = {p.name for p in public.iterdir()} - allowed
if unexpected:
    raise SystemExit(f"Unexpected publication files: {sorted(unexpected)}")

# Only these source files are public. Never copy the surrounding draft folder.
for name, path, title in [("index.html", "/", "Tim Weigelt"), ("about.html", "/about", "About — Tim Weigelt")]:
    source = (root / name).read_text()
    source = source.replace('  <meta name="robots" content="noindex, nofollow">\n', '')
    source = source.replace('href="index.html"', 'href="/"').replace('href="about.html"', 'href="/about"').replace('href="style.css"', f'href="/style.css?v={style_version}"')
    description = re.search(r'<meta name="description" content="([^"]+)"', source).group(1)
    metadata = f'''  <link rel="canonical" href="https://timweigelt.com{path}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{escape(title, quote=True)}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="https://timweigelt.com{path}">
'''
    (public / name).write_text(source.replace('</head>', metadata + '</head>'))

for asset in ("style.css", "favicon-unset.svg", "favicon-earth.svg", "favicon-earth.ico", "favicon.ico", "apple-touch-icon-earth.png"):
    (public / asset).write_bytes((root / asset).read_bytes())
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
(public / "_headers").write_text('''/*
  Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests
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
assert {p.name for p in public.iterdir()} == allowed
for name in ("index.html", "about.html"):
    text = (public / name).read_text()
    assert 'noindex' not in text
    assert 'localhost' not in text
    assert '@gmail.com' not in text and '@proton.me' not in text
with zipfile.ZipFile(root / "site-upload.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(allowed):
        archive.write(public / name, name)
print("Prepared only:", ", ".join(sorted(allowed)))
