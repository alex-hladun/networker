import { describe, expect, it } from 'vitest';
import { tooltipMetricLines } from './chart-tooltip';
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
	it('lists every live metric for a device', () => {
		expect(tooltipMetricLines(sample)).toEqual([
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
		expect(tooltipMetricLines({ ...sample, online: false })).toEqual(['Offline']);
	});
});
