# ShiftPay

Scan any supported crypto payment QR, open a fixed-rate BCH SideShift request, and launch a BCH wallet with the exact deposit address and amount.

## Development

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run build:pages`
- `npm test`

## SideShift API keys (each user)

The app stays **fully static / serverless**. It calls the [SideShift REST API](https://docs.sideshift.ai/) directly from the browser (SideShift enables CORS for `x-sideshift-secret`).

A SideShift account is created when you visit the **[account page](https://sideshift.ai/account)**. Each user copies their **private key** (`x-sideshift-secret`) and **account ID** (affiliate id) into ShiftPay. Keys are stored only in **that user’s browser** (`localStorage` on the device).

## GitHub Pages

- `npm run build:pages` builds the production bundle into `dist/`.
- The production bundle is path-safe and can be hosted from a repository subpath such as `https://<user>.github.io/ShiftPay/`.
- The included workflow runs GitHub Actions on pushes to `main` and `cursor/*`; **only `main` deploys** to Pages (so protected `github-pages` environments stay valid). Merge to `main` to publish.
- In the repository settings, set Pages to use **GitHub Actions** as the source.

## Notes

- Treat stored keys like cash: anyone with access to this device or browser profile can use them. Users should **clear keys** on shared machines.
- Supported payment QR schemes in this build: `bitcoin:`, `litecoin:`, `dogecoin:`, `dash:`, and `zcash:`.
