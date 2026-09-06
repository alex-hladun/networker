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
	import { ALL_TOOLTIP_METRICS, tooltipMetricLines, type TooltipMetric } from '$lib/chart-tooltip';
	import type { BeaconSeries, MetricSample } from '$lib/types';

	type ChartPoint = { x: number; y: number | null; sample: MetricSample };

	function isChartPoint(value: unknown): value is ChartPoint {
		return typeof value === 'object' && value !== null && 'sample' in value;
	}

	type Props = {
		series: BeaconSeries[];
		metric: ChartMetric;
		label: string;
		unit: string;
		from?: number;
		to?: number;
		emptyDetail?: string;
		tooltipMetrics?: readonly TooltipMetric[];
	};

	let {
		series,
		metric,
		label,
		unit,
		from,
		to,
		emptyDetail = 'Leave the collector running or choose a wider time range.',
		tooltipMetrics = ALL_TOOLTIP_METRICS
	}: Props = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: ChartInstance | null = null;
	let ChartConstructor: typeof import('chart.js').Chart | null = null;
	let drawnMetric: ChartMetric | null = null;
	let drawnFormat: 'date' | 'seconds' | 'time' | null = null;
	let activeTooltipMetrics: readonly TooltipMetric[] = ALL_TOOLTIP_METRICS;

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

	function timeFormatter(spanMs: number): {
		format: Intl.DateTimeFormat;
		mode: 'date' | 'seconds' | 'time';
	} {
		const showDate = spanMs > 36e5 * 24;
		const showSeconds = spanMs > 0 && spanMs < 10 * 60 * 1000;
		return {
			mode: showDate ? 'date' : showSeconds ? 'seconds' : 'time',
			format: new Intl.DateTimeFormat(undefined, {
				...(showDate ? { month: 'short', day: 'numeric' } : {}),
				hour: 'numeric',
				minute: '2-digit',
				...(showSeconds ? { second: '2-digit' } : {})
			})
		};
	}

	function chartModel() {
		const timestamps = series.flatMap((beacon) => beacon.points.map((point) => point.sampledAt));
		const minTime = timestamps.length ? Math.min(...timestamps) : (from ?? 0);
		const maxTime = timestamps.length ? Math.max(...timestamps) : (to ?? 0);
		const start = from ?? minTime;
		const end = to ?? maxTime;
		const { format, mode } = timeFormatter(Math.max(0, end - start));
		const plotted = series.flatMap((beacon) =>
			beacon.points
				.map((point) => metricValue(point))
				.filter((value): value is number => value !== null)
		);
		const pointCount = series.reduce((count, beacon) => count + beacon.points.length, 0);
		const datasets = series.map((beacon, index) => ({
			label: beacon.name,
			data: beacon.points.map((point) => ({
				x: point.sampledAt,
				y: metricValue(point),
				sample: point
			})),
			borderColor: colors[index % colors.length],
			backgroundColor: colors[index % colors.length],
			borderWidth: 2,
			pointRadius: pointCount < 160 ? 2 : 0,
			pointHoverRadius: 5,
			tension: 0.28,
			spanGaps: false
		}));

		return {
			start,
			end,
			mode,
			format,
			axisRange: zoneAxisRange(metric, plotted),
			datasets
		};
	}

	function draw(): void {
		if (!canvas || !ChartConstructor) return;
		activeTooltipMetrics = tooltipMetrics;

		const model = chartModel();
		const xScale = chart?.options.scales?.x;
		const yScale = chart?.options.scales?.y;
		const canUpdate =
			chart &&
			drawnMetric === metric &&
			drawnFormat === model.mode &&
			chart.data.datasets.length === model.datasets.length &&
			xScale &&
			yScale;

		if (canUpdate && chart) {
			chart.data.datasets = model.datasets;
			xScale.min = model.start;
			xScale.max = model.end;
			yScale.min = model.axisRange.min;
			yScale.max = model.axisRange.max;
			chart.update('none');
			return;
		}

		chart?.destroy();
		drawnMetric = metric;
		drawnFormat = model.mode;

		chart = new ChartConstructor(canvas, {
			type: 'line',
			plugins: [qualityZonePlugin(bands)],
			data: {
				datasets: model.datasets
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				interaction: { mode: 'nearest', axis: 'x', intersect: false },
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
						padding: 10,
						bodySpacing: 3,
						boxPadding: 4,
						mode: 'nearest',
						axis: 'x',
						intersect: false,
						itemSort: (left, right) =>
							(left.dataset.label ?? '').localeCompare(right.dataset.label ?? ''),
						filter: (item, _index, items) => {
							if (item.parsed?.y === null || item.parsed?.y === undefined) return false;
							const times = items
								.map((entry) => entry.parsed?.x)
								.filter((value): value is number => typeof value === 'number')
								.sort((left, right) => left - right);
							const anchor = times[Math.floor(times.length / 2)];
							const x = item.parsed?.x;
							return typeof x === 'number' && Math.abs(x - anchor) < 2000;
						},
						callbacks: {
							title: (items) => {
								const x = items[0]?.parsed?.x;
								return typeof x === 'number' ? model.format.format(x) : '';
							},
							label: (context) => context.dataset.label ?? '',
							afterLabel: (context) => {
								if (!isChartPoint(context.raw)) return [];
								return tooltipMetricLines(context.raw.sample, activeTooltipMetrics);
							}
						}
					}
				},
				scales: {
					x: {
						type: 'linear',
						min: model.start,
						max: model.end,
						bounds: 'ticks',
						grid: { color: 'rgba(151, 168, 185, 0.08)' },
						ticks: {
							color: '#718196',
							maxTicksLimit: 8,
							maxRotation: 0,
							callback: (value) => model.format.format(Number(value))
						}
					},
					y: {
						min: model.axisRange.min,
						max: model.axisRange.max,
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
			<span>{emptyDetail}</span>
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
