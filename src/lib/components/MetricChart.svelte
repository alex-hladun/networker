<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Chart as ChartInstance, ChartType, Plugin, TooltipModel } from 'chart.js';
	import {
		QUALITY_ZONES,
		ZONE_COLORS,
		ZONE_LABELS,
		zoneAxisRange,
		zoneBands,
		type ChartMetric,
		type ZoneBand
	} from '$lib/metric-zones';
	import {
		DEFAULT_TOOLTIP_METRICS,
		tooltipMetricRows,
		type TooltipMetric,
		type TooltipRow
	} from '$lib/chart-tooltip';
	import {
		isAllSelected,
		isItemVisible,
		legendItemTitle,
		pruneExclusiveSelection,
		toggleExclusiveSelection
	} from '$lib/chart-legend';
	import { finalizeChartSelection } from '$lib/scenarios';
	import type { BeaconSeries, MetricSample, TimeRange } from '$lib/types';

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
		fill?: boolean;
		selectedRange?: TimeRange | null;
		onrangeselect?: (range: TimeRange) => void;
	};

	let {
		series,
		metric,
		label,
		unit,
		from,
		to,
		emptyDetail = 'Leave the collector running or choose a wider time range.',
		tooltipMetrics = DEFAULT_TOOLTIP_METRICS,
		fill = false,
		selectedRange = null,
		onrangeselect
	}: Props = $props();
	let wrap = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let chart: ChartInstance | null = null;
	let ChartConstructor: typeof import('chart.js').Chart | null = null;
	let drawnMetric: ChartMetric | null = null;
	let drawnFormat: 'date' | 'seconds' | 'time' | null = null;
	let activeTooltipMetrics: readonly TooltipMetric[] = DEFAULT_TOOLTIP_METRICS;
	let activeShowRawValues = false;
	let activeTimeFormat: Intl.DateTimeFormat | null = null;
	let tooltipsActive = true;
	let dragging = $state(false);
	let dragStart = 0;
	let dragCurrent = 0;
	let showRawValues = $state(false);
	let visibleMacs = $state<string[] | null>(null);
	let overlayBox = $state<{ left: number; top: number; width: number; height: number } | null>(
		null
	);
	let tooltipView = $state<{
		left: number;
		top: number;
		title: string;
		items: { color: string; name: string; rows: TooltipRow[] }[];
	} | null>(null);

	const colors = ['#24d6a7', '#73a8ff', '#f6b950', '#f07b91', '#a78bfa', '#2dd4bf'];
	const bands = $derived(zoneBands(metric));
	const seriesMacs = $derived(series.map((beacon) => beacon.mac));
	const activeVisibleMacs = $derived(pruneExclusiveSelection(visibleMacs, seriesMacs));
	const allSeriesVisible = $derived(isAllSelected(activeVisibleMacs, seriesMacs));

	function seriesColor(index: number): string {
		return colors[index % colors.length];
	}

	function toggleLegendSeries(mac: string): void {
		visibleMacs = toggleExclusiveSelection(activeVisibleMacs, mac, seriesMacs);
	}

	function showAllSeries(): void {
		visibleMacs = null;
	}

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
			hidden: !isItemVisible(activeVisibleMacs, beacon.mac),
			data: beacon.points.map((point) => ({
				x: point.sampledAt,
				y: metricValue(point),
				sample: point
			})),
			borderColor: seriesColor(index),
			backgroundColor: seriesColor(index),
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

	function renderTooltip(context: { tooltip: TooltipModel<ChartType> }): void {
		const tooltip = context.tooltip;
		if (
			!tooltipsActive ||
			dragging ||
			!tooltip ||
			tooltip.opacity === 0 ||
			tooltip.dataPoints.length === 0
		) {
			tooltipView = null;
			return;
		}
		const titleValue = tooltip.dataPoints[0]?.parsed?.x;
		const items = tooltip.dataPoints
			.filter((item) =>
				typeof item.datasetIndex === 'number'
					? chart?.isDatasetVisible(item.datasetIndex) !== false
					: true
			)
			.map((item) => ({
				color: typeof item.dataset.borderColor === 'string' ? item.dataset.borderColor : '#aab7c5',
				name: item.dataset.label ?? '',
				rows: isChartPoint(item.raw)
					? tooltipMetricRows(item.raw.sample, activeTooltipMetrics, activeShowRawValues)
					: []
			}));
		if (items.length === 0) {
			tooltipView = null;
			return;
		}
		tooltipView = {
			left: tooltip.caretX,
			top: tooltip.caretY,
			title:
				typeof titleValue === 'number' && activeTimeFormat
					? activeTimeFormat.format(titleValue)
					: '',
			items
		};
	}

	function draw(): void {
		if (!canvas || !ChartConstructor) return;
		activeTooltipMetrics = tooltipMetrics;

		const model = chartModel();
		activeTimeFormat = model.format;
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
			for (const [index, dataset] of model.datasets.entries()) {
				chart.setDatasetVisibility(index, dataset.hidden !== true);
			}
			chart.update('none');
			untrack(() => syncOverlay());
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
						display: false
					},
					tooltip: {
						enabled: false,
						external: renderTooltip,
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
		untrack(() => syncOverlay());
	}

	function activeRange(): TimeRange | null {
		if (dragging) return finalizeChartSelection(dragStart, dragCurrent, { minDurationMs: 1 });
		return selectedRange ?? null;
	}

	function timeAt(clientX: number, clamp = false): number | null {
		if (!chart || !canvas) return null;
		const xScale = chart.scales.x;
		const area = chart.chartArea;
		if (!xScale || !area) return null;
		const x = clientX - canvas.getBoundingClientRect().left;
		if (!clamp && (x < area.left || x > area.right)) return null;
		const value = xScale.getValueForPixel(Math.min(area.right, Math.max(area.left, x)));
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function setTooltipEnabled(enabled: boolean): void {
		tooltipsActive = enabled;
		if (!enabled) tooltipView = null;
	}

	function syncOverlay(): void {
		const range = activeRange();
		if (!chart || !range) {
			overlayBox = null;
			return;
		}
		const xScale = chart.scales.x;
		const area = chart.chartArea;
		if (!xScale || !area) {
			overlayBox = null;
			return;
		}
		const left = Math.max(area.left, xScale.getPixelForValue(range.from));
		const right = Math.min(area.right, xScale.getPixelForValue(range.to));
		if (!(right > left) || range.to < Number(xScale.min) || range.from > Number(xScale.max)) {
			overlayBox = null;
			return;
		}
		overlayBox = {
			left,
			top: area.top,
			width: right - left,
			height: area.height
		};
	}

	function onPointerDown(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const time = timeAt(event.clientX);
		if (time === null) return;
		event.preventDefault();
		dragging = true;
		dragStart = time;
		dragCurrent = time;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		setTooltipEnabled(false);
		syncOverlay();
	}

	function onPointerMove(event: PointerEvent): void {
		if (!dragging) return;
		const time = timeAt(event.clientX, true);
		if (time === null) return;
		dragCurrent = time;
		syncOverlay();
	}

	function onPointerUp(event: PointerEvent): void {
		if (!dragging) return;
		dragging = false;
		setTooltipEnabled(true);
		const startPixel = chart?.scales.x.getPixelForValue(dragStart) ?? 0;
		const endPixel = chart?.scales.x.getPixelForValue(dragCurrent) ?? 0;
		const range =
			Math.abs(endPixel - startPixel) >= 8 ? finalizeChartSelection(dragStart, dragCurrent) : null;
		if (range) onrangeselect?.(range);
		syncOverlay();
		if (
			event.currentTarget instanceof HTMLElement &&
			event.currentTarget.hasPointerCapture(event.pointerId)
		) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
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
		activeShowRawValues = showRawValues;
	});

	$effect(() => {
		draw();
	});

	$effect(() => {
		void fill;
		if (!wrap) return;
		const frame = requestAnimationFrame(() => {
			chart?.resize();
			syncOverlay();
		});
		const observer = new ResizeObserver(() => {
			chart?.resize();
			syncOverlay();
		});
		observer.observe(wrap);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});

	$effect(() => {
		void selectedRange;
		syncOverlay();
	});
</script>

<div class="chart-wrap" class:fill bind:this={wrap}>
	{#if series.length === 0 || series.every((beacon) => beacon.points.length === 0)}
		<div class="empty">
			<div class="empty-icon">⌁</div>
			<strong>No samples in this range</strong>
			<span>{emptyDetail}</span>
		</div>
	{:else}
		<div class="series-legend" role="toolbar" aria-label="Chart series">
			<button
				type="button"
				class:active={allSeriesVisible}
				aria-pressed={allSeriesVisible}
				title="Show all series"
				onclick={showAllSeries}>All</button
			>
			{#each series as beacon, index (beacon.mac)}
				{@const visible = isItemVisible(activeVisibleMacs, beacon.mac)}
				<button
					type="button"
					class:active={!allSeriesVisible && visible}
					class:dimmed={!visible}
					aria-pressed={!allSeriesVisible && visible}
					title={legendItemTitle(beacon.name, visible, allSeriesVisible)}
					onclick={() => toggleLegendSeries(beacon.mac)}
				>
					<i style:background={seriesColor(index)}></i>
					{beacon.name}
				</button>
			{/each}
		</div>
		<div class="chart-canvas" class:selecting={dragging}>
			<label class="raw-toggle">
				<input type="checkbox" bind:checked={showRawValues} />
				Show raw values
			</label>
			<canvas
				bind:this={canvas}
				aria-label={`${label} history chart. Drag to select a time range.`}
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointercancel={onPointerUp}
			></canvas>
			{#if overlayBox}
				<div
					class="range-overlay"
					style:left={`${overlayBox.left}px`}
					style:top={`${overlayBox.top}px`}
					style:width={`${overlayBox.width}px`}
					style:height={`${overlayBox.height}px`}
					aria-hidden="true"
				></div>
			{/if}
			{#if tooltipView}
				<div
					class="chart-tooltip"
					style:left={`${tooltipView.left}px`}
					style:top={`${tooltipView.top}px`}
				>
					{#if tooltipView.title}
						<div class="tooltip-title">{tooltipView.title}</div>
					{/if}
					{#each tooltipView.items as item (item.name)}
						<div class="tooltip-series">
							<div class="tooltip-name" style:color={item.color}>{item.name}</div>
							{#each item.rows as row, index (`${item.name}-${index}`)}
								{#if row.value}
									<div class="tooltip-row">
										<span>{row.label}</span>
										<strong>{row.value}</strong>
									</div>
								{:else}
									<div class="tooltip-offline">{row.label}</div>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			{/if}
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

	.chart-wrap.fill {
		height: 100%;
		min-height: 0;
		flex: 1;
	}

	.chart-canvas {
		position: relative;
		flex: 1;
		min-height: 0;
		cursor: crosshair;
		touch-action: none;
	}

	.raw-toggle {
		position: absolute;
		top: 2px;
		left: 2px;
		z-index: 4;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: #aab7c5;
		font-size: 0.68rem;
		cursor: pointer;
		user-select: none;
	}

	.raw-toggle input {
		margin: 0;
		accent-color: var(--accent);
	}

	.series-legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.2rem;
		padding: 0 0 0.35rem;
	}

	.series-legend button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 0.22rem 0.5rem;
		color: #aab7c5;
		background: transparent;
		font-size: 0.62rem;
		cursor: pointer;
	}

	.series-legend button:hover,
	.series-legend button.active {
		color: #e7eef4;
		border-color: #2b3d49;
		background: #111f29;
	}

	.series-legend button.dimmed {
		color: #667686;
	}

	.series-legend button.dimmed i {
		opacity: 0.35;
	}

	.series-legend i {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
	}

	.chart-tooltip {
		position: absolute;
		z-index: 5;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - 12px));
		min-width: 11.5rem;
		max-width: min(20rem, calc(100% - 1rem));
		padding: 0.55rem 0.7rem 0.5rem;
		border: 1px solid #2d3b49;
		border-radius: 8px;
		background: #111a23;
		color: #d5dee6;
		box-shadow: 0 14px 32px rgba(0, 0, 0, 0.38);
		font-size: 0.68rem;
		line-height: 1.35;
	}

	.tooltip-title {
		color: #8b9bab;
		font-size: 0.6rem;
		margin-bottom: 0.4rem;
	}

	.tooltip-series + .tooltip-series {
		margin-top: 0.5rem;
		padding-top: 0.45rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.tooltip-name {
		font-weight: 650;
		margin-bottom: 0.22rem;
	}

	.tooltip-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1.1rem;
	}

	.tooltip-row span {
		color: #8b9bab;
	}

	.tooltip-row strong {
		font-weight: 700;
		text-align: right;
		margin-left: auto;
	}

	.tooltip-offline {
		color: #f07b91;
	}

	.chart-canvas.selecting {
		cursor: col-resize;
		user-select: none;
	}

	.chart-canvas canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.range-overlay {
		position: absolute;
		pointer-events: none;
		border: 1px solid rgba(36, 214, 167, 0.7);
		border-radius: 2px;
		background: rgba(36, 214, 167, 0.16);
		box-shadow: inset 0 0 0 1px rgba(36, 214, 167, 0.12);
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
