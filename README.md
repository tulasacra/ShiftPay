# ShiftPay

Scan any supported crypto payment QR, open a fixed-rate BCH SideShift request, and launch a BCH wallet with the exact deposit address and amount.

## Development

- `npm install`
- Copy `.env.example` to `.env` and set `SIDESHIFT_SECRET` and `SIDESHIFT_AFFILIATE_ID` from your [SideShift account](https://sideshift.ai/api) (see [REST docs](https://docs.sideshift.ai/)).
- `npm run dev` — Vite serves the app and a same-origin proxy at `/api/sideshift` that calls SideShift with your secret (see `server/sideshiftProxy.mjs`).
- `npm run build`
- `npm run build:pages`
- `npm test`

Alternatively, run `npm run proxy` in another terminal (with the same env vars) if you want the proxy on `http://127.0.0.1:8787/api/sideshift` without using Vite’s middleware.

## GitHub Pages

- `npm run build:pages` builds the production bundle into `dist/`.
- The production bundle is path-safe and can be hosted from a repository subpath such as `https://<user>.github.io/ShiftPay/`.
- The included workflow supports GitHub Pages via GitHub Actions on pushes to `main` and `cursor/*`.
- In the repository settings, set Pages to use **GitHub Actions** as the source.

## Notes

- The web UI is static; authenticated SideShift calls go through a small proxy you run (Vite dev middleware, `npm run proxy`, or your own deployment) so `SIDESHIFT_SECRET` never ships to the browser. For GitHub Pages or any static host, set `VITE_SIDESHIFT_API_BASE` at build time to your deployed proxy’s URL (see `.env.example`).
- Supported payment QR schemes in this build: `bitcoin:`, `litecoin:`, `dogecoin:`, `dash:`, and `zcash:`.
