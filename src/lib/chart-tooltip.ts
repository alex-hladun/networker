import { classifyMetric, qualityLabel, type ZonedMetric } from '$lib/metric-zones';
import type { MetricSample } from '$lib/types';

export type TooltipMetric =
	'signalDbm' | 'snrDb' | 'noiseDbm' | 'satisfaction' | 'txRx' | 'retryPercent' | 'ap' | 'channel';

export type TooltipRow = {
	label: string;
	value?: string;
};

export const TOOLTIP_METRICS: { key: TooltipMetric; label: string }[] = [
	{ key: 'signalDbm', label: 'Signal' },
	{ key: 'snrDb', label: 'SNR' },
	{ key: 'noiseDbm', label: 'Noise' },
	{ key: 'satisfaction', label: 'Satisfaction' },
	{ key: 'txRx', label: 'TX / RX' },
	{ key: 'retryPercent', label: 'Retries' },
	{ key: 'ap', label: 'AP' },
	{ key: 'channel', label: 'Channel' }
];

export const ALL_TOOLTIP_METRICS = TOOLTIP_METRICS.map((item) => item.key);

export const DEFAULT_TOOLTIP_METRICS: TooltipMetric[] = ['signalDbm', 'ap'];

function display(value: number | null, digits = 0, suffix = ''): string {
	return value === null ? '—' : `${value.toFixed(digits)}${suffix}`;
}

function formatRate(kbps: number | null): string {
	return kbps === null ? '—' : `${(kbps / 1000).toFixed(0)} Mbps`;
}

function zonedDisplay(
	metric: ZonedMetric,
	value: number | null,
	rawValues: boolean,
	digits: number,
	suffix: string
): string {
	if (value === null) return '—';
	if (!rawValues) return qualityLabel(classifyMetric(metric, value));
	return display(value, digits, suffix);
}

function row(key: TooltipMetric, sample: MetricSample, rawValues: boolean): TooltipRow {
	switch (key) {
		case 'signalDbm':
			return {
				label: 'Signal',
				value: zonedDisplay('signalDbm', sample.signalDbm, rawValues, 0, ' dBm')
			};
		case 'snrDb':
			return { label: 'SNR', value: zonedDisplay('snrDb', sample.snrDb, rawValues, 0, ' dB') };
		case 'noiseDbm':
			return {
				label: 'Noise',
				value: zonedDisplay('noiseDbm', sample.noiseDbm, rawValues, 0, ' dBm')
			};
		case 'satisfaction':
			return {
				label: 'Satisfaction',
				value: zonedDisplay('satisfaction', sample.satisfaction, rawValues, 0, '%')
			};
		case 'txRx':
			return {
				label: 'TX / RX',
				value: `${formatRate(sample.txRateKbps)} / ${formatRate(sample.rxRateKbps)}`
			};
		case 'retryPercent':
			return {
				label: 'Retries',
				value: zonedDisplay('retryPercent', sample.retryPercent, rawValues, 1, '%')
			};
		case 'ap':
			return { label: 'AP', value: sample.apName ?? sample.apMac ?? '—' };
		case 'channel':
			return {
				label: 'Channel',
				value: `${sample.channel ?? '—'} · ${sample.radioProtocol?.toUpperCase() ?? '—'}`
			};
	}
}

export function tooltipMetricRows(
	sample: MetricSample,
	selected: readonly TooltipMetric[] = DEFAULT_TOOLTIP_METRICS,
	rawValues = false
): TooltipRow[] {
	if (!sample.online) return [{ label: 'Offline' }];
	const keys = selected.length ? selected : DEFAULT_TOOLTIP_METRICS;
	return ALL_TOOLTIP_METRICS.filter((key) => keys.includes(key)).map((key) =>
		row(key, sample, rawValues)
	);
}

export function tooltipMetricLines(
	sample: MetricSample,
	selected: readonly TooltipMetric[] = DEFAULT_TOOLTIP_METRICS,
	rawValues = false
): string[] {
	return tooltipMetricRows(sample, selected, rawValues).map((item) =>
		item.value ? `${item.label}  ${item.value}` : item.label
	);
}
