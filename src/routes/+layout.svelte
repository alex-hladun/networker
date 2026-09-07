<script lang="ts">
	import { base } from '$app/paths';
	import appleTouchIcon from '$lib/assets/apple-touch-icon.png';
	import faviconPng from '$lib/assets/favicon-32.png';
	import favicon from '$lib/assets/logo.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="icon" href={faviconPng} type="image/png" sizes="32x32" />
	<link rel="icon" href="{base}/favicon.ico" sizes="any" />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
	<link rel="manifest" href="{base}/manifest.webmanifest" />
	<meta name="theme-color" content="#071017" />
	<meta name="application-name" content="UniFi Beacon Monitor" />
	<meta name="apple-mobile-web-app-title" content="Beacon Monitor" />
</svelte:head>

{@render children()}
