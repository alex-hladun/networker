<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import { onMount } from 'svelte';
	import type { PublicConnection } from '$lib/types';

	const demoMode = env.PUBLIC_DEMO === 'true';

	let unifiUrl = $state('');
	let apiKey = $state('');
	let username = $state('');
	let password = $state('');
	let site = $state('default');
	let verifyTls = $state(false);
	let hasApiKey = $state(false);
	let hasPassword = $state(false);
	let configured = $state(false);
	let loading = $state(!demoMode);
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);

	async function loadConnection(): Promise<void> {
		if (demoMode) {
			await goto(resolve('/'));
			return;
		}

		try {
			const response = await fetch('/api/connection');
			const body = (await response.json()) as PublicConnection & { error?: string };
			if (!response.ok) throw new Error(body.error || 'Could not load the saved connection.');
			unifiUrl = body.unifiUrl;
			username = body.username;
			site = body.site || 'default';
			verifyTls = body.unifiUrl ? body.verifyTls : false;
			hasApiKey = body.hasApiKey;
			hasPassword = body.hasPassword;
			configured = body.configured;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			loading = false;
		}
	}

	async function saveConnection(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		saving = true;
		errorMessage = null;
		try {
			const response = await fetch('/api/connection', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					unifiUrl,
					apiKey,
					username,
					password,
					site,
					verifyTls
				})
			});
			const body = (await response.json()) as PublicConnection & { error?: string };
			if (!response.ok) throw new Error(body.error || 'Could not save the connection.');
			await goto(resolve('/'));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		void loadConnection();
	});
</script>

<svelte:head>
	<title>{configured ? 'Change connection' : 'Connect UniFi'} · Beacon Monitor</title>
</svelte:head>

<div class="shell">
	<header class="topbar">
		<a
			class="brand"
			href={resolve(configured ? '/' : '/login')}
			aria-label="UniFi Beacon Monitor home"
		>
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
		{#if configured}
			<a class="back" href={resolve('/')}>Back to dashboard</a>
		{/if}
	</header>

	<main>
		<section class="card">
			<p class="eyebrow">UniFi connection</p>
			<h1>{configured ? 'Update your console login' : 'Connect your UniFi console'}</h1>
			<p class="lede">
				Enter the local console URL, a read-only Integration API key, and a local view-only account.
				Both credentials are required. Nothing is written to <code>.env</code>.
			</p>

			{#if loading}
				<p class="status">Loading saved connection…</p>
			{:else}
				<form onsubmit={saveConnection}>
					<label>
						<span>Console URL</span>
						<input
							bind:value={unifiUrl}
							type="url"
							name="unifiUrl"
							placeholder="https://192.168.1.1"
							autocomplete="url"
							required
						/>
					</label>
					<label>
						<span>Integration API key</span>
						<input
							bind:value={apiKey}
							type="password"
							name="apiKey"
							placeholder={hasApiKey ? 'Saved — leave blank to keep' : 'Read-only API key'}
							autocomplete="off"
							required={!hasApiKey}
						/>
					</label>
					<label>
						<span>Local username</span>
						<input
							bind:value={username}
							type="text"
							name="username"
							placeholder="network-monitor"
							autocomplete="username"
							required
						/>
					</label>
					<label>
						<span>Local password</span>
						<input
							bind:value={password}
							type="password"
							name="password"
							placeholder={hasPassword ? 'Saved — leave blank to keep' : 'View-only password'}
							autocomplete="current-password"
							required={!hasPassword}
						/>
					</label>
					<label>
						<span>Site</span>
						<input bind:value={site} type="text" name="site" placeholder="default" />
					</label>
					<label class="check">
						<input bind:checked={verifyTls} type="checkbox" name="verifyTls" />
						<span>Verify the console TLS certificate</span>
					</label>

					{#if errorMessage}
						<p class="error" role="alert">{errorMessage}</p>
					{/if}

					<button type="submit" disabled={saving}>
						{saving ? 'Checking UniFi…' : configured ? 'Save connection' : 'Connect'}
					</button>
				</form>
			{/if}
		</section>
	</main>
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
		--danger: #f07b91;
	}

	button,
	input {
		font: inherit;
	}

	.shell {
		min-height: 100vh;
	}

	.topbar {
		height: 76px;
		padding: 0 max(24px, calc((100vw - 720px) / 2));
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(7, 16, 23, 0.72);
		backdrop-filter: blur(18px);
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
	.brand small {
		display: block;
	}

	.brand small {
		color: var(--muted);
		font-size: 0.72rem;
		margin-top: 0.12rem;
	}

	.back {
		color: var(--muted);
		font-size: 0.82rem;
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 3rem 24px 60px;
	}

	.card {
		border: 1px solid var(--border);
		background: rgba(13, 24, 33, 0.92);
		border-radius: 18px;
		padding: 2rem 1.8rem 1.8rem;
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
	p {
		margin-top: 0;
	}

	h1 {
		font-size: clamp(1.7rem, 4vw, 2.3rem);
		letter-spacing: -0.045em;
		line-height: 1.1;
		margin-bottom: 0.75rem;
	}

	.lede,
	.status {
		color: #9aaab9;
		font-size: 0.95rem;
		line-height: 1.6;
	}

	form {
		display: grid;
		gap: 1rem;
		margin-top: 1.6rem;
	}

	label span {
		display: block;
		color: var(--muted);
		font-size: 0.75rem;
		margin-bottom: 0.4rem;
	}

	input[type='url'],
	input[type='text'],
	input[type='password'] {
		width: 100%;
		border: 1px solid var(--border);
		background: #0a141c;
		color: var(--text);
		border-radius: 10px;
		padding: 0.75rem 0.85rem;
	}

	input:focus {
		outline: 2px solid rgba(36, 214, 167, 0.35);
		border-color: rgba(36, 214, 167, 0.5);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.check span {
		margin: 0;
		color: var(--text);
		font-size: 0.88rem;
	}

	.error {
		margin: 0;
		color: #f3a2b1;
		background: rgba(240, 123, 145, 0.08);
		border: 1px solid rgba(240, 123, 145, 0.28);
		border-radius: 10px;
		padding: 0.75rem 0.85rem;
		font-size: 0.84rem;
		line-height: 1.45;
	}

	button[type='submit'] {
		border: 0;
		border-radius: 11px;
		background: var(--accent);
		color: #061611;
		font-weight: 700;
		padding: 0.85rem 1rem;
		cursor: pointer;
	}

	button[type='submit']:disabled {
		opacity: 0.65;
		cursor: wait;
	}

	code {
		background: rgba(255, 255, 255, 0.07);
		border-radius: 4px;
		padding: 0.08rem 0.3rem;
		color: #d6e1e5;
	}
</style>
