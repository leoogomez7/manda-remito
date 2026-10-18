# Turso cloud persistence setup

The app stores each authenticated account's company profile, clients, remitos, saved drafts, the draft currently being edited, and trash entries in Turso. The Vercel API verifies the signed Kinde ID token and uses its immutable `sub` claim as the database owner; the browser never receives the Turso token. SQLite tables are created automatically when the first authenticated request reaches `/api/data`.

## 1. Create the Turso database

Install and authenticate the Turso CLI using the instructions in the Turso dashboard, then create a database in a region near the app's users. Get its URL and create a database auth token. Keep the token private.

## 2. Configure Vercel environment variables

In the Vercel project's **Settings → Environment Variables**, add these for Production (and Preview/Development if needed):

- `TURSO_DATABASE_URL` — URL returned for the Turso database.
- `TURSO_AUTH_TOKEN` — token created for that database. This is a secret; do not prefix it with `VITE_`.
- `KINDE_ISSUER_URL` — the same Kinde tenant URL configured as `DOMAIN_USER`, for example `https://tenant.kinde.com`.
- `KINDE_CLIENT_ID` — the same Kinde application client ID configured as `AUTH_USER`.

The browser-side Kinde variables remain `DOMAIN_USER`, `AUTH_USER`, `CODE_ORG`, and optionally `AUTH_CONNECTION_ID` as currently configured. After saving variables, redeploy the app. `.env.example` documents the names without containing real credentials.

## Mercado Pago Checkout Pro

To create a Mercado Pago payment link after the remito is confirmed, add these Vercel environment variables and redeploy:

- `MERCADOPAGO_ACCESS_TOKEN` — secret access token; it is only read by `/api/create-payment-preference` and must never use a `VITE_` prefix.
- `MERCADOPAGO_PUBLIC_KEY` — public key retained for client-side Mercado Pago SDK/Brick integrations. The current Checkout Pro redirect does not need to expose or use it.
- `APP_URL` — optional canonical HTTPS origin used for Mercado Pago return URLs. If omitted, the API uses the request origin.
- `CODE` — optional server-only promotional code. Entering this code in the remito confirmation modal applies a 100% discount, saves the remito, and skips Mercado Pago. Do not add a `VITE_` prefix.

The confirmation modal lets the user return to editing or confirm and proceed to checkout. The API authenticates the Kinde user and creates a preference through Mercado Pago; the browser only receives the checkout URL. Configure live or test credentials consistently. The current integration redirects to Mercado Pago but does not yet process payment webhooks or automatically mark remitos as paid when Mercado Pago confirms a payment.

## 3. First login and data migration

Sign in to the deployed app. The first authenticated load creates the Turso tables, copies this browser's existing invoices, drafts, trash entries, clients, profile, and in-progress draft to the signed-in account when no cloud copy exists, and then loads the cloud copy. Keep the original device/browser data until migration has completed successfully. Subsequent signed-in devices load the same account's Turso data. Saved drafts in `/borradores` and edits opened into `/nueva` are both synchronized.

While the account is being synchronized, the app displays a loading state. If configuration or network access fails, it shows an error and a retry button rather than silently showing another account's local cache.

## Security and ownership

All database reads and writes go through `api/data.ts` (the project must be deployed on Vercel, where this file runs as a serverless API function). It verifies Kinde's signature, issuer and client audience server-side, then scopes every SQL statement to the verified token subject. SQL values are parameterized. The Turso auth token must only be configured as a server environment secret. Local Vite preview alone does not provide `/api/data` or connect to Turso.

The current local cache remains for fast loading and offline continuity; pending edits are queued in that browser and retried on the next authenticated startup. A browser cache is not a substitute for a successful cloud sync, so verify the initial connection on the deployed app.

Sequential `MF-000001` invoice numbers are allocated atomically by Turso per account. Lettered settlement receipts (`MF-000001-A`, `...-B`) remain attached to their parent number.
