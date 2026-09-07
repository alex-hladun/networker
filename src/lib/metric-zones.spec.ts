import { describe, expect, it } from 'vitest';
import { classifyMetric, qualityLabel, zoneAxisRange, zoneBands } from './metric-zones';

describe('metric quality zones', () => {
	it('classifies signal with WLAN design-target RSSI cutoffs', () => {
		expect(classifyMetric('signalDbm', -54)).toBe('excellent');
		expect(classifyMetric('signalDbm', -55)).toBe('excellent');
		expect(classifyMetric('signalDbm', -56)).toBe('ideal');
		expect(classifyMetric('signalDbm', -65)).toBe('ideal');
		expect(classifyMetric('signalDbm', -66)).toBe('ok');
		expect(classifyMetric('signalDbm', -72)).toBe('ok');
		expect(classifyMetric('signalDbm', -73)).toBe('bad');
		expect(classifyMetric('signalDbm', -80)).toBe('bad');
		expect(classifyMetric('signalDbm', -81)).toBe('terrible');
	});

	it('classifies SNR, satisfaction, noise, and retries on the same inclusive shape', () => {
		expect(classifyMetric('snrDb', 35)).toBe('excellent');
		expect(classifyMetric('snrDb', 30)).toBe('ideal');
		expect(classifyMetric('snrDb', 25)).toBe('ok');
		expect(classifyMetric('snrDb', 20)).toBe('bad');
		expect(classifyMetric('snrDb', 19)).toBe('terrible');

		expect(classifyMetric('satisfaction', 90)).toBe('excellent');
		expect(classifyMetric('satisfaction', 80)).toBe('ideal');
		expect(classifyMetric('satisfaction', 70)).toBe('ok');
		expect(classifyMetric('satisfaction', 60)).toBe('bad');
		expect(classifyMetric('satisfaction', 59)).toBe('terrible');

		expect(classifyMetric('noiseDbm', -90)).toBe('excellent');
		expect(classifyMetric('noiseDbm', -85)).toBe('ideal');
		expect(classifyMetric('noiseDbm', -80)).toBe('ok');
		expect(classifyMetric('noiseDbm', -75)).toBe('bad');
		expect(classifyMetric('noiseDbm', -74)).toBe('terrible');

		expect(classifyMetric('retryPercent', 5)).toBe('excellent');
		expect(classifyMetric('retryPercent', 10)).toBe('ideal');
		expect(classifyMetric('retryPercent', 15)).toBe('ok');
		expect(classifyMetric('retryPercent', 25)).toBe('bad');
		expect(classifyMetric('retryPercent', 26)).toBe('terrible');
	});

	it('omits bands for PHY-dependent link rates', () => {
		expect(zoneBands('txRateKbps')).toEqual([]);
		expect(zoneBands('rxRateKbps')).toEqual([]);
		expect(zoneAxisRange('txRateKbps', [400])).toEqual({});
	});

	it('builds contiguous signal bands and keeps data in view', () => {
		const bands = zoneBands('signalDbm');
		expect(bands.map((band) => band.zone)).toEqual(['terrible', 'bad', 'ok', 'ideal', 'excellent']);
		expect(bands[1]).toMatchObject({ from: -80, to: -72 });

		const range = zoneAxisRange('signalDbm', [-84]);
		expect(range.min).toBeLessThanOrEqual(-84);
		expect(range.max).toBeGreaterThan(-55);
	});

	it('labels OK in all caps and unknown as no signal', () => {
		expect(qualityLabel('ok')).toBe('OK');
		expect(qualityLabel('excellent')).toBe('Excellent');
		expect(qualityLabel('unknown')).toBe('No signal');
	});
});
