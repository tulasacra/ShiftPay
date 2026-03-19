# ShiftPay

BCH (Bitcoin Cash) crypto payment application — "Scan any crypto payment code, pay with your BCH wallet."

## Cursor Cloud specific instructions

- Install dependencies with `npm install`.
- Start the local development server with `npm run dev`.
- Create a production build with `npm run build`.
- Create the GitHub Pages bundle with `npm run build:pages`.
- Run the parser/unit tests with `npm test`.
- The app is a static Vite PWA. It scans supported URI-based payment QRs in the browser and creates fixed-rate BCH→* shifts via the SideShift REST API ([docs](https://docs.sideshift.ai/)) using **per-user** credentials: visiting [sideshift.ai/account](https://sideshift.ai/account) provisions an account; users paste **private key** + **account ID** into the app; values persist in `localStorage` only. No backend or shared API secret. Shift status uses polling on `GET /v2/shifts/:id` with the same user key.
- The production build uses relative asset paths so the generated `dist/` bundle can be served from a GitHub Pages repository subpath.
