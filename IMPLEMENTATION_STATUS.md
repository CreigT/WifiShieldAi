# WiFiShield AI V1.1 — Free + Pro
Sponsored by CREIGNIFICENT LLC.

## Current state (not production ready)
- **Free web application:** interactive public Wi-Fi safety education and questionnaire. It does not scan a user's Wi-Fi.
- **Windows inspector:** `inspector/windows_wifi_inspector.py` performs a real, read-only local check of Windows-reported Wi-Fi authentication, cipher, connection status and saved-profile count. It does not verify hotspot authenticity, inspect traffic, or send data to a server. Run with Python 3.10+ on Windows: `python inspector/windows_wifi_inspector.py`; user consent is requested before inspection.
- **Pro pricing:** proposed **$4.99/month**. The web interface describes Pro but does not collect payments.
- **Billing API foundation:** `billing/server.js` includes authenticated checkout, Stripe signature-verified webhooks, subscription-status and billing portal endpoints. Requires configuration, deployment and tests before accepting customers.
- **No secure premium distribution yet:** this public repository exposes the inspector source. The inspector is NOT paywalled. Do not charge for access or advertise a working premium scan until entitlement-gated distribution is implemented and validated.

## Backend setup (development only)
1. Set up a Supabase project and execute `billing/schema.sql`.
2. Set up a Stripe recurring $4.99/month price and webhook destination for `POST /stripe/webhook`. Subscribe to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
3. Configure the variables in `billing/.env.example` as server-side secrets. Never put a secret key in the GitHub Pages website or commit a real `.env`.
4. In `billing/`, run `npm install`, then `npm start` with the required environment variables.
5. Integrate a real Supabase login flow and call the API with its access token. Do not unlock Pro on the basis of a frontend flag or Stripe success URL alone.
6. Run end-to-end test subscriptions, cancellation, replayed webhook events, incorrect credentials, permission boundaries, and device compatibility before enabling payments.

## Security limitations / release gates
- GitHub Pages is static hosting. It cannot securely enforce a paid entitlement by itself.
- The inspector is **Windows only** and English-language `netsh` output parsing is not guaranteed on non-English installations.
- OS-reported WPA2/WPA3 does **not** prove a hotspot is legitimate or secure.
- Before production: deploy billing API securely, verify Supabase JWT issuer/JWKS compatibility, add durable idempotent webhook processing and reconciliation, confirm server-side entitlements, implement paid inspector distribution, run automated and real Windows tests, and obtain human approval.
- **GitHub Pages deployment has not been authorized by the owner.**
