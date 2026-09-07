import { describe, expect, it } from 'vitest';
import { filterChartSeries, listAccessPoints } from './chart-filters';
import type { BeaconSeries, MetricSample } from './types';

function point(overrides: Partial<MetricSample>): MetricSample {
	return {
		sampledAt: 1_000,
		online: true,
		signalDbm: -54,
		noiseDbm: -96,
		snrDb: 42,
		satisfaction: 90,
		txRateKbps: 300_000,
		rxRateKbps: 400_000,
		retryPercent: 1,
		channel: 36,
		radio: 'wifi1',
		radioProtocol: 'ax',
		apMac: '02:aa:00:00:00:01',
		apName: 'Office AP',
		txRetries: 1,
		txAttempts: 100,
		...overrides
	};
}

function series(name: string, points: MetricSample[]): BeaconSeries {
	return { mac: `02:00:00:00:00:${name}`, name, points };
}

describe('chart filters', () => {
	it('lists unique access points from history points', () => {
		expect(
			listAccessPoints([
				series('Office', [
					point({ apMac: '02:aa:00:00:00:01', apName: 'Office AP' }),
					point({ apMac: '02:aa:00:00:00:02', apName: 'Living room AP' })
				]),
				series('Garage', [point({ apMac: '02:aa:00:00:00:01', apName: 'Office AP' })])
			])
		).toEqual([
			{ id: '02:aa:00:00:00:02', label: 'Living room AP' },
			{ id: '02:aa:00:00:00:01', label: 'Office AP' }
		]);
	});

	it('keeps only samples for the selected UniFi AP', () => {
		const office = point({ sampledAt: 1, apMac: '02:aa:00:00:00:01', apName: 'Office AP' });
		const living = point({
			sampledAt: 2,
			apMac: '02:aa:00:00:00:02',
			apName: 'Living room AP',
			signalDbm: -63
		});
		const filtered = filterChartSeries(
			[series('Office', [office, living]), series('Patio', [living])],
			{ apId: '02:aa:00:00:00:01' }
		);

		expect(filtered.map((beacon) => beacon.name)).toEqual(['Office']);
		expect(filtered[0].points.map((item) => item.online)).toEqual([true, false]);
		expect(filtered[0].points[0].signalDbm).toBe(-54);
		expect(filtered[0].points[1].signalDbm).toBeNull();
	});

	it('keeps only samples in the selected signal bands', () => {
		const filtered = filterChartSeries(
			[
				series('Office', [
					point({ sampledAt: 1, signalDbm: -49 }),
					point({ sampledAt: 2, signalDbm: -58 }),
					point({ sampledAt: 3, signalDbm: -65 })
				])
			],
			{ bands: ['excellent', 'ok'] }
		);

		expect(filtered[0].points.map((item) => item.signalDbm)).toEqual([-49, null, -65]);
	});

	it('returns the original series when every AP and band is included', () => {
		const original = [series('Office', [point({})])];
		expect(
			filterChartSeries(original, {
				apId: null,
				bands: ['excellent', 'ideal', 'ok', 'bad', 'terrible']
			})
		).toBe(original);
	});

	it('can limit the chart to selected beacon MACs', () => {
		const filtered = filterChartSeries(
			[series('Office', [point({})]), series('Phone', [point({ signalDbm: -68 })])],
			{ macs: new Set(['02:00:00:00:00:Office']) }
		);

		expect(filtered.map((item) => item.name)).toEqual(['Office']);
	});
});
