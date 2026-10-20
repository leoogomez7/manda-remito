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
- `GRATIS2026` — server-only value of the promotional code that bonifies the ARS 2,000 remito-generation service fee. The code never changes the remito's item values, client deposits, totals, or balance. Enter the same value in the confirmation modal to generate without paying the fee. Do not add a `VITE_` prefix.

The confirmation modal shows the remito totals separately from the ARS 2,000 generation fee. Without a valid code, the authenticated API creates a Mercado Pago preference for the fixed ARS fee; the remito is not saved or generated until the app verifies an approved payment with Mercado Pago. With a valid code, the fee is waived and the remito is generated immediately. Configure live or test credentials consistently. The current integration verifies the return from Checkout Pro; it does not use payment webhooks to handle cases where the user does not return to the app.

### Optional prepaid plans

The `Planes de pago` page offers one-time purchases (no automatic renewal): Bronce (ARS 9,999 / 1 month), Plata (ARS 19,999 / 3 months), Oro (ARS 32,999 / 6 months), and Platino (ARS 52,999 / 12 months). An approved payment starts the exact calendar-month term at approval time and waives the ARS 2,000 individual generation fee while active. Without an active plan, users can continue paying ARS 2,000 per remito. The same server-only `GRATIS2026` configured code can also activate a selected plan at no cost for its full term. Plan checkout and approval verification use the existing server-only `MERCADOPAGO_ACCESS_TOKEN`; plan ownership, purchase, and expiration are verified/stored in Turso using the existing `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` plus authenticated Kinde identity. No extra environment variables are needed.

## 3. First login and data migration

Sign in to the deployed app. The first authenticated load creates the Turso tables, imports this browser's existing invoices, drafts, trash entries, clients, profile, working draft, and queued changes that are not already in the cloud, then removes the migrated app data from localStorage. Turso is the source of truth. For faster subsequent startup, the app keeps a per-account read snapshot in IndexedDB; it displays that snapshot immediately and revalidates against Turso in the background. All persistent writes still go to Turso. Subsequent signed-in devices load the same account's data. Saved drafts in `/borradores` and edits opened into `/nueva` are synchronized.

While the account is being synchronized, the app displays a loading state. If configuration or network access fails, it shows an error and a retry button rather than silently showing another account's local cache.

## Security and ownership

All database reads and writes go through `api/data.ts` (the project must be deployed on Vercel, where this file runs as a serverless API function). It verifies Kinde's signature, issuer and client audience server-side, then scopes every SQL statement to the verified token subject. SQL values are parameterized. The Turso auth token must only be configured as a server environment secret. Local Vite preview alone does not provide `/api/data` or connect to Turso.

The app requires connectivity to Turso to persist changes. Pending writes are kept in memory and retried while the session remains open; do not close/reload the app until a save confirms synchronization. The IndexedDB snapshot is only a startup optimization and can be refreshed from Turso on each device.

Sequential `MF-000001` invoice numbers are allocated atomically by Turso per account. Lettered settlement receipts (`MF-000001-A`, `...-B`) remain attached to their parent number.
