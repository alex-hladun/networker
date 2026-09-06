import { describe, expect, it } from 'vitest';
import type { AppConfig } from './config';
import { Collector } from './collector';
import { createDatabase } from './db';
import { Repository } from './db/repository';
import type { NetworkProvider, ProviderSnapshot } from './unifi/types';

const config: AppConfig = {
	unifiUrl: 'https://unifi.test',
	apiKey: 'key',
	username: 'reader',
	password: 'secret',
	site: 'default',
	verifyTls: true,
	fixtureMode: false,
	pollIntervalSeconds: 30,
	retentionDays: 30,
	databasePath: ':memory:'
};

function snapshot(txRetries = 10, txAttempts = 1000): ProviderSnapshot {
	return {
		clients: [
			{
				mac: 'aa:bb:cc:dd:ee:ff',
				name: 'Office',
				ipAddress: '192.168.1.30',
				uplinkDeviceId: 'ap',
				connected: true
			}
		],
		stations: [
			{
				mac: 'aa:bb:cc:dd:ee:ff',
				name: 'Office',
				ipAddress: '192.168.1.30',
				uplinkDeviceId: 'ap',
				connected: true,
				signalDbm: -60,
				noiseDbm: -95,
				snrDb: 35,
				satisfaction: 96,
				txRateKbps: 300_000,
				rxRateKbps: 400_000,
				channel: 36,
				radio: 'wifi1',
				radioProtocol: 'ax',
				apMac: '00:11:22:33:44:55',
				apName: 'Office AP',
				txRetries,
				txAttempts
			}
		],
		controllerVersion: '10.3.58',
		warning: null
	};
}

class SequenceProvider implements NetworkProvider {
	constructor(private readonly snapshots: ProviderSnapshot[]) {}

	async getSnapshot(): Promise<ProviderSnapshot> {
		return this.snapshots.shift() ?? snapshot();
	}
}

describe('Collector', () => {
	it('records selected clients and calculates retry deltas', async () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		repository.upsertBeacon('aa:bb:cc:dd:ee:ff', 'Office', 'default');
		const collector = new Collector(
			config,
			repository,
			new SequenceProvider([snapshot(10, 1000), snapshot(20, 1200)])
		);

		await collector.runOnce();
		await collector.runOnce();

		expect(repository.listBeacons()[0].latest?.retryPercent).toBe(5);
		expect(repository.listBeacons()[0].latest?.apName).toBe('Office AP');
		expect(collector.getStatus().lastPollSucceededAt).not.toBeNull();
		database.raw.close();
	});

	it('records an offline sample when a selected client disappears', async () => {
		const database = createDatabase(':memory:');
		const repository = new Repository(database);
		repository.upsertBeacon('aa:bb:cc:dd:ee:ff', 'Office', 'default');
		const missing: ProviderSnapshot = {
			...snapshot(),
			clients: [],
			stations: []
		};
		const collector = new Collector(config, repository, new SequenceProvider([missing]));

		await collector.runOnce();

		expect(repository.listBeacons()[0].latest?.online).toBe(false);
		database.raw.close();
	});
});
