# Spanvision Infra home, accounts and billing

Updated: **10 October 2026**.

These additions use the existing live site at `https://spanvision-infra.vercel.app/`. Home opens first and keeps the Spanvision Infra company heading, supplied logo and architecture animation. Pricing, FAQ, sign-in and create-account links sit in the main navigation; Tools opens the existing catalogue of all 16 workspaces. No separate site or replacement brand has been created. Dark remains the default; light mode and reduced motion are supported.

## Sign-up availability fix — 10 October 2026

When the authentication provider is unconfigured, account forms now disable submission and direct visitors to a local profile or anonymous tools. The submit handler also rejects programmatic submission in that state, preventing unnecessary credential requests and 503 console errors. Server-side setup checks remain in place. This does not activate real sign-up; complete the Supabase setup below.

## Current state

- Published to the existing `https://spanvision-infra.vercel.app/` production website on **10 October 2026**. Only the hub was deployed; the tool applications and Render services were not changed by this home-page update.
- Home, pricing, sign-in, sign-up, email-code verification, password reset and account screens are implemented.
- Server endpoints integrate with Supabase Auth and its PostgreSQL REST API. No passwords, access tokens or private provider keys are stored in browser local storage.
- Stripe hosted subscription checkout and billing portal are supported. Razorpay hosted subscription links are supported; provider notification emails supply the customer subscription link.
- Payment status is recorded from signed webhooks and a fresh provider lookup. A browser return or checkout redirect never marks a subscription paid.
- **No provider account, database project, SMTP account or payment credential has been configured by this work. Real authentication and payment processing remain inactive until those are supplied and tested.**
- The 16 tools keep their existing anonymous access. There are no paid tool restrictions, cloud draft synchronization, shared team projects or organization membership controls in this change. Team packaging remains a proposal. The designated super admin can manage online users' plan access.

## Super admin: users and plan access

The single designated administrator is **`spanvisioninfra.admin@gmail.com`**. This account receives Explorer, Studio and Team access and can open **Admin → Users & plan access** to view users, their provider subscriptions and manual access grants. No password is embedded in the application, and no real administrator account has been created yet: the owner confirmed that no Supabase project exists.

The admin code was published to the existing Vercel website on **10 October 2026**. Live admin endpoints return an authentication-required response to anonymous visitors and do not return user data. Administrator activation remains pending the steps below.

Activation requires all of the following:

1. Complete the Supabase/email/production environment setup below and run the updated `commerce/schema.sql` in the chosen project.
2. Register `spanvisioninfra.admin@gmail.com` through the normal sign-up flow and complete its email verification. Keep email confirmation enabled. Set a private password through the account flow; do not commit or share it in source files.
3. Copy that account's UUID from **Supabase Authentication → Users** into the server-only Vercel environment variable `SUPER_ADMIN_USER_ID`, then redeploy the hub. The verified email and pinned UUID must both match; an email address, browser field or user-editable signup metadata alone never grants admin access.
4. Sign in and open **Admin**. Other accounts, anonymous visitors and password-recovery sessions are rejected by the admin endpoints. There is no public role-assignment endpoint and no way to create additional super admins through this dashboard.

Plan administration:

- Users are listed 50 per page, with a name/email filter for the current page.
- **View plans** shows the selected user's subscriptions, current access and the last 20 manual changes.
- Grant Explorer, Studio or Team access, optionally with a future UTC expiry date, and provide a reason.
- Choose **Use subscription or free plan** to clear a manual grant. This restores access calculated from an active/trial subscription, or Explorer if none exists. An expired grant also falls back to the subscription/free plan. A manual grant takes precedence while active.
- Each save and its before/after audit entry commit in one PostgreSQL transaction. Tables and the mutation RPC are unavailable to anonymous/authenticated clients; only the server service role can invoke the RPC. Provider subscription records and actual billing charges are not changed by a manual grant.
- The super admin's own all-plan access cannot be downgraded through this form. This is account-level plan access; all existing anonymous tool workflows remain available, and separate tool applications do not yet enforce paid feature restrictions.

The authorization model follows Supabase's distinction between a verified user identity and user-editable metadata. See [Supabase user attributes](https://supabase.com/docs/guides/auth/users) and [server-only user listing](https://supabase.com/docs/reference/javascript/auth-admin-listusers).

### Admin verification

All 26 server tests cover the existing account/billing flows plus admin identity binding, metadata forgery, ordinary/anonymous/unverified access denial, recovery-session denial, pagination, input validation, plan mutations, billing separation and failed writes. `commerce/schema.test.mjs` executes the full migration twice against an isolated PGlite/PostgreSQL runtime and checks grants, clearing, database permissions and transaction rollback when audit insertion fails. This validates the SQL locally; it has not been applied to a real Supabase project.

For the isolated SQL check, set `PGLITE_MODULE` to your validation runtime's `@electric-sql/pglite/dist/index.js` path and run `node --wasm-num-compilation-tasks=1 --no-wasm-tier-up --test commerce/schema.test.mjs`. These flags limit compiler memory on this Windows machine. PGlite is a test-only dependency and is not bundled with the website or production function.

`qa/home-2026-10-10/verify-admin.mjs` checks denied real anonymous access and uses explicitly mocked admin/provider responses for the private dashboard, saving/clearing a grant, audit display, focus recovery, both themes and mobile layouts. Real admin sign-in and provider-backed user management still await project configuration.

### Verification record

The hub production build and all 15 account/billing server tests passed. Browser checks passed locally and against the live website for the default Home route, original company hero, navigation, FAQs, regional and annual draft prices, plan-preview dialog, dark/light appearance, sign-up validation and 320/390 px layouts. All 16 live toolkit links still use the existing themed splash route.

Email verification, sign-in, recovery and sign-out UI flows were checked against **mocked provider responses**. The real live configuration reports `authAvailable=false`, `pricingApproved=false` and checkout unavailable in all three regions; account submissions return an explicit setup-required response. No real email, authentication, database migration or payment-provider workflow was verified. Reports are under `qa/home-2026-10-10/`.

## Draft pricing

The owner requested sample values. These prices are a preview, not a live offer.

| Plan | India/month | US/month | UK/month |
| --- | --- | --- | --- |
| Explorer | ₹0 | $0 | £0 |
| Studio | ₹999 | $19 | £15 |
| Team | ₹2,999 | $49 | £39 |

Annual prices are ten times the monthly amount. Edit `commerce/catalog.mjs` to finalize prices and package features. `PRICING_APPROVED=false` blocks all paid checkout requests on the server. Provider price/plan records must exactly match the selected currency, amount and billing interval before a checkout link is created. Browser-supplied amounts are ignored.

## Hosting

| Part | Destination |
| --- | --- |
| Home, account UI and pricing | Existing `spanvision-infra` Vercel project |
| `/api/account/*`, `/api/billing/*` and `/api/admin/*` | Node 22 Vercel function, packaged by `deployment/package-commerce.mjs` |
| Identity, passwords and email verification | Supabase Auth in a project chosen by the owner |
| Customers, subscription snapshots, webhook receipts and checkout leases | PostgreSQL in the same Supabase project |
| Card/UPI details and recurring payment authorization | Hosted payment provider checkout |
| Existing FEM, BIM and STL services | Existing Render deployment; no changes required |

Singapore is a reasonable nearby location for an India-led account project and the existing Singapore Render services. This implementation uses Supabase-managed PostgreSQL and Auth; it does not connect to a new Render PostgreSQL instance. Changing database providers would require adapting the REST/RPC storage layer and selecting an identity service.

## Connect accounts

1. Create or choose a Supabase project. In its SQL editor, run `commerce/schema.sql`. No client-facing table policies are needed: billing tables are restricted to the server service role.
2. Enable email/password auth and email confirmation. Set the site's URL to the approved website address and configure production SMTP.
3. In the **Confirm signup** and **Reset password** email templates, display the verification code using `{{ .Token }}`. These screens use email codes and do not consume implicit-flow access tokens in URL fragments.
4. Add the server environment variables from `commerce/.env.example` to the **hub Vercel project**. Keep `SESSION_SECRET`, service role and payment secrets out of `VITE_*` variables and static files. Generate the session secret using the command in the template.
5. Set `SITE_URL=https://spanvision-infra.vercel.app` for production. For a separate preview deployment, set its exact origin separately. POST account and billing requests require a matching Origin header.
6. Check the project's auth rate limits, email delivery and abuse controls for the intended public launch. This application delegates authentication to Supabase instead of maintaining its own password database.

Sessions use authenticated encryption and an HttpOnly cookie with `SameSite=Lax`; production cookies are Secure. The cookie has a seven-day lifetime, while Supabase still verifies/revokes access tokens and handles refresh. Signing out revokes the local provider session and clears the cookie.

## Connect payments

1. Choose the approved provider based on the **merchant business**, not only the buyer's country. The default configuration selects Razorpay for India and Stripe for the US/UK. An India business can choose Razorpay for global buyers by setting `BILLING_PROVIDER_GLOBAL=razorpay`, subject to approved international payment support. Stripe's India onboarding is currently invitation-based.
2. Create test-mode subscription plans/prices matching each finalized catalogue amount and currency. Add the corresponding `STRIPE_PRICE_*` or `RAZORPAY_PLAN_*` IDs. The server does not create or silently change commercial prices.
3. Run the SQL migration before opening checkout. A database lease prevents concurrent checkout creation for one account; an unfinished same-plan checkout can return its existing hosted URL. After an ambiguous provider error the lease remains for up to 65 minutes, preventing accidental duplicate subscriptions.
4. Configure provider webhooks:
   - Stripe: `https://spanvision-infra.vercel.app/api/billing/webhook/stripe`, including `checkout.session.completed` and `customer.subscription.*` events.
   - Razorpay: `https://spanvision-infra.vercel.app/api/billing/webhook/razorpay`, including relevant `subscription.*` lifecycle events.
5. Add webhook secrets. Signatures are checked against raw request bytes; Stripe signatures have a five-minute timestamp tolerance. Processed event IDs are persisted for duplicate handling. A failed database write returns an error so the provider can retry.
6. Configure the Stripe customer portal when using Stripe. Razorpay customer management is through its subscription email link; subscription-change APIs and a dedicated cancellation UI are not included here.
7. Complete genuine provider sandbox tests: verification email, password recovery, payment authorization, renewal, failure, cancellation, webhook retry and duplicate events. SQL migrations and real provider workflows cannot be proven by local mocks alone.
8. Confirm final package benefits, tax handling, refund/cancellation terms, customer support details and required business/privacy policies. This implementation does not calculate GST/VAT or enable Stripe Tax automatically.
9. After approval and sandbox verification, set `PRICING_APPROVED=true` and use the approved live credentials and live plan IDs. Keep it false until the paid offer is ready.

## Local preview and verification

From the repository root, with Node and the existing dependencies installed:

```powershell
$env:PATH='C:/Windows/System32;' + $env:PATH
$env:TEMP='D:/SpanvisionToolchain/tmp'
$env:TMP=$env:TEMP
node --test commerce/server.test.mjs
```

Build the home page from **inside `suite-hub`**, then start its preview:

```powershell
Set-Location 'suite-hub'
node node_modules/vite/bin/vite.js build
Set-Location '..'
node commerce/preview.mjs
```

The preview serves `http://127.0.0.1:4231`. In another terminal, run `node qa/home-2026-10-10/verify-home.mjs`. Account credentials may be supplied as environment variables to the preview; it uses the local origin for CSRF checks. Vite development also mounts the account endpoints. Generated screenshots and results are under `qa/home-2026-10-10`.

For an interactive review of the admin dashboard without provider setup, run `node qa/home-2026-10-10/admin-preview.mjs` and open `http://127.0.0.1:4232/#admin`. This separate loopback-only QA server uses sample users and in-memory grants/audits. **Reset preview** clears those changes. It does not contact Supabase or payment providers and is not included in the Vercel or Render deployment. The production site has no mock-admin mode.

The test suite checks session tampering, secret exclusion, cross-origin requests, invalid login, draft checkout blocking, provider price validation, ownership persistence, raw webhook signatures and sign-out. Browser checks cover region prices, annual billing, modal focus, anonymous tools, real unconfigured-state responses and 320/390 px layouts in both modes. Sign-up/recovery browser success paths use explicitly mocked provider responses.

## Reference documentation

- [Supabase password authentication and email setup](https://supabase.com/docs/guides/auth/passwords)
- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)
- [Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Stripe India account availability](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india?locale=en-GB)
- [Razorpay subscription integration](https://razorpay.com/docs/payments/subscriptions/integration-guide/)
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)
- [Vercel function packaging](https://vercel.com/docs/build-output-api/primitives)
