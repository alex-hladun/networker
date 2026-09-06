import type { MetricSample } from '$lib/types';

function display(value: number | null, digits = 0, suffix = ''): string {
	return value === null ? '—' : `${value.toFixed(digits)}${suffix}`;
}

function formatRate(kbps: number | null): string {
	return kbps === null ? '—' : `${(kbps / 1000).toFixed(0)} Mbps`;
}

export function tooltipMetricLines(sample: MetricSample): string[] {
	if (!sample.online) return ['Offline'];

	return [
		`Signal  ${display(sample.signalDbm, 0, ' dBm')}`,
		`SNR  ${display(sample.snrDb, 0, ' dB')}`,
		`Noise  ${display(sample.noiseDbm, 0, ' dBm')}`,
		`Satisfaction  ${display(sample.satisfaction, 0, '%')}`,
		`TX / RX  ${formatRate(sample.txRateKbps)} / ${formatRate(sample.rxRateKbps)}`,
		`Retries  ${display(sample.retryPercent, 1, '%')}`,
		`AP  ${sample.apName ?? sample.apMac ?? '—'}`,
		`Channel  ${sample.channel ?? '—'} · ${sample.radioProtocol?.toUpperCase() ?? '—'}`
	];
}
