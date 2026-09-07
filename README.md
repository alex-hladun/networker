# UniFi Wi-Fi Beacon Monitor

**[Live demo](https://alex-hladun.github.io/networker/)** — simulated clients, no UniFi console required.

A small, self-hosted monitor that records the client telemetry reported by UniFi Network for **every
wireless device**, then lets you pin stationary clients as beacons for a live dashboard. Compare
signal quality over time in a Svelte chart — including devices you never pinned.

The collector is read-only: it does not change access points, channels, radios, or WLAN settings. A
Reconnect control on each beacon card can ask UniFi to reconnect that wireless client. Hovering the
history chart lists every recorded device at that time. The Devices filter defaults to pinned
beacons; switch it to All to plot every client. Tooltips default to signal only, shown as a quality
class (Excellent, Ideal, OK, Bad, Terrible) with the value right-aligned; check **Show raw values**
at the top of the chart for numbers, and use the Tooltip chips for AP, SNR, noise, satisfaction,
rates, retries, and channel. Click a device in the chart legend to show only that series; click it
again to hide it. **All** restores every series, and hidden series stay hidden when the chart
refreshes. Drag across the
chart to mark a time window and save it as a scenario — the dashboard averages each metric for each
device in that span so you can compare later. The history panel has a full-screen control that
expands it to fill the app below the header. Open **Beacon sources** in the header to search Wi-Fi
clients and add or remove beacons without leaving the live view.

## What it records

Every poll stores the same fields for each wireless client UniFi reports, not only pinned beacons:

- Signal strength (dBm), noise, and calculated SNR
- UniFi Wi-Fi satisfaction
- Transmit and receive link rates
- Retry percentage calculated from consecutive UniFi counters
- Channel, radio protocol, associated AP, and online/offline periods

Pinning a beacon only adds the live health card. History for that MAC is already there if the
device was on the network. A client that leaves is marked offline once (beacons keep logging
offline samples so dropouts stay visible).

## Quality zones

Charts, tooltips, and beacon cards color zoned metrics with five bands. Cutoffs follow common WLAN
design targets: coverage around `-65 dBm`, usable data around `25 dB` SNR, and UniFi satisfaction of
`90` as healthy. The named threshold is included in that band.

| Metric           | Excellent | Ideal | OK    | Bad   | Terrible |
| ---------------- | --------- | ----- | ----- | ----- | -------- |
| Signal (dBm)     | ≥ −55     | ≥ −65 | ≥ −72 | ≥ −80 | < −80    |
| SNR (dB)         | ≥ 35      | ≥ 30  | ≥ 25  | ≥ 20  | < 20     |
| Noise (dBm)      | ≤ −90     | ≤ −85 | ≤ −80 | ≤ −75 | > −75    |
| Satisfaction (%) | ≥ 90      | ≥ 80  | ≥ 70  | ≥ 60  | < 60     |
| Retries (%)      | ≤ 5       | ≤ 10  | ≤ 15  | ≤ 25  | > 25     |

TX and RX link rates are not zoned; those values depend on PHY, spatial streams, and channel width.
Noise is a diagnostic (wider channels report a higher floor even when the spectrum is clean). SNR is
the better companion for client experience. Beacon-card quality still follows signal strength.

UniFi's official Integration API is used for version, site, and client discovery. Detailed wireless
values come from the local `/proxy/network/api/s/{site}/stat/sta` endpoint used by the Network UI,
because the official connected-client schema does not currently expose those values.

## UniFi preparation

1. In **UniFi Network → Settings → Control Plane → Integrations**, create an API key from a
   read-only administrator.
2. Create a dedicated **local** UniFi OS account with view-only Network access. Do this as an Owner
   or Super Admin in **console / OS settings → Admins** (or **Control Plane → Admins**). Add an admin
   as **Local Access**, **Local Only**, or **Create local admin** — not a UI.com email invite. Use a
   simple local username such as `network-monitor`, set a strong password, and grant **Network →
   View Only** (sometimes labeled **Read Only**). Do not give this account Super Admin, Site Admin,
   or permission to change APs, WLANs, or console settings. Confirm by signing in as that user at
   the LAN URL: you should see Network data and no settings you can change. Reconnecting a client
   from the dashboard needs permission to reconnect wireless clients; a view-only account is enough
   for monitoring. A UI.com / `unifi.ui.com` account will not work; the collector posts username
   and password to `/api/auth/login` on the console.
3. Find the direct LAN URL of the console, such as `https://192.168.1.1`. Copy the origin from the
   address bar when you open the console on the LAN, with no path and no trailing slash. Do not use
   `https://unifi.ui.com/...`. If you only use the cloud portal, the IP is under **Settings →
   Control Plane → Console** (or **System** / console info) as **Local Access** / **LAN IP**. If the
   UniFi box is your router, that is usually the default gateway. An IP is more reliable than
   `https://unifi` or `https://unifi.local`.
4. Start the app (Mac desktop, Docker, or `pnpm dev`) and use the **login page** to enter the
   console URL, Integration API key, and local account. Credentials are stored in
   `DATA_DIR/connection.json`, not SQLite and not a required `.env` file.
5. Leave the site as `default` unless you use a named site. A site display name also works.
6. Prefer a trusted console certificate. Leave **Verify TLS** off for the factory self-signed
   certificate shipped by many local consoles.

## Run on a Mac

Node.js 22 and pnpm are recommended.

```sh
pnpm install
pnpm electron:dev
```

That opens a native window against the Vite dev server. On first launch, complete the login page.

To build a local unsigned `.app` / `.dmg` for Apple Silicon:

```sh
pnpm electron:build
```

The artifacts are under `release/`. Gatekeeper will require **right-click → Open** the first time.
The packaged app stores history and `connection.json` in
`~/Library/Application Support/UniFi Beacon Monitor/data`. Use **Help → Open data folder** if you
need that path. Environment variables remain an optional override for automation.

The Mac app, browser tab, and dashboard header share the mint Wi-Fi beacon mark. Dock and
window icons come from `resources/icon.icns` (built from `resources/icon.png`). The web UI uses
`src/lib/assets/logo.svg` plus PNG/ICO copies in `static/` (`favicon.ico`, `apple-touch-icon.png`).

## Run with Docker Compose

```sh
docker compose up --build -d
```

Open <http://localhost:3000> and complete the login page if the container has no UniFi environment
variables. The named `networker_data` volume retains history and the saved connection across
upgrades. You can still pass `UNIFI_*` variables in `.env` instead of using the login page.

If `UNIFI_URL` uses `127.0.0.1` or `localhost` (a host tunnel or forwarded console port), the
container rewrites that host to `host.docker.internal`. A LAN console IP such as
`https://192.168.1.1` is used as-is.

To try the UI without a console:

```sh
UNIFI_FIXTURE_MODE=true docker compose up --build
```

## Local development

Node.js 22 and pnpm are recommended. Use the Vite dev server so UI and server changes hot-reload.

### On the host

```sh
pnpm install
pnpm dev
```

Open <http://localhost:5173>. The local SQLite database and `connection.json` are created under
`data/`.

### In Docker, with hot reload

Production `docker compose up --build` bakes a static image. For live reload while you edit:

```sh
pnpm docker:dev
```

That is `docker compose -f compose.yaml -f compose.dev.yaml up --build`. It runs `vite dev` on port
3000, bind-mounts the repo, and polls for file changes so HMR works on Docker Desktop for Mac.
Open <http://localhost:3000> and leave the stack running — saving a file updates the browser
without rebuilding the image.

Open the login page, or set `UNIFI_FIXTURE_MODE=true` to use simulated clients. Useful checks:

```sh
pnpm check
pnpm lint
pnpm test:unit
pnpm build
```

## Configuration

The login page is the normal way to set the console URL, API key, and local account. It writes
`DATA_DIR/connection.json` with owner-only permissions. Environment variables still win when set,
which is useful for Docker and CI:

- `UNIFI_URL`: direct local console URL
- `UNIFI_API_KEY`: local Network Integration API key
- `UNIFI_USERNAME`, `UNIFI_PASSWORD`: dedicated local view-only account
- `UNIFI_SITE`: classic site slug or Integration API display name; defaults to `default`
- `UNIFI_VERIFY_TLS`: defaults to `true` when unset
- `POLL_INTERVAL_SECONDS`: 0.5–3600 seconds; defaults to `0.5`
- `RETENTION_DAYS`: 1–3650 days; defaults to `30`
- `DATA_DIR` or `DATABASE_PATH`: SQLite and `connection.json` location
- `UNIFI_FIXTURE_MODE`: use deterministic simulated clients

Secrets are never saved to SQLite or returned to the browser. The API key and password are omitted
from `GET /api/connection`.

## Saved scenarios

Drag left-to-right or right-to-left on the history chart to select a time range. Name the window
and save it. The saved snapshot stores the average of each numeric metric (signal, SNR, noise,
satisfaction, TX/RX rates, and retries) for every recorded device in the window, using only online
samples in that range.

Scenarios stay in SQLite on a self-hosted or Electron install (`GET` / `POST` / `DELETE`
`/api/scenarios`). The static demo keeps them in browser storage so they survive a refresh. Use
saved scenarios to compare windows such as before and after moving an access point.

## GitHub Pages demo

The **Deploy demo** workflow publishes `pnpm build:demo` to GitHub Pages at
<https://alex-hladun.github.io/networker/>. `BASE_PATH=/networker` matches that project-site
path. This repository does not set a custom domain, and the workflow drops any `CNAME` from
the uploaded artifact.

GitHub still redirects every project site to a user-site custom domain when
[`alex-hladun.github.io`](https://github.com/alex-hladun/alex-hladun.github.io) contains a
`CNAME`. That is why the demo can appear at a host such as `alexhladun.me` even though this
repo is configured for `github.io`. To use the default host, delete that `CNAME` and clear
**Settings → Pages → Custom domain** on the user site. After GitHub updates the Pages
mapping, `https://alex-hladun.github.io/networker/` no longer redirects.

## Operational notes

- Run one application instance per database. The collector is intentionally in-process for a simple
  single-container deployment.
- A missing beacon creates an offline sample on every poll so charts show dropouts. Other clients
  get one offline sample when they leave, then sampling resumes when they return.
- Client identities are joined by normalized MAC address. Private-address rotation on a device
  appears as a new client.
- UniFi's classic endpoint is not part of the official Integration API. The adapter isolates this
  dependency and reports controller/authentication changes clearly in the dashboard.

# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.17.0 create --template minimal --types ts --add prettier eslint vitest="usages:unit" playwright sveltekit-adapter="adapter:node" --no-download-check --install pnpm .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
