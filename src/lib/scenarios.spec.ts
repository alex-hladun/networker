import { describe, expect, it } from 'vitest';
import {
	averageMetrics,
	buildScenario,
	defaultScenarioName,
	finalizeChartSelection,
	formatAverage,
	parseScenario,
	parseScenarios,
	scenarioHasSamples
} from './scenarios';
import type { BeaconSeries, MetricSample } from './types';

function point(overrides: Partial<MetricSample> = {}): MetricSample {
	return {
		sampledAt: 1_000,
		online: true,
		signalDbm: -54,
		noiseDbm: -96,
		snrDb: 42,
		satisfaction: 90,
		txRateKbps: 300_000,
		rxRateKbps: 400_000,
		retryPercent: 2,
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

describe('chart time-range selection', () => {
	it('normalizes a backward drag and rejects a click-sized span', () => {
		expect(finalizeChartSelection(5_000, 1_000)).toEqual({ from: 1_000, to: 5_000 });
		expect(finalizeChartSelection(1_000, 1_200)).toBeNull();
		expect(finalizeChartSelection(1_000, 1_200, { minDurationMs: 100 })).toEqual({
			from: 1_000,
			to: 1_200
		});
	});
});

describe('scenario averages', () => {
	it('averages each metric from online samples in the selected window', () => {
		const scenario = buildScenario({
			id: 'scenario-1',
			name: '  Before AP move  ',
			createdAt: 9_000,
			from: 2_000,
			to: 4_000,
			series: [
				series('Office', [
					point({ sampledAt: 1_000, signalDbm: -40, snrDb: 50 }),
					point({ sampledAt: 2_000, signalDbm: -50, snrDb: 40, satisfaction: 80, retryPercent: 1 }),
					point({ sampledAt: 4_000, signalDbm: -60, snrDb: 30, satisfaction: 70, retryPercent: 3 }),
					point({ sampledAt: 5_000, signalDbm: -90, snrDb: 10 })
				]),
				series('Garage', [
					point({
						sampledAt: 3_000,
						online: false,
						signalDbm: null,
						noiseDbm: null,
						snrDb: null,
						satisfaction: null,
						txRateKbps: null,
						rxRateKbps: null,
						retryPercent: null
					})
				])
			]
		});

		expect(scenario.name).toBe('Before AP move');
		expect(scenario.beacons.map((beacon) => beacon.name)).toEqual(['Garage', 'Office']);
		expect(scenario.beacons[1].averages).toMatchObject({
			signalDbm: -55,
			snrDb: 35,
			satisfaction: 75,
			retryPercent: 2,
			sampleCount: 2,
			onlineCount: 2
		});
		expect(scenario.beacons[0].averages).toMatchObject({
			signalDbm: null,
			sampleCount: 1,
			onlineCount: 0
		});
		expect(scenarioHasSamples(scenario)).toBe(true);
	});

	it('ignores null metric values when averaging', () => {
		const averages = averageMetrics([
			point({ signalDbm: -50, retryPercent: null }),
			point({ signalDbm: null, retryPercent: 4 }),
			point({ online: false, signalDbm: -10, retryPercent: 90 })
		]);

		expect(averages.signalDbm).toBe(-50);
		expect(averages.retryPercent).toBe(4);
		expect(averages.sampleCount).toBe(3);
		expect(averages.onlineCount).toBe(2);
	});

	it('formats rates as Mbps and leaves empty values blank', () => {
		expect(formatAverage('txRateKbps', 300_000)).toBe('300 Mbps');
		expect(formatAverage('signalDbm', -54.25)).toBe('-54.3 dBm');
		expect(formatAverage('satisfaction', null)).toBe('—');
	});

	it('names a same-day window from its local clock times', () => {
		const from = Date.UTC(2026, 8, 6, 15, 12);
		const to = Date.UTC(2026, 8, 6, 15, 18);
		expect(defaultScenarioName(from, to)).toMatch(/12|18/);
	});
});

describe('scenario parsing', () => {
	it('keeps well-formed snapshots and drops broken records', () => {
		const valid = buildScenario({
			id: 'keep-me',
			name: 'Baseline',
			createdAt: 1,
			from: 1,
			to: 2,
			series: [series('Office', [point()])]
		});

		expect(parseScenario(valid)?.id).toBe('keep-me');
		expect(parseScenarios([valid, { name: 'nope' }, null])).toEqual([valid]);
		expect(parseScenario({ ...valid, beacons: [{ mac: 'x', name: 'y' }] })).toBeNull();
	});
});
