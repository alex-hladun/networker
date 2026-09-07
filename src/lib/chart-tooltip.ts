import type { MetricSample } from '$lib/types';

export type TooltipMetric =
	| 'signalDbm'
	| 'snrDb'
	| 'noiseDbm'
	| 'satisfaction'
	| 'txRx'
	| 'retryPercent'
	| 'ap'
	| 'channel';

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

const LINES: Record<TooltipMetric, (sample: MetricSample) => string> = {
	signalDbm: (sample) => `Signal  ${display(sample.signalDbm, 0, ' dBm')}`,
	snrDb: (sample) => `SNR  ${display(sample.snrDb, 0, ' dB')}`,
	noiseDbm: (sample) => `Noise  ${display(sample.noiseDbm, 0, ' dBm')}`,
	satisfaction: (sample) => `Satisfaction  ${display(sample.satisfaction, 0, '%')}`,
	txRx: (sample) => `TX / RX  ${formatRate(sample.txRateKbps)} / ${formatRate(sample.rxRateKbps)}`,
	retryPercent: (sample) => `Retries  ${display(sample.retryPercent, 1, '%')}`,
	ap: (sample) => `AP  ${sample.apName ?? sample.apMac ?? '—'}`,
	channel: (sample) =>
		`Channel  ${sample.channel ?? '—'} · ${sample.radioProtocol?.toUpperCase() ?? '—'}`
};

export function tooltipMetricLines(
	sample: MetricSample,
	selected: readonly TooltipMetric[] = DEFAULT_TOOLTIP_METRICS
): string[] {
	if (!sample.online) return ['Offline'];
	const keys = selected.length ? selected : DEFAULT_TOOLTIP_METRICS;
	return ALL_TOOLTIP_METRICS.filter((key) => keys.includes(key)).map((key) => LINES[key](sample));
}
