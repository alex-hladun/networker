import { describe, expect, it } from 'vitest';
import { FIXTURE_CLIENTS } from './fixture';
import { DemoRuntime } from './runtime';

describe('DemoRuntime', () => {
	it('starts with every fixture beacon selected and chart history', () => {
		const runtime = new DemoRuntime(1_700_000_000_000);

		expect(runtime.getBeacons()).toHaveLength(FIXTURE_CLIENTS.length);
		expect(runtime.getClients().every((client) => client.selected)).toBe(true);
		expect(runtime.getStatus().mode).toBe('fixture');

		const history = runtime.getMetrics(1_700_000_000_000 - 5 * 60_000, 1_700_000_000_000);
		expect(history.series[0].points.length).toBeGreaterThan(10);
		expect(history.series.some((series) => series.points.some((point) => point.online))).toBe(true);
	});

	it('can remove and re-add a beacon', () => {
		const runtime = new DemoRuntime(1_700_000_000_000);
		runtime.removeBeacon('02:00:00:00:00:11');
		expect(runtime.getBeacons().some((beacon) => beacon.mac === '02:00:00:00:00:11')).toBe(false);

		runtime.addBeacon('02:00:00:00:00:11', 'Office beacon', 1_700_000_000_000);
		expect(runtime.getBeacons().some((beacon) => beacon.mac === '02:00:00:00:00:11')).toBe(true);
	});
});
