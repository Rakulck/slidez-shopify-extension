## App Overview
virtual-tryon-app (Slidez Shopify Extension) is a Shopify App built to provide virtual try-on functionality for merchants. It integrates directly into the Shopify ecosystem, offering both an embedded Admin dashboard and storefront features via theme extensions and an app proxy.

## Platform
- **Shopify Admin**: Embedded App Dashboard
- **Shopify Storefront**: Theme App Extension & App Proxy

## Tech Stack
- **Framework**: Remix (Node.js >= 20.19)
- **Build Tool**: Vite
- **UI & Presentation**: React 18, Shopify Polaris, App Bridge React 
- **Database & ORM**: Prisma (Session storage and app state)
- **Shopify Integration**: @shopify/shopify-app-remix, GraphQL Admin API
- **Proxy/External APIs**: Firebase (via proxy endpoints)

## Folder Structure
- `app/` — Core Remix application code
  - `components/` — Shared reusable UI components
  - `routes/` — Remix routes handling UI pages (settings, products, billing), webhooks, and APIs (firebase-proxy, product-check)
  - `db.server.ts` — Prisma database connection
  - `shopify.server.ts` — Shopify app configuration and authentication context
- `extensions/` — Shopify App Extensions
  - `theme-extension/` — Storefront UI extensions
- `prisma/` — Database schema definitions for Prisma

## Third Party Services
- **Shopify** — Auth, App Bridge, Billing, Webhooks, and Storefront APIs
- **Firebase** — External backend integrated via a dedicated proxy route (`api.firebase-proxy.tsx`)

## Key Features
- **Virtual Try-On Storefront Integration** — Using Shopify app proxy at `/apps/try-on` linked to `api.product-check.tsx`.
- **Embedded Admin Dashboard** — Built with Shopify Polaris for high-quality merchant UI (Settings, Products, Billing).
- **Theme Extension** — Injected storefront blocks/snippets for try-on functionality.
- **Webhook Subscriptions** — Handles app lifecycle events such as `app/uninstalled` and `app/scopes_update`.

## Key Decisions
- **Remix over Express/Next.js** — The app follows Shopify's officially supported Remix template architecture.
- **Embedded App** — Configured to run inside the Shopify Admin iFrame (`embedded = true` in `shopify.app.toml`) ensuring a seamless merchant experience.
- **Prisma Session Storage** — Uses `@shopify/shopify-app-session-storage-prisma` to securely manage merchant auth tokens and session states.
- **Firebase Proxying** — Routing Firebase requests through the app's backend (`api.firebase-proxy.tsx`) to avoid exposing credentials and to bypass cross-origin issues on the storefront.

## Known Issues / Things That Broke Before
- **Embedded Navigation** — Using standard HTML `<a>` tags breaks the iFrame routing. All navigation must use Remix `<Link>` or App Bridge utilities.
- **Session DB Desync** — Deleting `prisma/dev.sqlite` without reinstalling the app on the dev store can cause OAuth loops and broken development sessions.
- **Webhook HMAC failures** — Manual webhooks trigger failures; rely on `shopify.app.toml` configurations for Shopify to automatically manage subscriptions on deploy.

## Do Not Touch
- **`app/shopify.server.ts`**: The core authentication pipeline. Modifying this without care will break OAuth and App Bridge verification.
- **`shopify.app.toml`**: Source of truth for API scopes and App proxies. Ensure changes are synced via the CLI (`npm run deploy`).

## Current Priorities
- Stabilize the Virtual Try-On external service communication via the App Proxy and Firebase integrations.
- Further development of the Theme App Extension UI blocks.
