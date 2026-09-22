# nco.studio

Static site for n'co studio. Two pages, no build step, no framework.

- `index.html` — landing page
- `web-editor/privacy/index.html` — privacy policy for the Web Editor Chrome extension
- `404.html`, `favicon.svg`, `robots.txt`, `sitemap.xml`

## Hosting

DigitalOcean App Platform static site.

- Source: this repo, branch `main`, source dir `/`
- Output dir: `/` (no build command)
- Index document: `index.html`
- Error document: `404.html`

## DNS

Domain registered at Squarespace, records point at the App Platform app.

## Local preview

    npx serve .
