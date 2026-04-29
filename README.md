# ⚡ EV Charging Optimizer

A hybrid mobile web app that finds the cheapest, cleanest hours to charge an EV before
your next departure. Live demo deploys as a single Railway service: an Express API
serves both `/api/*` and the built **Ionic + Angular** PWA from one origin.

> **Why this exists.** Wallbox / Tesla apps schedule charging by clock, not by the
> grid. By blending **Nord Pool spot prices** with **grid carbon intensity** and your
> own departure deadline, the optimizer can shift the same charge into the cheapest
> and lowest-CO₂ window — usually 20–60% cheaper than "plug in now until full."

## Stack

| Layer        | Tech                                                                |
| ------------ | ------------------------------------------------------------------- |
| Mobile UI    | **Ionic 8** + **Angular 19** (standalone components, signals)       |
| API          | **Node 20** + **Express 4** + **TypeScript** + **Zod** validation   |
| Notifications| Web Push API + VAPID via `web-push`                                 |
| PWA          | Custom service worker (offline shell + push handler)                |
| Hosting      | **Railway** — single service via Nixpacks                           |
| Data         | [elprisetjustnu.se](https://www.elprisetjustnu.se/elpris-api) (Nord Pool spot) · [carbonintensity.org.uk](https://carbonintensity.org.uk/) (UK National Grid) · deterministic mock fallback |

## Architecture

```
┌────────────────────────┐         ┌────────────────────────────────┐
│  Ionic + Angular PWA   │  HTTP   │       Express (Node 20)        │
│  ─────────────────────  │ ──────▶ │  /api/forecast  /api/optimize  │
│  signals · standalone   │         │  /api/push/*    /api/health    │
│  installable · push SW  │ ◀────── │                                │
└────────────────────────┘  static  │   prices.ts ── Nord Pool       │
              │                     │   carbon.ts ── UK grid CO₂     │
              │  Web Push / VAPID   │   optimizer.ts ── min-max scoring│
              └─────────────────────┴────────────────────────────────┘
                       served from the same origin
```

### Optimization algorithm

For each forecast slot we compute a single score (lower = better):

```
score(slot) = (1 - w) · norm(price)  +  w · norm(carbon)
```

- `w` is the user's `carbonWeight` (0 = pure cost, 1 = pure carbon)
- `norm()` is min–max normalization across the forecast window
- The K cheapest-by-score full hours are picked, plus a fractional last hour
- The schedule is reassembled in chronological order

`savingsVsNaive` compares the optimized plan's total cost against "charge straight
through from now" — that single number is the headline pitch.

## Run locally

Requires Node ≥ 20.

```bash
git clone <repo>
cd ev-charging-optimizer
npm run install:all

# Two terminals (recommended for hot reload)
npm run dev:backend     # http://localhost:3000
npm run dev:frontend    # http://localhost:4200 (proxies /api to :3000)
```

Or in single-terminal production mode:

```bash
npm run build
npm start               # http://localhost:3000 — serves API + built PWA
```

## Deploy to Railway

1. Push this repo to GitHub.
2. Create a new Railway service from the repo.
3. That's it — `railway.json` and `nixpacks.toml` handle install / build / start.

Optional environment variables:

| Variable             | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `VAPID_PUBLIC_KEY`   | Enables `/api/push/*`. Generate with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY`  | Pair with the public key                      |
| `VAPID_CONTACT`      | `mailto:you@example.com` (required by VAPID)  |
| `PORT`               | Railway sets this automatically               |

Without VAPID keys the app still runs — push notifications are disabled gracefully
and the rest of the demo works.

## "Hybrid mobile" without the App Store

The app is shipped as an **installable PWA**:

- Open the deployed URL on iOS/Android → *Add to Home Screen*
- Or test in Chrome DevTools' device toolbar (Cmd/Ctrl-Shift-M)
- The custom service worker caches the app shell for offline launch and handles
  Web Push events when VAPID is configured

This satisfies the "hybrid mobile" portfolio brief without burning time on App Store
review. Capacitor wrapping would be a one-evening add (`npx cap init` + `cap add ios/android`)
if a native binary is later needed.

## File map

```
ev-charging-optimizer/
├── package.json            # workspace scripts (install:all, build, start)
├── railway.json            # Railway service config
├── nixpacks.toml           # build + start phases
├── backend/
│   ├── package.json        # express, zod, web-push, helmet
│   └── src/
│       ├── server.ts       # mounts /api/*, serves frontend/www
│       ├── routes/         # optimize · forecast · push
│       └── services/
│           ├── prices.ts   # Nord Pool fetch + mock fallback
│           ├── carbon.ts   # UK grid CO₂ fetch + mock fallback
│           └── optimizer.ts# core scoring + selection
└── frontend/
    ├── angular.json
    ├── ionic.config.json
    └── src/
        ├── manifest.webmanifest
        ├── service-worker.js     # custom SW (offline + push)
        └── app/
            ├── pages/home        # input form
            ├── pages/schedule    # results + bar chart + push CTA
            └── services/         # api · notifications · schedule store
```

## Roadmap

- Per-tariff support (time-of-use, dynamic, fixed) overlaid on spot
- Solar self-consumption: subtract a forecasted PV curve before scoring
- Multi-region fetcher (UK Octopus Agile, German EPEX, ENTSO-E pan-EU)
- Capacitor native build behind a flag for App Store / Play Store
- Charging-curve modeling (real EVs taper above 80 % SOC)

## License

MIT — built as a portfolio piece. Use freely.
