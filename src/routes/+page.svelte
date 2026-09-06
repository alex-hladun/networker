<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import MetricChart from '$lib/components/MetricChart.svelte';
	import { qualityLabel } from '$lib/metric-zones';
	import type { Beacon, CollectorStatus, DiscoveredClient, MetricsResponse } from '$lib/types';

	type ClientOption = DiscoveredClient & { selected: boolean };
	type MetricKey =
		| 'signalDbm'
		| 'noiseDbm'
		| 'snrDb'
		| 'satisfaction'
		| 'txRateKbps'
		| 'rxRateKbps'
		| 'retryPercent';

	const METRICS: { key: MetricKey; label: string; unit: string }[] = [
		{ key: 'signalDbm', label: 'Signal', unit: 'dBm' },
		{ key: 'snrDb', label: 'SNR', unit: 'dB' },
		{ key: 'noiseDbm', label: 'Noise', unit: 'dBm' },
		{ key: 'satisfaction', label: 'Satisfaction', unit: '%' },
		{ key: 'txRateKbps', label: 'TX link', unit: 'Mbps' },
		{ key: 'rxRateKbps', label: 'RX link', unit: 'Mbps' },
		{ key: 'retryPercent', label: 'Retries', unit: '%' }
	];

	const TIME_RANGES = [
		{ label: '1m', value: 60 * 1000 },
		{ label: '5m', value: 5 * 60 * 1000 },
		{ label: '1H', value: 60 * 60 * 1000 },
		{ label: '6H', value: 6 * 60 * 60 * 1000 },
		{ label: '24H', value: 24 * 60 * 60 * 1000 },
		{ label: '7D', value: 7 * 24 * 60 * 60 * 1000 },
		{ label: '30D', value: 30 * 24 * 60 * 60 * 1000 }
	];
	const LIVE_RANGE_MS = 60 * 60 * 1000;

	let status = $state<CollectorStatus | null>(null);
	let beacons = $state<Beacon[]>([]);
	let clients = $state<ClientOption[]>([]);
	let history = $state<MetricsResponse | null>(null);
	let search = $state('');
	let metric = $state<MetricKey>('signalDbm');
	let range = $state(5 * 60 * 1000);
	let loading = $state(true);
	let busyMac = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	const filteredClients = $derived(
		clients.filter((client) => {
			const query = search.trim().toLowerCase();
			return !query || client.name.toLowerCase().includes(query) || client.mac.includes(query);
		})
	);
	const metricConfig = $derived(METRICS.find((item) => item.key === metric) ?? METRICS[0]);
	const availableRanges = $derived(
		TIME_RANGES.filter(
			(item) => !status || item.value <= status.retentionDays * 24 * 60 * 60 * 1000
		)
	);
	const pollIntervalMs = $derived(Math.max(500, (status?.pollIntervalSeconds ?? 30) * 1000));

	async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
		const response = await fetch(url, init);
		const body = await response.json();
		if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
		return body as T;
	}

	async function loadHistory(): Promise<void> {
		const to = Date.now();
		const from = to - range;
		history = await fetchJson<MetricsResponse>(`/api/metrics?from=${from}&to=${to}`);
	}

	async function refreshAll(): Promise<void> {
		try {
			errorMessage = null;
			const [newStatus, newBeacons, newClients] = await Promise.all([
				fetchJson<CollectorStatus>('/api/status'),
				fetchJson<Beacon[]>('/api/beacons'),
				fetchJson<ClientOption[]>('/api/clients')
			]);
			status = newStatus;
			beacons = newBeacons;
			clients = newClients;
			await loadHistory();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			loading = false;
		}
	}

	async function addBeacon(client: ClientOption): Promise<void> {
		busyMac = client.mac;
		try {
			await fetchJson('/api/beacons', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mac: client.mac, name: client.name })
			});
			await refreshAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			busyMac = null;
		}
	}

	async function removeBeacon(mac: string): Promise<void> {
		busyMac = mac;
		try {
			await fetchJson('/api/beacons', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mac })
			});
			await refreshAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			busyMac = null;
		}
	}

	async function reconnectBeacon(mac: string): Promise<void> {
		busyMac = mac;
		try {
			errorMessage = null;
			await fetchJson('/api/clients/reconnect', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mac })
			});
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			busyMac = null;
		}
	}

	async function selectRange(value: number): Promise<void> {
		range = value;
		try {
			await loadHistory();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}
	}

	function relativeTime(timestamp: number | null): string {
		if (!timestamp) return 'Waiting for first poll';
		const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
		if (seconds < 10) return 'just now';
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ago`;
	}

	function displayValue(value: number | null | undefined, digits = 0): string {
		return value === null || value === undefined ? '—' : value.toFixed(digits);
	}

	function formatRate(value: number | null | undefined): string {
		return value === null || value === undefined ? '—' : `${(value / 1000).toFixed(0)} Mbps`;
	}

	onMount(() => {
		void refreshAll();
	});

	$effect(() => {
		const delay = range <= LIVE_RANGE_MS ? pollIntervalMs : Math.max(pollIntervalMs, 15_000);
		let cancelled = false;
		let timer = 0;

		const tick = async () => {
			await refreshAll();
			if (!cancelled) timer = window.setTimeout(() => void tick(), delay);
		};

		timer = window.setTimeout(() => void tick(), delay);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	});
</script>

<svelte:head>
	<title>UniFi Beacon Monitor</title>
	<meta
		name="description"
		content="Track signal quality from selected UniFi Wi-Fi clients over time."
	/>
</svelte:head>

<div class="shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="UniFi Beacon Monitor home">
			<span class="brand-mark">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M5 16.5a10 10 0 0 1 14 0M8 13a6 6 0 0 1 8 0m-5.6-3.2a2.7 2.7 0 0 1 3.2 0M12 19h.01"
					/>
				</svg>
			</span>
			<span>
				<strong>Beacon</strong>
				<small>Wi-Fi field monitor</small>
			</span>
		</a>

		<div class="collector-state">
			<span
				class:healthy={status?.configured && !status.lastError}
				class:warning={Boolean(status?.lastError)}
				class="status-dot"
			></span>
			<div>
				<strong>{status?.mode === 'fixture' ? 'Simulation' : 'UniFi collector'}</strong>
				<small>
					{status?.lastError
						? 'Needs attention'
						: status?.configured
							? `Updated ${relativeTime(status.lastPollSucceededAt)}`
							: 'Not configured'}
				</small>
			</div>
		</div>
	</header>

	<main>
		<section class="hero">
			<div>
				<p class="eyebrow">Network visibility</p>
				<h1>See the signal your devices actually receive.</h1>
				<p class="lede">
					Use stationary clients as beacons to compare coverage, spot dropouts, and watch Wi-Fi
					quality change over time.
				</p>
			</div>
			<div class="hero-stats">
				<div>
					<span>Beacons</span>
					<strong>{beacons.length}</strong>
				</div>
				<div>
					<span>Clients seen</span>
					<strong>{status?.discoveredClientCount ?? 0}</strong>
				</div>
				<div>
					<span>Poll interval</span>
					<strong>{status?.pollIntervalSeconds ?? 30}s</strong>
				</div>
			</div>
		</section>

		{#if status && !status.configured}
			<div class="notice setup">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M12 8v4m0 4h.01M5.1 19h13.8a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.37 16a2 2 0 0 0 1.73 3Z"
					/>
				</svg>
				<div>
					<strong>Connect your UniFi console</strong>
					<span
						>Copy <code>.env.example</code> to <code>.env</code>, add the two read-only credentials,
						and restart the app.</span
					>
				</div>
			</div>
		{:else if status?.lastError}
			<div class="notice error">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 9v4m0 4h.01M4.93 4.93a10 10 0 1 0 14.14 0 10 10 0 0 0-14.14 0Z" />
				</svg>
				<div>
					<strong>Collector error</strong>
					<span>{status.lastError}</span>
				</div>
			</div>
		{:else if status?.warning}
			<div class="notice warning-notice">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M12 8v4m0 4h.01M5.1 19h13.8a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.37 16a2 2 0 0 0 1.73 3Z"
					/>
				</svg>
				<div>
					<strong>Collector notice</strong>
					<span>{status.warning}</span>
				</div>
			</div>
		{/if}

		{#if errorMessage}
			<button class="toast" onclick={() => (errorMessage = null)} aria-label="Dismiss error">
				<span>{errorMessage}</span>
				<span aria-hidden="true">×</span>
			</button>
		{/if}

		<div class="workspace">
			<div class="content">
				<section class="section">
					<div class="section-heading">
						<div>
							<p class="eyebrow">Live view</p>
							<h2>Beacon health</h2>
						</div>
						<span class="last-poll">{relativeTime(status?.lastPollSucceededAt ?? null)}</span>
					</div>

					{#if loading}
						<div class="beacon-grid">
							{#each [1, 2, 3] as item (item)}
								<div class="beacon-card skeleton"></div>
							{/each}
						</div>
					{:else if beacons.length === 0}
						<div class="empty-state">
							<div class="radar">
								<span></span><span></span><span></span>
							</div>
							<h3>No beacons selected</h3>
							<p>Choose a stable Wi-Fi client from the panel to start a coverage baseline.</p>
						</div>
					{:else}
						<div class="beacon-grid">
							{#each beacons as beacon (beacon.mac)}
								<article class="beacon-card" class:offline={!beacon.latest?.online}>
									<div class="card-top">
										<div class="device-icon">
											<svg viewBox="0 0 24 24" aria-hidden="true">
												<rect x="5" y="3" width="14" height="18" rx="3" />
												<path d="M10 17h4" />
											</svg>
										</div>
										<div class="identity">
											<strong>{beacon.name}</strong>
											<span>{beacon.mac}</span>
										</div>
										<span class={`quality ${beacon.latest?.online ? beacon.quality : 'offline'}`}>
											{beacon.latest?.online ? qualityLabel(beacon.quality) : 'offline'}
										</span>
									</div>

									<div class="signal-reading">
										<strong>{displayValue(beacon.latest?.signalDbm, 0)}</strong>
										<span>dBm</span>
										<div class="signal-bars" aria-hidden="true">
											<i class:lit={(beacon.latest?.signalDbm ?? -100) >= -65}></i>
											<i class:lit={(beacon.latest?.signalDbm ?? -100) >= -60}></i>
											<i class:lit={(beacon.latest?.signalDbm ?? -100) >= -55}></i>
											<i class:lit={(beacon.latest?.signalDbm ?? -100) > -50}></i>
										</div>
									</div>

									<div class="card-metrics">
										<div>
											<span>SNR</span><strong>{displayValue(beacon.latest?.snrDb)} dB</strong>
										</div>
										<div>
											<span>Satisfaction</span><strong
												>{displayValue(beacon.latest?.satisfaction)}%</strong
											>
										</div>
										<div>
											<span>TX / RX</span><strong
												>{formatRate(beacon.latest?.txRateKbps)} / {formatRate(
													beacon.latest?.rxRateKbps
												)}</strong
											>
										</div>
										<div>
											<span>Access point</span><strong
												>{beacon.latest?.apName ?? beacon.latest?.apMac ?? '—'}</strong
											>
										</div>
										<div>
											<span>Channel</span><strong
												>{displayValue(beacon.latest?.channel)} · {beacon.latest?.radioProtocol?.toUpperCase() ??
													'—'}</strong
											>
										</div>
									</div>

									<div class="card-actions">
										<button
											class="reconnect"
											onclick={() => reconnectBeacon(beacon.mac)}
											disabled={busyMac === beacon.mac || !beacon.latest?.online}
											aria-label={`Reconnect ${beacon.name}`}
										>
											{busyMac === beacon.mac ? 'Reconnecting…' : 'Reconnect'}
										</button>
									</div>

									<button
										class="remove"
										onclick={() => removeBeacon(beacon.mac)}
										disabled={busyMac === beacon.mac}
										aria-label={`Remove ${beacon.name} as a beacon`}
									>
										<svg viewBox="0 0 24 24" aria-hidden="true">
											<path d="M5 12h14" />
										</svg>
									</button>
								</article>
							{/each}
						</div>
					{/if}
				</section>

				<section class="section chart-section">
					<div class="section-heading chart-heading">
						<div>
							<p class="eyebrow">History</p>
							<h2>{metricConfig.label} over time</h2>
						</div>
						<div class="range-picker" aria-label="Chart time range">
							{#each availableRanges as option (option.value)}
								<button
									class:active={range === option.value}
									aria-pressed={range === option.value}
									onclick={() => selectRange(option.value)}>{option.label}</button
								>
							{/each}
						</div>
					</div>

					<div class="metric-picker" aria-label="Chart metric">
						{#each METRICS as option (option.key)}
							<button
								class:active={metric === option.key}
								aria-pressed={metric === option.key}
								onclick={() => (metric = option.key)}>{option.label}</button
							>
						{/each}
					</div>

					<div class="chart-card">
						<MetricChart
							series={history?.series ?? []}
							{metric}
							label={metricConfig.label}
							unit={metricConfig.unit}
							from={history?.from}
							to={history?.to}
						/>
						<div class="chart-foot">
							<span>Bucket: {history?.bucketSeconds ?? status?.pollIntervalSeconds ?? 30}s</span>
							<span>Offline periods appear as gaps</span>
						</div>
					</div>
				</section>
			</div>

			<aside class="client-panel">
				<div class="panel-heading">
					<div>
						<p class="eyebrow">Beacon sources</p>
						<h2>Wi-Fi clients</h2>
					</div>
					<span>{clients.length}</span>
				</div>

				<label class="search">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-4-4" />
					</svg>
					<input
						bind:value={search}
						placeholder="Search name or MAC"
						aria-label="Search Wi-Fi clients"
					/>
				</label>

				<div class="client-list">
					{#if clients.length === 0}
						<div class="client-empty">
							<strong>No wireless clients found</strong>
							<span>The list updates after a successful UniFi poll.</span>
						</div>
					{:else}
						{#each filteredClients as client (client.mac)}
							<div class="client-row">
								<span class:online={client.connected} class="client-dot"></span>
								<div>
									<strong>{client.name}</strong>
									<span>{client.ipAddress ?? client.mac}</span>
								</div>
								<button
									class:selected={client.selected}
									disabled={client.selected || busyMac === client.mac}
									onclick={() => addBeacon(client)}
									aria-label={client.selected
										? `${client.name} is selected`
										: `Add ${client.name} as a beacon`}
								>
									{client.selected ? 'Added' : 'Add'}
								</button>
							</div>
						{/each}
					{/if}
				</div>

				<div class="panel-tip">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M9 18h6m-5 3h4m3-12a5 5 0 1 0-10 0c0 2 1 3 2 4.2.5.6.8 1.2.8 1.8h2.4c0-.6.3-1.2.8-1.8C16 12 17 11 17 9Z"
						/>
					</svg>
					<p>
						<strong>Choose fixed devices.</strong> Speakers, TVs, plugs, and desktops make better beacons
						than phones that move around.
					</p>
				</div>
			</aside>
		</div>
	</main>

	<footer>
		<span>Local UniFi monitor</span>
		<span>UniFi {status?.controllerVersion ?? 'not connected'}</span>
		<span>{status?.retentionDays ?? 30}-day retention</span>
	</footer>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		color-scheme: dark;
		background: #071017;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		background:
			radial-gradient(circle at 15% -10%, rgba(33, 210, 164, 0.1), transparent 32rem),
			linear-gradient(180deg, #09131b 0%, #071017 100%);
		color: #edf4f7;
		font-family:
			Inter,
			ui-sans-serif,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	:global(:root) {
		--surface: #0d1821;
		--surface-2: #111e28;
		--border: #1d2c37;
		--text: #edf4f7;
		--muted: #8595a5;
		--accent: #24d6a7;
		--accent-soft: rgba(36, 214, 167, 0.11);
		--warning: #f6b950;
		--danger: #f07b91;
	}

	button,
	input {
		font: inherit;
	}

	button,
	a {
		-webkit-tap-highlight-color: transparent;
	}

	.shell {
		min-height: 100vh;
	}

	.topbar {
		height: 76px;
		padding: 0 max(24px, calc((100vw - 1480px) / 2));
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(7, 16, 23, 0.72);
		backdrop-filter: blur(18px);
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		color: var(--text);
		text-decoration: none;
	}

	.brand-mark {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 11px;
		color: #061611;
		background: var(--accent);
		box-shadow: 0 0 28px rgba(36, 214, 167, 0.2);
	}

	svg {
		width: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.brand strong,
	.brand small,
	.collector-state strong,
	.collector-state small {
		display: block;
	}

	.brand strong {
		letter-spacing: -0.02em;
	}

	.brand small,
	.collector-state small {
		color: var(--muted);
		font-size: 0.72rem;
		margin-top: 0.12rem;
	}

	.collector-state {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.collector-state strong {
		font-size: 0.8rem;
	}

	.status-dot,
	.client-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #596978;
		box-shadow: 0 0 0 4px rgba(89, 105, 120, 0.1);
	}

	.status-dot.healthy,
	.client-dot.online {
		background: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}

	.status-dot.warning {
		background: var(--danger);
		box-shadow: 0 0 0 4px rgba(240, 123, 145, 0.1);
	}

	main {
		max-width: 1480px;
		margin: 0 auto;
		padding: 0 24px 60px;
	}

	.hero {
		min-height: 250px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.hero > div:first-child {
		max-width: 680px;
	}

	.eyebrow {
		color: var(--accent);
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		margin: 0 0 0.65rem;
	}

	h1,
	h2,
	h3,
	p {
		margin-top: 0;
	}

	h1 {
		max-width: 650px;
		font-size: clamp(2rem, 4vw, 3.6rem);
		line-height: 1.04;
		letter-spacing: -0.055em;
		margin-bottom: 1rem;
	}

	.lede {
		color: #9aaab9;
		font-size: 1rem;
		line-height: 1.65;
		margin-bottom: 0;
		max-width: 620px;
	}

	.hero-stats {
		display: flex;
		gap: 1px;
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
		background: var(--border);
		flex-shrink: 0;
	}

	.hero-stats div {
		padding: 1rem 1.3rem;
		min-width: 112px;
		background: rgba(12, 24, 33, 0.96);
	}

	.hero-stats span,
	.hero-stats strong {
		display: block;
	}

	.hero-stats span {
		color: var(--muted);
		font-size: 0.68rem;
		margin-bottom: 0.35rem;
	}

	.hero-stats strong {
		font-size: 1.25rem;
		letter-spacing: -0.03em;
	}

	.notice {
		display: flex;
		align-items: flex-start;
		gap: 0.8rem;
		border: 1px solid rgba(246, 185, 80, 0.28);
		background: rgba(246, 185, 80, 0.07);
		padding: 1rem 1.1rem;
		margin-top: 1.5rem;
		border-radius: 11px;
		color: #ebc989;
	}

	.notice.error {
		border-color: rgba(240, 123, 145, 0.3);
		background: rgba(240, 123, 145, 0.07);
		color: #f3a2b1;
	}

	.notice svg {
		flex: 0 0 auto;
	}

	.notice strong,
	.notice span {
		display: block;
	}

	.notice strong {
		font-size: 0.82rem;
		margin-bottom: 0.25rem;
	}

	.notice span {
		font-size: 0.78rem;
		line-height: 1.45;
		color: #a9b3b8;
	}

	code {
		background: rgba(255, 255, 255, 0.07);
		border-radius: 4px;
		padding: 0.08rem 0.3rem;
		color: #d6e1e5;
	}

	.toast {
		position: fixed;
		right: 1.5rem;
		bottom: 1.5rem;
		z-index: 50;
		max-width: min(440px, calc(100vw - 3rem));
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		border: 1px solid rgba(240, 123, 145, 0.3);
		background: #2a1820;
		color: #f5c0cb;
		border-radius: 10px;
		padding: 0.9rem 1rem;
		box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
		cursor: pointer;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 330px;
		gap: 2rem;
		padding-top: 2.5rem;
		align-items: start;
	}

	.content {
		min-width: 0;
	}

	.section + .section {
		margin-top: 3rem;
	}

	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.2rem;
	}

	.section-heading .eyebrow {
		margin-bottom: 0.35rem;
	}

	h2 {
		font-size: 1.35rem;
		letter-spacing: -0.035em;
		margin-bottom: 0;
	}

	.last-poll {
		color: var(--muted);
		font-size: 0.72rem;
	}

	.beacon-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.9rem;
	}

	.beacon-card {
		position: relative;
		min-width: 0;
		background: linear-gradient(130deg, rgba(36, 214, 167, 0.035), transparent 45%), var(--surface);
		border: 1px solid var(--border);
		border-radius: 13px;
		padding: 1.1rem;
		overflow: hidden;
	}

	.beacon-card.offline {
		opacity: 0.64;
	}

	.beacon-card.skeleton {
		height: 265px;
		background: linear-gradient(
			90deg,
			var(--surface) 20%,
			var(--surface-2) 50%,
			var(--surface) 80%
		);
		background-size: 220% 100%;
		animation: shimmer 1.6s infinite;
	}

	@keyframes shimmer {
		to {
			background-position: -220% 0;
		}
	}

	.card-top {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}

	.device-icon {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border: 1px solid #283947;
		border-radius: 9px;
		color: #7f93a4;
		flex-shrink: 0;
	}

	.device-icon svg {
		width: 1rem;
	}

	.identity {
		min-width: 0;
		flex: 1;
	}

	.identity strong,
	.identity span {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.identity strong {
		font-size: 0.84rem;
	}

	.identity span {
		color: #697b8b;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.6rem;
		margin-top: 0.25rem;
	}

	.quality {
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 0.25rem 0.47rem;
		font-size: 0.56rem;
		font-weight: 750;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.quality.excellent {
		color: #2dd4bf;
	}

	.quality.ideal {
		color: var(--accent);
	}

	.quality.ok {
		color: var(--warning);
	}

	.quality.bad {
		color: #f08c5a;
	}

	.quality.terrible {
		color: var(--danger);
	}

	.signal-reading {
		display: flex;
		align-items: baseline;
		margin: 1.4rem 0 1.2rem;
	}

	.signal-reading > strong {
		font-size: 2.55rem;
		line-height: 1;
		letter-spacing: -0.07em;
		font-variant-numeric: tabular-nums;
	}

	.signal-reading > span {
		color: var(--muted);
		font-size: 0.72rem;
		margin-left: 0.35rem;
	}

	.signal-bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 24px;
		margin-left: auto;
	}

	.signal-bars i {
		display: block;
		width: 4px;
		border-radius: 2px;
		background: #263641;
	}

	.signal-bars i:nth-child(1) {
		height: 6px;
	}
	.signal-bars i:nth-child(2) {
		height: 11px;
	}
	.signal-bars i:nth-child(3) {
		height: 17px;
	}
	.signal-bars i:nth-child(4) {
		height: 24px;
	}
	.signal-bars i.lit {
		background: var(--accent);
	}

	.card-metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.055);
	}

	.card-metrics span,
	.card-metrics strong {
		display: block;
	}

	.card-metrics span {
		color: #687988;
		font-size: 0.58rem;
		margin-bottom: 0.27rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.card-metrics strong {
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-actions {
		display: flex;
		align-items: center;
		margin-top: 1rem;
	}

	.reconnect {
		border: 1px solid #2d433f;
		border-radius: 6px;
		padding: 0.38rem 0.62rem;
		color: var(--accent);
		background: var(--accent-soft);
		font-size: 0.62rem;
		font-weight: 700;
		cursor: pointer;
	}

	.reconnect:hover:not(:disabled) {
		background: var(--accent);
		color: #06140f;
	}

	.remove {
		position: absolute;
		right: 0.7rem;
		bottom: 0.7rem;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: #536574;
		cursor: pointer;
		opacity: 0;
		transition: 0.18s ease;
	}

	.beacon-card:hover .remove,
	.remove:focus-visible {
		opacity: 1;
	}

	.remove:hover {
		color: var(--danger);
	}

	.empty-state {
		min-height: 260px;
		border: 1px dashed #263845;
		border-radius: 13px;
		display: grid;
		place-content: center;
		justify-items: center;
		text-align: center;
		padding: 2rem;
	}

	.empty-state h3 {
		font-size: 0.95rem;
		margin: 1rem 0 0.4rem;
	}

	.empty-state p {
		color: var(--muted);
		font-size: 0.78rem;
		max-width: 350px;
		line-height: 1.5;
		margin-bottom: 0;
	}

	.radar {
		position: relative;
		width: 60px;
		height: 60px;
		display: grid;
		place-items: center;
	}

	.radar span {
		position: absolute;
		border: 1px solid rgba(36, 214, 167, 0.35);
		border-radius: 50%;
	}

	.radar span:nth-child(1) {
		width: 12px;
		height: 12px;
		background: var(--accent);
	}
	.radar span:nth-child(2) {
		width: 34px;
		height: 34px;
	}
	.radar span:nth-child(3) {
		width: 58px;
		height: 58px;
		opacity: 0.5;
	}

	.chart-heading {
		align-items: center;
	}

	.range-picker,
	.metric-picker {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.range-picker {
		padding: 0.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: #0a141c;
		flex-wrap: wrap;
	}

	.range-picker button,
	.metric-picker button {
		border: 0;
		color: var(--muted);
		background: transparent;
		cursor: pointer;
	}

	.range-picker button {
		font-size: 0.62rem;
		font-weight: 700;
		padding: 0.42rem 0.55rem;
		border-radius: 5px;
	}

	.range-picker button.active {
		color: #05130f;
		background: var(--accent);
	}

	.metric-picker {
		flex-wrap: wrap;
		margin-bottom: 0.8rem;
	}

	.metric-picker button {
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 0.45rem 0.7rem;
		font-size: 0.65rem;
	}

	.metric-picker button:hover,
	.metric-picker button.active {
		color: var(--text);
		border-color: #2b3d49;
		background: #111f29;
	}

	.chart-card {
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 13px;
		padding: 1rem 1rem 0.7rem;
	}

	.chart-foot {
		display: flex;
		justify-content: space-between;
		color: #637585;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		padding: 0.7rem 0.3rem 0;
		margin-top: 0.4rem;
		font-size: 0.6rem;
	}

	.client-panel {
		position: sticky;
		top: 100px;
		border: 1px solid var(--border);
		background: rgba(13, 24, 33, 0.88);
		border-radius: 13px;
		overflow: hidden;
	}

	.panel-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		padding: 1.1rem 1.1rem 0.9rem;
	}

	.panel-heading .eyebrow {
		margin-bottom: 0.32rem;
	}

	.panel-heading h2 {
		font-size: 1rem;
	}

	.panel-heading > span {
		color: var(--muted);
		border: 1px solid #293a47;
		border-radius: 999px;
		padding: 0.22rem 0.45rem;
		font-size: 0.58rem;
	}

	.search {
		margin: 0 1rem 0.7rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid #253642;
		border-radius: 8px;
		padding: 0.6rem 0.7rem;
		background: #09131a;
		color: #657786;
	}

	.search svg {
		width: 0.9rem;
	}

	.search input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font-size: 0.72rem;
	}

	.search input::placeholder {
		color: #536574;
	}

	.client-list {
		max-height: 480px;
		overflow-y: auto;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.client-row {
		display: grid;
		grid-template-columns: 8px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		padding: 0.78rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.045);
	}

	.client-row:last-child {
		border-bottom: 0;
	}

	.client-row strong,
	.client-row span {
		display: block;
	}

	.client-row strong {
		font-size: 0.72rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.client-row div > span {
		color: #657786;
		font-size: 0.58rem;
		margin-top: 0.23rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	.client-row button {
		border: 1px solid #2d433f;
		border-radius: 6px;
		padding: 0.32rem 0.52rem;
		color: var(--accent);
		background: var(--accent-soft);
		font-size: 0.6rem;
		font-weight: 700;
		cursor: pointer;
	}

	.client-row button:hover:not(:disabled) {
		background: var(--accent);
		color: #06140f;
	}

	.client-row button.selected {
		color: #718392;
		background: transparent;
		border-color: #263642;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	.client-empty {
		min-height: 170px;
		display: grid;
		place-content: center;
		gap: 0.35rem;
		text-align: center;
		padding: 1rem;
	}

	.client-empty strong {
		font-size: 0.75rem;
	}

	.client-empty span {
		color: var(--muted);
		font-size: 0.65rem;
	}

	.panel-tip {
		display: flex;
		gap: 0.65rem;
		padding: 0.9rem 1rem;
		color: #718392;
	}

	.panel-tip svg {
		width: 1rem;
		flex: 0 0 auto;
		color: var(--warning);
	}

	.panel-tip p {
		font-size: 0.61rem;
		line-height: 1.5;
		margin: 0;
	}

	.panel-tip strong {
		color: #9bacb8;
	}

	footer {
		max-width: 1480px;
		margin: 0 auto;
		padding: 1.2rem 24px 2rem;
		display: flex;
		gap: 1.5rem;
		color: #546675;
		border-top: 1px solid rgba(255, 255, 255, 0.055);
		font-size: 0.62rem;
	}

	@media (max-width: 1080px) {
		.workspace {
			grid-template-columns: 1fr;
		}

		.client-panel {
			position: static;
			grid-row: 1;
		}

		.client-list {
			max-height: 300px;
		}
	}

	@media (max-width: 760px) {
		.topbar {
			height: 68px;
			padding: 0 16px;
		}

		.brand small {
			display: none;
		}

		.collector-state strong {
			display: none;
		}

		main {
			padding: 0 16px 40px;
		}

		.hero {
			min-height: 0;
			padding: 3rem 0 2rem;
			display: block;
		}

		.hero-stats {
			margin-top: 2rem;
			width: 100%;
		}

		.hero-stats div {
			flex: 1;
			min-width: 0;
			padding: 0.85rem;
		}

		.workspace {
			padding-top: 1.8rem;
		}

		.beacon-grid {
			grid-template-columns: 1fr;
		}

		.chart-heading {
			display: block;
		}

		.range-picker {
			width: max-content;
			margin-top: 1rem;
		}

		.chart-card {
			padding-inline: 0.45rem;
		}

		.chart-foot {
			padding-inline: 0.5rem;
		}

		footer {
			padding-inline: 16px;
			flex-wrap: wrap;
		}
	}
</style>
