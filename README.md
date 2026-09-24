# ADX website — adx.in

The ADX website and the web app for advertisers and publishers (DR 12), one Next.js 16 app on the same backend as the ADX apps and the admin console. An account, a listing, a campaign or a booking is the same record on the phone, on the web and on the console.

## Run it

```
cp .env.example .env.local        # point NEXT_PUBLIC_API_BASE_URL at a backend
npm install
npm run dev                       # http://localhost:5174
npm run typecheck && npm run lint && npm test
```

## What is where

| Route | What | Board |
|---|---|---|
| `/` | The home page, kept exactly as the static site drew it (`src/app/page.tsx` + `home.css`) until the DR 12 home lands | — |
| `/spaces`, `/spaces/[id]` | Explore ad spaces (filters, search, map, pagination) and one space's page (gallery, map, what's included, reviews, FAQs, booking calculator, add to campaign) | 01 · 02 |
| `/formats`, `/how-it-works`, `/publishers`, `/help` | The public pages | 01 |
| `/sign-in`, `/verify`, `/choose-workspace` | Mobile OTP sign-in (the apps' door), then the side to work on | 03 |
| `/advertiser/*` | The advertiser workspace | 03 · 04–07 |
| `/publisher/*` | The publisher workspace | 03 · 08–10 |
| `/q/[token]` | QR-27: the landing behind an ADX identity code | — |
| `/privacy.html`, `/terms.html`, `/refund.html`, `/contact.html` | Static files in `public/`, pressed from the console by `build-pages.mjs` (see below) | — |

`src/lib/api-client.ts` is the backend client (the console's, without the admin-only parts), `src/lib/auth.tsx` the session (status derived from the stored token), `src/lib/cart.ts` the campaign cart before it is a campaign, `src/services/*` the typed reads and writes, `src/components/ui/*` the shadcn primitives shared with the console, `src/components/site/*` the DR 12 chrome.

Sign-in is by mobile number and one-time code — the owner's decision of 24 Sep 2026: the platform identifies every party by mobile, so the web uses the same door as the apps. Google sign-in appears when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set (the same web client id the backend's `GOOGLE_CLIENT_ID` verifies).

## Deploy

Render, as a Node web service: `render.yaml` is the blueprint (build `npm ci && npm run build`, start `npm start`, `NEXT_PUBLIC_API_BASE_URL` pointing at the production backend). Point adx.in's DNS at the service when ready. Until then GitHub Pages keeps serving the old static site from `main`, and this app lives on the `app` branch — merge it into `main` and turn Pages off when DNS moves.

## The pages that come from the console (CT-1)

The policy and content pages are written in the ADX console, not here. `build-pages.mjs` is the press: it reads the published text over HTTP, renders the Markdown into the site's layout, and writes the HTML into `public/`, where Next serves it at the old addresses.

```
node build-pages.mjs --check                      # say what would change, write nothing
node build-pages.mjs --api http://localhost:3000/api/v1
node build-pages.mjs                              # against the production API
node --test build-pages.test.mjs
```

Every file it writes carries a marker comment; a file without that marker is hand-written and is never overwritten. To let the console take one over, publish that document and delete the hand-written file first.
