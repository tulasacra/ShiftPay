# ShiftPay

BCH (Bitcoin Cash) crypto payment application — "Scan any crypto payment code, pay with your BCH wallet."

## Cursor Cloud specific instructions

- Install dependencies with `npm install`.
- Start the local development server with `npm run dev`.
- Create a production build with `npm run build`.
- Create the GitHub Pages bundle with `npm run build:pages`.
- Run the parser/unit tests with `npm test`.
- The app is a static Vite PWA. It scans supported URI-based payment QRs in the browser and opens the hosted SideShift widget for fixed-rate order creation.
- SideShift fixed-rate API calls require a secret and are therefore not sent directly from the browser; the client uses the widget and listens for its `order`, `deposit`, and `settle` events.
- The production build uses relative asset paths so the generated `dist/` bundle can be served from a GitHub Pages repository subpath.
