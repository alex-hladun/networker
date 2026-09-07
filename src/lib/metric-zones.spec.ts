import { describe, expect, it } from 'vitest';
import { classifyMetric, qualityLabel, zoneAxisRange, zoneBands } from './metric-zones';

describe('metric quality zones', () => {
	it('classifies signal with the five-band RSSI cutoffs', () => {
		expect(classifyMetric('signalDbm', -49)).toBe('excellent');
		expect(classifyMetric('signalDbm', -50)).toBe('ideal');
		expect(classifyMetric('signalDbm', -60)).toBe('ideal');
		expect(classifyMetric('signalDbm', -61)).toBe('ok');
		expect(classifyMetric('signalDbm', -70)).toBe('ok');
		expect(classifyMetric('signalDbm', -71)).toBe('bad');
		expect(classifyMetric('signalDbm', -75)).toBe('bad');
		expect(classifyMetric('signalDbm', -76)).toBe('terrible');
	});

	it('classifies SNR, satisfaction, noise, and retries on the same shape', () => {
		expect(classifyMetric('snrDb', 41)).toBe('excellent');
		expect(classifyMetric('snrDb', 30)).toBe('ideal');
		expect(classifyMetric('snrDb', 25)).toBe('ok');
		expect(classifyMetric('snrDb', 20)).toBe('bad');
		expect(classifyMetric('snrDb', 19)).toBe('terrible');

		expect(classifyMetric('satisfaction', 96)).toBe('excellent');
		expect(classifyMetric('satisfaction', 90)).toBe('ideal');
		expect(classifyMetric('satisfaction', 80)).toBe('ok');
		expect(classifyMetric('satisfaction', 70)).toBe('bad');
		expect(classifyMetric('satisfaction', 69)).toBe('terrible');

		expect(classifyMetric('noiseDbm', -96)).toBe('excellent');
		expect(classifyMetric('noiseDbm', -90)).toBe('ideal');
		expect(classifyMetric('noiseDbm', -85)).toBe('ok');
		expect(classifyMetric('noiseDbm', -80)).toBe('bad');
		expect(classifyMetric('noiseDbm', -79)).toBe('terrible');

		expect(classifyMetric('retryPercent', 1)).toBe('excellent');
		expect(classifyMetric('retryPercent', 5)).toBe('ideal');
		expect(classifyMetric('retryPercent', 10)).toBe('ok');
		expect(classifyMetric('retryPercent', 15)).toBe('bad');
		expect(classifyMetric('retryPercent', 16)).toBe('terrible');
	});

	it('omits bands for PHY-dependent link rates', () => {
		expect(zoneBands('txRateKbps')).toEqual([]);
		expect(zoneBands('rxRateKbps')).toEqual([]);
		expect(zoneAxisRange('txRateKbps', [400])).toEqual({});
	});

	it('builds contiguous signal bands and keeps data in view', () => {
		const bands = zoneBands('signalDbm');
		expect(bands.map((band) => band.zone)).toEqual(['terrible', 'bad', 'ok', 'ideal', 'excellent']);
		expect(bands[1]).toMatchObject({ from: -75, to: -70 });

		const range = zoneAxisRange('signalDbm', [-79]);
		expect(range.min).toBeLessThanOrEqual(-79);
		expect(range.max).toBeGreaterThan(-50);
	});

	it('labels OK in all caps and unknown as no signal', () => {
		expect(qualityLabel('ok')).toBe('OK');
		expect(qualityLabel('excellent')).toBe('Excellent');
		expect(qualityLabel('unknown')).toBe('No signal');
	});
});
