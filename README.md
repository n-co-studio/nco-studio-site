# nco.studio

Static site for n'co studio. Two pages, no build step, no framework.

- `index.html` — landing page
- `web-editor/privacy/index.html` — privacy policy for the Web Editor Chrome extension
- `404.html`, `favicon.svg`, `robots.txt`, `sitemap.xml`

## Hosting

DigitalOcean App Platform static site (`n-co-studio/nco-studio-site`, branch `main`).

- Source dir `/`, output dir auto, no build command
- Auto-deploy on push to `main`
- Default URL: https://plankton-app-8sege.ondigitalocean.app
- 404s fall through to `404.html` automatically

## DNS

Registrar: Squarespace. Authoritative DNS: **Google Cloud DNS** (ns-cloud-e1..e4.googledomains.com).
Nameservers stay put — App Platform serves apex domains via static ingress IPs.

    nco.studio.       A   162.159.140.98
    nco.studio.       A   172.66.0.96
    www.nco.studio.   A   162.159.140.98
    www.nco.studio.   A   172.66.0.96

Left untouched: Google Workspace MX, `v=spf1 include:_spf.google.com ~all`, and the
`google-site-verification=` TXT record.

## Local preview

    npx serve .
