# ShiftPay

BCH (Bitcoin Cash) crypto payment application — "Scan any crypto payment code, pay with your BCH wallet."

## Cursor Cloud specific instructions

- Install dependencies with `npm install`.
- Start the local development server with `npm run dev`.
- Create a production build with `npm run build`.
- Create the GitHub Pages bundle with `npm run build:pages`.
- Run the parser/unit tests with `npm test`.
- The app is a static Vite PWA. It scans supported URI-based payment QRs in the browser and creates fixed-rate BCH→* shifts via the SideShift REST API ([docs](https://docs.sideshift.ai/)) through a server-side proxy (`server/sideshiftProxy.mjs`, wired in Vite dev or `npm run proxy`). The client never sees `SIDESHIFT_SECRET`; optional `VITE_SIDESHIFT_API_BASE` points production builds at a deployed proxy. Shift lifecycle updates use polling on `GET /v2/shifts/:id` through the same proxy.
- The production build uses relative asset paths so the generated `dist/` bundle can be served from a GitHub Pages repository subpath.
