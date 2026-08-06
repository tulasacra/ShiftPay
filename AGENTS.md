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
- **SideShift blocks shifts from the Cloud Agent VM's IP, so shifts cannot be created or polled here.** `curl -s https://sideshift.ai/api/v2/permissions` returns `{"createShift":false}` and `POST /v2/quotes` returns HTTP 403 `ACCESS_DENIED`, so the app shows the red "SideShift is not allowing shifts from this location" banner. This is an IP-based restriction on SideShift's side, not a bug, a missing key or a broken account: account bootstrap over GraphQL and the unauthenticated read endpoints still work. Do not spend time debugging it or routing around it. Everything up to the shift request is still testable in the browser — QR parsing, the payment details panel, the network picker, settings and history — and `npm test` covers the quote/shift request and response handling.
