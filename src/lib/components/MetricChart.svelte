<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chart as ChartInstance, Plugin } from 'chart.js';
	import {
		QUALITY_ZONES,
		ZONE_COLORS,
		ZONE_LABELS,
		zoneAxisRange,
		zoneBands,
		type ChartMetric,
		type ZoneBand
	} from '$lib/metric-zones';
	import type { BeaconSeries, MetricSample } from '$lib/types';

	type Props = {
		series: BeaconSeries[];
		metric: ChartMetric;
		label: string;
		unit: string;
	};

	let { series, metric, label, unit }: Props = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: ChartInstance | null = null;
	let ChartConstructor: typeof import('chart.js').Chart | null = null;

	const colors = ['#24d6a7', '#73a8ff', '#f6b950', '#f07b91', '#a78bfa', '#2dd4bf'];
	const bands = $derived(zoneBands(metric));

	function metricValue(sample: MetricSample): number | null {
		const value = sample[metric];
		if (value === null) return null;
		if (metric === 'txRateKbps' || metric === 'rxRateKbps') return value / 1000;
		return Number(value.toFixed(1));
	}

	function qualityZonePlugin(zoneBandsForDraw: ZoneBand[]): Plugin {
		return {
			id: 'qualityZones',
			beforeDraw(instance) {
				const { ctx, chartArea, scales } = instance;
				const y = scales.y;
				if (!chartArea || !y) return;

				ctx.save();
				ctx.beginPath();
				ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
				ctx.clip();

				for (const band of zoneBandsForDraw) {
					const from = Math.max(band.from, y.min);
					const to = Math.min(band.to, y.max);
					if (!(to > from)) continue;

					const top = y.getPixelForValue(to);
					const bottom = y.getPixelForValue(from);
					ctx.fillStyle = band.color;
					ctx.fillRect(chartArea.left, top, chartArea.width, bottom - top);
				}

				ctx.restore();
			}
		};
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

		const plotted = series.flatMap((beacon) =>
			beacon.points
				.map((point) => metricValue(point))
				.filter((value): value is number => value !== null)
		);
		const axisRange = zoneAxisRange(metric, plotted);

		chart = new ChartConstructor(canvas, {
			type: 'line',
			plugins: [qualityZonePlugin(bands)],
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
						min: axisRange.min,
						max: axisRange.max,
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
		<div class="chart-canvas">
			<canvas bind:this={canvas} aria-label={`${label} history chart`}></canvas>
		</div>
		{#if bands.length > 0}
			<div class="zone-legend" aria-label="Quality zones">
				{#each QUALITY_ZONES as zone (zone)}
					<span>
						<i style:background={ZONE_COLORS[zone]}></i>
						{ZONE_LABELS[zone]}
					</span>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.chart-wrap {
		position: relative;
		height: 360px;
		min-height: 300px;
		display: flex;
		flex-direction: column;
	}

	.chart-canvas {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.chart-canvas canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.zone-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem 0.85rem;
		padding: 0.45rem 0.2rem 0;
		color: #7d8e9d;
		font-size: 0.6rem;
	}

	.zone-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.zone-legend i {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 3px;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
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
