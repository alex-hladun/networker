import type { CollectorStatus, DiscoveredClient, MetricSample } from '$lib/types';
import type { AppConfig } from './config';
import { isConfigured } from './config';
import type { Repository } from './db/repository';
import { deriveRetryPercent } from './unifi/normalize';
import type { NetworkProvider, NormalizedStation } from './unifi/types';

const emptySample = (sampledAt: number): MetricSample => ({
	sampledAt,
	online: false,
	signalDbm: null,
	noiseDbm: null,
	snrDb: null,
	satisfaction: null,
	txRateKbps: null,
	rxRateKbps: null,
	retryPercent: null,
	channel: null,
	radio: null,
	radioProtocol: null,
	apMac: null,
	apName: null,
	txRetries: null,
	txAttempts: null
});

export class Collector {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private inFlight: Promise<void> | null = null;
	private clients: DiscoveredClient[] = [];
	private status: CollectorStatus;
	private started = false;
	private previousStationMacs = new Set<string>();

	constructor(
		private readonly config: AppConfig,
		private readonly repository: Repository,
		private readonly provider: NetworkProvider
	) {
		const configured = isConfigured(config);
		this.status = {
			mode: config.fixtureMode ? 'fixture' : 'unifi',
			configured,
			running: false,
			lastPollStartedAt: null,
			lastPollSucceededAt: null,
			nextPollAt: null,
			lastError: configured
				? null
				: 'Open the login page to add your UniFi console URL and credentials.',
			warning: null,
			controllerVersion: null,
			discoveredClientCount: 0,
			selectedBeaconCount: repository.getEnabledBeacons().length,
			pollIntervalSeconds: config.pollIntervalSeconds,
			retentionDays: config.retentionDays
		};
		this.repository.saveStatus(this.status);
	}

	start(): void {
		if (this.started) return;
		this.started = true;
		this.status.running = this.status.configured;
		this.repository.saveStatus(this.status);
		if (!this.status.configured) return;
		void this.runOnce().finally(() => this.schedule());
	}

	stop(): void {
		this.started = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.status.running = false;
		this.status.nextPollAt = null;
		this.repository.saveStatus(this.status);
	}

	getStatus(): CollectorStatus {
		return { ...this.status };
	}

	getClients(): DiscoveredClient[] {
		return this.clients.map((client) => ({ ...client }));
	}

	runOnce(): Promise<void> {
		if (!this.status.configured) return Promise.resolve();
		if (this.inFlight) return this.inFlight;
		this.inFlight = this.collect().finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private schedule(): void {
		if (!this.started || !this.status.configured) return;
		const delay = this.config.pollIntervalSeconds * 1000;
		this.status.nextPollAt = Date.now() + delay;
		this.repository.saveStatus(this.status);
		this.timer = setTimeout(() => {
			void this.runOnce().finally(() => this.schedule());
		}, delay);
		this.timer.unref?.();
	}

	private sampleFor(
		mac: string,
		sampledAt: number,
		station: NormalizedStation | undefined
	): MetricSample & { beaconMac: string } {
		if (!station) return { beaconMac: mac, ...emptySample(sampledAt) };

		const previous = this.repository.getLatestCounters(mac);
		return {
			beaconMac: mac,
			sampledAt,
			online: true,
			signalDbm: station.signalDbm,
			noiseDbm: station.noiseDbm,
			snrDb: station.snrDb,
			satisfaction: station.satisfaction,
			txRateKbps: station.txRateKbps,
			rxRateKbps: station.rxRateKbps,
			retryPercent: deriveRetryPercent(previous, station),
			channel: station.channel,
			radio: station.radio,
			radioProtocol: station.radioProtocol,
			apMac: station.apMac,
			apName: station.apName,
			txRetries: station.txRetries,
			txAttempts: station.txAttempts
		};
	}

	private async collect(): Promise<void> {
		const sampledAt = Date.now();
		this.status.lastPollStartedAt = sampledAt;
		this.status.lastError = null;
		this.status.nextPollAt = null;
		this.repository.saveStatus(this.status);

		try {
			const snapshot = await this.provider.getSnapshot();
			this.clients = snapshot.clients;
			const stations = new Map(snapshot.stations.map((station) => [station.mac, station]));
			const stationMacs = new Set(stations.keys());

			for (const client of snapshot.clients) {
				this.repository.upsertDevice(client.mac, client.name, this.config.site);
			}
			for (const station of snapshot.stations) {
				this.repository.upsertDevice(station.mac, station.name, this.config.site);
			}

			const selected = this.repository.getEnabledBeacons();
			const sampleMacs = new Set([
				...stationMacs,
				...selected.map((beacon) => beacon.mac),
				...[...this.previousStationMacs].filter((mac) => !stationMacs.has(mac))
			]);

			const samples = [...sampleMacs].map((mac) =>
				this.sampleFor(mac, sampledAt, stations.get(mac))
			);

			this.repository.recordSamples(samples);
			this.repository.pruneSamples(sampledAt - this.config.retentionDays * 24 * 60 * 60 * 1000);
			this.previousStationMacs = stationMacs;

			this.status.lastPollSucceededAt = Date.now();
			this.status.lastError = null;
			this.status.warning = snapshot.warning;
			this.status.controllerVersion = snapshot.controllerVersion;
			this.status.discoveredClientCount = snapshot.clients.length;
			this.status.selectedBeaconCount = selected.length;
		} catch (error) {
			this.status.lastError = error instanceof Error ? error.message : String(error);
		} finally {
			this.repository.saveStatus(this.status);
		}
	}
}
