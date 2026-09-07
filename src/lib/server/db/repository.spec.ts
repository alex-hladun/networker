import { describe, expect, it } from 'vitest';
import { buildScenario } from '$lib/scenarios';
import type { MetricSample } from '$lib/types';
import { createDatabase } from '.';
import { Repository } from './repository';

function sample(sampledAt: number, online: boolean, signalDbm: number | null): MetricSample {
	return {
		sampledAt,
		online,
		signalDbm,
		noiseDbm: online ? -96 : null,
		snrDb: online && signalDbm !== null ? signalDbm + 96 : null,
		satisfaction: online ? 92 : null,
		txRateKbps: online ? 300_000 : null,
		rxRateKbps: online ? 400_000 : null,
		retryPercent: online ? 2 : null,
		channel: online ? 36 : null,
		radio: online ? 'wifi1' : null,
		radioProtocol: online ? 'ax' : null,
		apMac: online ? '00:11:22:33:44:55' : null,
		apName: online ? 'Office AP' : null,
		txRetries: online ? 10 : null,
		txAttempts: online ? 1000 : null
	};
}

describe('Repository', () => {
	it('retains an offline latest sample and exposes chart gaps', () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		const now = Date.now();
		repository.upsertBeacon('aa:bb:cc:dd:ee:ff', 'Office', 'default', now - 10_000);
		repository.recordSamples([
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(now - 5000, true, -59) },
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(now, false, null) }
		]);

		const [beacon] = repository.listBeacons();
		const history = repository.getMetrics(now - 10_000, now + 1, 100);

		expect(beacon.latest?.online).toBe(false);
		expect(beacon.latest?.apName).toBeNull();
		expect(beacon.quality).toBe('unknown');
		expect(
			history.series[0].points.some((point) => !point.online && point.signalDbm === null)
		).toBe(true);
		database.raw.close();
	});

	it('keeps half-second buckets for a five-minute window', () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		const now = 5_000_000;
		repository.upsertBeacon('aa:bb:cc:dd:ee:ff', 'Office', 'default', now - 10_000);
		repository.recordSamples([
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(now - 2000, true, -60) },
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(now - 1500, true, -61) },
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(now - 1000, true, -62) },
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(now - 500, true, -63) }
		]);

		const history = repository.getMetrics(now - 5 * 60_000, now, 600);

		expect(history.bucketSeconds).toBe(0.5);
		expect(history.series[0].points.map((point) => point.signalDbm)).toEqual([-60, -61, -62, -63]);
		database.raw.close();
	});

	it('prunes only samples older than the retention cutoff', () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		repository.upsertBeacon('aa:bb:cc:dd:ee:ff', 'Office', 'default');
		repository.recordSamples([
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(1000, true, -60) },
			{ beaconMac: 'aa:bb:cc:dd:ee:ff', ...sample(2000, true, -61) }
		]);

		expect(repository.listBeacons()[0].latest?.apName).toBe('Office AP');
		expect(repository.pruneSamples(1500)).toBe(1);
		expect(repository.countSamples()).toBe(1);
		database.raw.close();
	});

	it('stores a time-range scenario with frozen per-beacon averages', () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		const scenario = buildScenario({
			id: 'scn-1',
			name: 'Evening baseline',
			createdAt: 8_000,
			from: 1_000,
			to: 2_000,
			series: [
				{
					mac: 'aa:bb:cc:dd:ee:ff',
					name: 'Office',
					points: [sample(1_000, true, -60), sample(2_000, true, -50)]
				}
			]
		});

		repository.saveScenario(scenario);
		expect(repository.listScenarios()).toEqual([scenario]);
		expect(repository.deleteScenario('scn-1')).toBe(true);
		expect(repository.listScenarios()).toEqual([]);
		database.raw.close();
	});

	it('keeps history for devices that are not selected as beacons', () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		const now = Date.now();
		repository.upsertDevice('11:22:33:44:55:66', 'Phone', 'default', now);
		repository.recordSamples([{ beaconMac: '11:22:33:44:55:66', ...sample(now, true, -72) }]);

		expect(repository.listBeacons()).toEqual([]);
		const history = repository.getMetrics(now - 10_000, now + 1, 100);
		expect(history.series).toEqual([
			expect.objectContaining({
				mac: '11:22:33:44:55:66',
				name: 'Phone'
			})
		]);
		expect(history.series[0].points[0]?.signalDbm).toBe(-72);
		database.raw.close();
	});
});
