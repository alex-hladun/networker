<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chart as ChartInstance } from 'chart.js';
	import type { BeaconSeries, MetricSample } from '$lib/types';

	type MetricKey =
		| 'signalDbm'
		| 'noiseDbm'
		| 'snrDb'
		| 'satisfaction'
		| 'txRateKbps'
		| 'rxRateKbps'
		| 'retryPercent';

	type Props = {
		series: BeaconSeries[];
		metric: MetricKey;
		label: string;
		unit: string;
	};

	let { series, metric, label, unit }: Props = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: ChartInstance | null = null;
	let ChartConstructor: typeof import('chart.js').Chart | null = null;

	const colors = ['#24d6a7', '#73a8ff', '#f6b950', '#f07b91', '#a78bfa', '#2dd4bf'];

	function metricValue(sample: MetricSample): number | null {
		const value = sample[metric];
		if (value === null) return null;
		if (metric === 'txRateKbps' || metric === 'rxRateKbps') return value / 1000;
		return Number(value.toFixed(1));
	}

	function draw(): void {
		if (!canvas || !ChartConstructor) return;
		chart?.destroy();

		const timestamps = [
			...new Set(series.flatMap((beacon) => beacon.points.map((point) => point.sampledAt)))
		].sort((a, b) => a - b);
		const timestampIndex = new Map(timestamps.map((timestamp, index) => [timestamp, index]));
		const showDate =
			timestamps.length > 1 && timestamps[timestamps.length - 1] - timestamps[0] > 36e5 * 24;
		const formatter = new Intl.DateTimeFormat(undefined, {
			...(showDate ? { month: 'short', day: 'numeric' } : {}),
			hour: 'numeric',
			minute: '2-digit'
		});

		chart = new ChartConstructor(canvas, {
			type: 'line',
			data: {
				labels: timestamps.map((timestamp) => formatter.format(timestamp)),
				datasets: series.map((beacon, index) => {
					const values: (number | null)[] = Array(timestamps.length).fill(null);
					for (const point of beacon.points) {
						const pointIndex = timestampIndex.get(point.sampledAt);
						if (pointIndex !== undefined) values[pointIndex] = metricValue(point);
					}
					return {
						label: beacon.name,
						data: values,
						borderColor: colors[index % colors.length],
						backgroundColor: colors[index % colors.length],
						borderWidth: 2,
						pointRadius: timestamps.length < 80 ? 2 : 0,
						pointHoverRadius: 5,
						tension: 0.28,
						spanGaps: false
					};
				})
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: {
						position: 'top',
						align: 'end',
						labels: {
							color: '#aab7c5',
							usePointStyle: true,
							boxWidth: 8,
							font: { family: 'Inter, ui-sans-serif, system-ui' }
						}
					},
					tooltip: {
						backgroundColor: '#111a23',
						borderColor: '#2d3b49',
						borderWidth: 1,
						callbacks: {
							label: (context) => `${context.dataset.label}: ${context.formattedValue} ${unit}`
						}
					}
				},
				scales: {
					x: {
						grid: { color: 'rgba(151, 168, 185, 0.08)' },
						ticks: { color: '#718196', maxTicksLimit: 8, maxRotation: 0 }
					},
					y: {
						grid: { color: 'rgba(151, 168, 185, 0.1)' },
						ticks: {
							color: '#718196',
							callback: (value) => `${value} ${unit}`
						}
					}
				}
			}
		});
	}

	onMount(() => {
		let cancelled = false;
		void import('chart.js').then((module) => {
			if (cancelled) return;
			module.Chart.register(...module.registerables);
			ChartConstructor = module.Chart;
			draw();
		});
		return () => {
			cancelled = true;
			chart?.destroy();
		};
	});

	$effect(() => {
		draw();
	});
</script>

<div class="chart-wrap">
	{#if series.length === 0 || series.every((beacon) => beacon.points.length === 0)}
		<div class="empty">
			<div class="empty-icon">⌁</div>
			<strong>No samples in this range</strong>
			<span>Leave the collector running or choose a wider time range.</span>
		</div>
	{:else}
		<canvas bind:this={canvas} aria-label={`${label} history chart`}></canvas>
	{/if}
</div>

<style>
	.chart-wrap {
		position: relative;
		height: 360px;
		min-height: 300px;
	}

	.empty {
		height: 100%;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.45rem;
		color: var(--muted);
		text-align: center;
	}

	.empty strong {
		color: var(--text);
	}

	.empty-icon {
		font-size: 2.5rem;
		color: var(--accent);
	}

	@media (max-width: 700px) {
		.chart-wrap {
			height: 300px;
		}
	}
</style>
