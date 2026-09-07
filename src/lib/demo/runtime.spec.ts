import { describe, expect, it } from 'vitest';
import { FIXTURE_CLIENTS } from './fixture';
import { DemoRuntime } from './runtime';

describe('DemoRuntime', () => {
	it('starts with every fixture beacon selected and chart history', () => {
		const runtime = new DemoRuntime(1_700_000_000_000);

		expect(runtime.getBeacons()).toHaveLength(FIXTURE_CLIENTS.length);
		expect(runtime.getClients().filter((client) => client.selected)).toHaveLength(
			FIXTURE_CLIENTS.length
		);
		expect(runtime.getStatus().mode).toBe('fixture');

		const history = runtime.getMetrics(1_700_000_000_000 - 5 * 60_000, 1_700_000_000_000);
		expect(history.series[0].points.length).toBeGreaterThan(10);
		expect(history.series.some((series) => series.points.some((point) => point.online))).toBe(true);
		expect(history.series.some((series) => series.name === 'Phone')).toBe(true);
	});

	it('stores saved chart scenarios for later review', () => {
		const runtime = new DemoRuntime(1_700_000_000_000);
		const history = runtime.getMetrics(1_700_000_000_000 - 5 * 60_000, 1_700_000_000_000);
		const scenario = {
			id: 'demo-1',
			name: 'Quiet hour',
			from: history.from,
			to: history.to,
			createdAt: 1_700_000_000_000,
			beacons: history.series.map((item) => ({
				mac: item.mac,
				name: item.name,
				averages: {
					signalDbm: -60,
					noiseDbm: -96,
					snrDb: 36,
					satisfaction: 88,
					txRateKbps: 200_000,
					rxRateKbps: 180_000,
					retryPercent: 2,
					sampleCount: item.points.length,
					onlineCount: item.points.filter((point) => point.online).length
				}
			}))
		};

		expect(runtime.saveScenario(scenario).name).toBe('Quiet hour');
		expect(runtime.listScenarios()).toEqual([scenario]);
		expect(runtime.deleteScenario('demo-1')).toBe(true);
		expect(runtime.listScenarios()).toEqual([]);
	});

	it('can remove and re-add a beacon', () => {
		const runtime = new DemoRuntime(1_700_000_000_000);
		runtime.removeBeacon('02:00:00:00:00:11');
		expect(runtime.getBeacons().some((beacon) => beacon.mac === '02:00:00:00:00:11')).toBe(false);

		runtime.addBeacon('02:00:00:00:00:11', 'Office beacon', 1_700_000_000_000);
		expect(runtime.getBeacons().some((beacon) => beacon.mac === '02:00:00:00:00:11')).toBe(true);
	});

	it('keeps recording a device after it is no longer a beacon', () => {
		const runtime = new DemoRuntime(1_700_000_000_000);
		runtime.removeBeacon('02:00:00:00:00:11');
		runtime.refresh(1_700_000_000_000 + 2_000);
		const history = runtime.getMetrics(1_700_000_000_000, 1_700_000_000_000 + 2_000);
		expect(history.series.some((series) => series.mac === '02:00:00:00:00:11')).toBe(true);
	});
});
