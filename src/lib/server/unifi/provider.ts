import type { AppConfig } from '../config';
import { ClassicClient } from './classic-client';
import { IntegrationClient } from './integration-client';
import { deviceNamesByMac, normalizeStation, resolveApName } from './normalize';
import type { NetworkProvider, ProviderSnapshot } from './types';

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class UniFiProvider implements NetworkProvider {
	private readonly integration: IntegrationClient;
	private readonly classic: ClassicClient;

	constructor(config: AppConfig) {
		this.integration = new IntegrationClient(config);
		this.classic = new ClassicClient(config);
	}

	async getSnapshot(): Promise<ProviderSnapshot> {
		const [integrationResult, stationResult, deviceResult] = await Promise.allSettled([
			this.integration.discover(),
			this.classic.getStations(),
			this.classic.getDevices()
		]);

		if (stationResult.status === 'rejected') {
			throw new Error(`Detailed UniFi telemetry failed: ${errorMessage(stationResult.reason)}`);
		}

		const deviceNames =
			deviceResult.status === 'fulfilled'
				? deviceNamesByMac(deviceResult.value)
				: new Map<string, string>();
		const stations = stationResult.value
			.map(normalizeStation)
			.filter((station) => station !== null)
			.map((station) => ({
				...station,
				apName: resolveApName(station, deviceNames)
			}));
		const stationClients = stations.map((station) => ({
			mac: station.mac,
			name: station.name,
			ipAddress: station.ipAddress,
			uplinkDeviceId: station.uplinkDeviceId,
			connected: true
		}));

		if (integrationResult.status === 'rejected') {
			return {
				clients: stationClients,
				stations,
				controllerVersion: null,
				warning: `Official client discovery unavailable; using classic telemetry: ${errorMessage(
					integrationResult.reason
				)}`
			};
		}

		const clientsByMac = new Map(
			integrationResult.value.clients.map((client) => [client.mac, client])
		);
		for (const station of stationClients) {
			const existing = clientsByMac.get(station.mac);
			clientsByMac.set(station.mac, {
				...existing,
				...station,
				name: existing?.name && existing.name !== station.mac ? existing.name : station.name
			});
		}

		return {
			clients: [...clientsByMac.values()].sort((a, b) => a.name.localeCompare(b.name)),
			stations,
			controllerVersion: integrationResult.value.version,
			warning: null
		};
	}

	async reconnectClient(mac: string): Promise<void> {
		await this.classic.reconnectStation(mac);
	}
}
