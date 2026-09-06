import type { NetworkProvider, NormalizedStation, ProviderSnapshot } from './types';

const FIXTURE_CLIENTS = [
	{ mac: '02:00:00:00:00:11', name: 'Office beacon', signal: -54, channel: 36 },
	{ mac: '02:00:00:00:00:22', name: 'Living room beacon', signal: -63, channel: 149 },
	{ mac: '02:00:00:00:00:33', name: 'Garage beacon', signal: -72, channel: 6 },
	{ mac: '02:00:00:00:00:44', name: 'Patio beacon', signal: -79, channel: 1 }
];

export class FixtureProvider implements NetworkProvider {
	async getSnapshot(): Promise<ProviderSnapshot> {
		const nowSeconds = Date.now() / 1000;
		const stations: NormalizedStation[] = FIXTURE_CLIENTS.flatMap((client, index) => {
			const temporarilyOffline = index === 3 && Math.floor(nowSeconds / 90) % 5 === 0;
			if (temporarilyOffline) return [];

			const signalDbm = client.signal + Math.sin(nowSeconds / 30 + index * 1.7) * (2 + index);
			const noiseDbm = -96 + index;
			const attempts = Math.floor(nowSeconds * 100);

			return [
				{
					mac: client.mac,
					name: client.name,
					ipAddress: `192.168.1.${40 + index}`,
					uplinkDeviceId: `fixture-ap-${index % 2}`,
					connected: true,
					signalDbm: Number(signalDbm.toFixed(1)),
					noiseDbm,
					snrDb: Number((signalDbm - noiseDbm).toFixed(1)),
					satisfaction: Math.max(20, Math.min(100, Math.round(100 + (signalDbm + 55) * 2))),
					txRateKbps: Math.max(6_000, Math.round((780_000 + signalDbm * 8_000) / 1000) * 1000),
					rxRateKbps: Math.max(6_000, Math.round((650_000 + signalDbm * 7_000) / 1000) * 1000),
					channel: client.channel,
					radio: client.channel > 14 ? 'wifi1' : 'wifi0',
					radioProtocol: client.channel > 14 ? 'ax' : 'n',
					apMac: index % 2 ? '02:aa:00:00:00:02' : '02:aa:00:00:00:01',
					apName: index % 2 ? 'Living room AP' : 'Office AP',
					txRetries: Math.floor(nowSeconds * (index + 2)),
					txAttempts: attempts
				}
			];
		});

		return {
			clients: FIXTURE_CLIENTS.map((client, index) => ({
				mac: client.mac,
				name: client.name,
				ipAddress: `192.168.1.${40 + index}`,
				uplinkDeviceId: `fixture-ap-${index % 2}`,
				connected: stations.some((station) => station.mac === client.mac)
			})),
			stations,
			controllerVersion: 'fixture-10.3.58',
			warning: 'Fixture mode is active; values are simulated.'
		};
	}

	async reconnectClient(): Promise<void> {}
}
