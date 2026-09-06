import type { DiscoveredClient, MetricSample } from '$lib/types';

export type UnknownRecord = Record<string, unknown>;

export type RawStation = UnknownRecord;

export type NormalizedStation = DiscoveredClient &
	Omit<MetricSample, 'sampledAt' | 'online' | 'retryPercent'> & {
		txRetries: number | null;
		txAttempts: number | null;
	};

export type ProviderSnapshot = {
	clients: DiscoveredClient[];
	stations: NormalizedStation[];
	controllerVersion: string | null;
	warning: string | null;
};

export interface NetworkProvider {
	getSnapshot(): Promise<ProviderSnapshot>;
	reconnectClient(mac: string): Promise<void>;
}
