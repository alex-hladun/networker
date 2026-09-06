# UniFi Wi-Fi Beacon Monitor

**[Live demo](https://alex-hladun.github.io/networker/)** — simulated beacons, no UniFi console required.

A small, self-hosted monitor that treats selected wireless clients as stationary beacons. It records
the client telemetry reported by UniFi Network and compares signal quality over time in a Svelte
dashboard.

The collector is read-only: it does not change access points, channels, radios, or WLAN settings. A
Reconnect control on each beacon card can ask UniFi to reconnect that wireless client. Hovering the
history chart lists every selected device at that time; use the Tooltip chips to choose which
fields appear (signal, SNR, noise, satisfaction, rates, retries, AP, and channel). The history
panel has a full-screen control that expands it to fill the app below the header.

## What it records

- Signal strength (dBm), noise, and calculated SNR
- UniFi Wi-Fi satisfaction
- Transmit and receive link rates
- Retry percentage calculated from consecutive UniFi counters
- Channel, radio protocol, associated AP, and online/offline periods

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
4. Copy `.env.example` to `.env` and enter the URL, API key, and local account credentials.
5. Leave `UNIFI_SITE=default` for the usual single-site setup. A site display name also works.
6. Prefer a trusted console certificate. If the console only has its factory self-signed certificate,
   explicitly set `UNIFI_VERIFY_TLS=false`.

## Run with Docker Compose

```sh
cp .env.example .env
# Edit .env, then:
docker compose up --build -d
```

Open <http://localhost:3000>. The named `networker_data` volume retains history across upgrades.

If `UNIFI_URL` uses `127.0.0.1` or `localhost` (a host tunnel or forwarded console port), the
container rewrites that host to `host.docker.internal`. A LAN console IP such as
`https://192.168.1.1` is used as-is.

To try the UI without a console:

```sh
UNIFI_FIXTURE_MODE=true docker compose up --build
```

## Local development

Node.js 22 and pnpm are recommended.

```sh
pnpm install
cp .env.example .env
UNIFI_FIXTURE_MODE=true pnpm dev
```

The local SQLite database is created under `data/`. Useful checks:

```sh
pnpm check
pnpm lint
pnpm test:unit
pnpm build
```

## Configuration

- `UNIFI_URL`: direct local console URL
- `UNIFI_API_KEY`: local Network Integration API key
- `UNIFI_USERNAME`, `UNIFI_PASSWORD`: dedicated local view-only account
- `UNIFI_SITE`: classic site slug or Integration API display name; defaults to `default`
- `UNIFI_VERIFY_TLS`: defaults to `true`
- `POLL_INTERVAL_SECONDS`: 0.5–3600 seconds; defaults to `30`
- `RETENTION_DAYS`: 1–3650 days; defaults to `30`
- `DATA_DIR` or `DATABASE_PATH`: SQLite location
- `UNIFI_FIXTURE_MODE`: use deterministic simulated clients

Secrets are read from the environment and are never saved to SQLite or returned to the browser.

## Operational notes

- Run one application instance per database. The collector is intentionally in-process for a simple
  single-container deployment.
- A missing client creates an offline sample, so charts show gaps rather than carrying old values
  forward.
- Client identities are joined by normalized MAC address. Private-address rotation on a beacon
  appears as a new device and must be selected again.
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
