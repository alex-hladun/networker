import { describe, expect, it } from 'vitest';
import { ALL_TOOLTIP_METRICS, tooltipMetricLines, tooltipMetricRows } from './chart-tooltip';
import type { MetricSample } from './types';

const sample: MetricSample = {
	sampledAt: 1_000,
	online: true,
	signalDbm: -54,
	noiseDbm: -96,
	snrDb: 42,
	satisfaction: 90,
	txRateKbps: 300_000,
	rxRateKbps: 400_000,
	retryPercent: 1.4,
	channel: 36,
	radio: 'wifi1',
	radioProtocol: 'ax',
	apMac: '02:aa:00:00:00:01',
	apName: 'Office AP',
	txRetries: 1,
	txAttempts: 100
};

describe('chart tooltip', () => {
	it('defaults to signal class only', () => {
		expect(tooltipMetricRows(sample)).toEqual([{ label: 'Signal', value: 'Ideal' }]);
	});

	it('shows raw numbers when requested', () => {
		expect(tooltipMetricLines(sample, undefined, true)).toEqual(['Signal  -54 dBm']);
	});

	it('lists every live metric as quality classes when raw values are off', () => {
		expect(tooltipMetricRows(sample, ALL_TOOLTIP_METRICS)).toEqual([
			{ label: 'Signal', value: 'Ideal' },
			{ label: 'SNR', value: 'Excellent' },
			{ label: 'Noise', value: 'Excellent' },
			{ label: 'Satisfaction', value: 'Ideal' },
			{ label: 'TX / RX', value: '300 Mbps / 400 Mbps' },
			{ label: 'Retries', value: 'Excellent' },
			{ label: 'AP', value: 'Office AP' },
			{ label: 'Channel', value: '36 · AX' }
		]);
	});

	it('lists every live metric as numbers when raw values are on', () => {
		expect(tooltipMetricLines(sample, ALL_TOOLTIP_METRICS, true)).toEqual([
			'Signal  -54 dBm',
			'SNR  42 dB',
			'Noise  -96 dBm',
			'Satisfaction  90%',
			'TX / RX  300 Mbps / 400 Mbps',
			'Retries  1.4%',
			'AP  Office AP',
			'Channel  36 · AX'
		]);
	});

	it('marks offline samples instead of repeating empty metrics', () => {
		expect(tooltipMetricRows({ ...sample, online: false })).toEqual([{ label: 'Offline' }]);
	});

	it('keeps only the selected tooltip fields, in display order', () => {
		expect(tooltipMetricLines(sample, ['channel', 'signalDbm', 'ap'])).toEqual([
			'Signal  Ideal',
			'AP  Office AP',
			'Channel  36 · AX'
		]);
	});
});
