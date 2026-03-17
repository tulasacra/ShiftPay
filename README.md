# ShiftPay

Scan any supported crypto payment QR, open a fixed-rate BCH SideShift request, and launch a BCH wallet with the exact deposit address and amount.

## Development

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run build:pages`
- `npm test`

## GitHub Pages

- `npm run build:pages` builds the production bundle into `dist/`.
- The production bundle is path-safe and can be hosted from a repository subpath such as `https://<user>.github.io/ShiftPay/`.
- The included workflow supports GitHub Pages via GitHub Actions on pushes to `main` and `cursor/*`.
- In the repository settings, set Pages to use **GitHub Actions** as the source.

## Notes

- The app is fully static/serverless and runs in the browser.
- Fixed-rate SideShift API creation requires a private secret, so the app uses SideShift's hosted widget instead of calling the authenticated REST endpoints directly from the client.
- Supported payment QR schemes in this build: `bitcoin:`, `litecoin:`, `dogecoin:`, `dash:`, and `zcash:`.
