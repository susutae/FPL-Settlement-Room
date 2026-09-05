# FPL Settlement Room

A responsive 2026/27 Fantasy Premier League settlement dashboard for **Weekly Treat League**, classic mini-league **73572**. The supplied LiveFPL reference uses `id=1878287` for the manager entry “Kopi-O Kosong United”; that number is not the league ID.

## What it does

- Loads all league standings pages and up to the first 15 managers.
- Loads each manager's full gameweek history.
- Ranks every gameweek by net points, then bench points, then manager name for deterministic display.
- Shows gross gameweek points, transfer-hit deductions, net points, bench points, weekly rank, weekly prize, running weekly total, and overall FPL totals/rank.
- Calculates the supplied weekly and end-of-season settlements.
- Allows cup winner and runner-up to be selected when known.
- Falls back to clearly labelled sample data if live data cannot be reached.

## Run locally

Install dependencies with `npm install`, then start the local site with `npm run dev`. Create a production build with `npm run build`.

## Deploy to Vercel

Import this repository into Vercel and deploy it with the detected **Next.js** framework preset. No environment variables are required for the current application. Vercel will install dependencies and run `npm run build` automatically.

For a CLI deployment, run `npx vercel` for a preview or `npx vercel --prod` for production. The legacy Cloudflare/vinext commands remain available as `npm run dev:cloudflare`, `npm run build:cloudflare`, and `npm run start:cloudflare`.

## FPL API and CORS

Browsers commonly block direct cross-origin requests to the public FPL API. This project includes a small same-origin relay at `app/api/fpl/route.ts`; requests are restricted to FPL `/api/` paths. The page uses this relay by default.

If a particular host blocks server-side FPL access, choose **Data settings** in the page and enter a trusted proxy prefix such as `https://your-proxy.example/?url=`. The page appends the encoded FPL URL. The custom setting is saved only in that browser's local storage. The league ID and FPL origin are declared near the top of `app/page.tsx`.

## Scoring rules

- Weekly: 1st +$10; 2nd–4th +$5; 12th–14th −$5; 15th −$10.
- Season: 1st +$130; 2nd +$80; 3rd +$50; 4th +$30; 5th–8th −$25; 9th–12th −$30; 13th–15th −$40.
- Cup: winner +$30; runner-up +$20.

Net gameweek points are calculated from the change in FPL's official cumulative `total_points`, ensuring transfer hits are included even when the result becomes negative. Gross points are reconstructed as net points plus `event_transfers_cost`. Ties are ordered by `points_on_bench` (higher first).
