import { classifyMetric } from '$lib/metric-zones';
import type {
	Beacon,
	CollectorStatus,
	DiscoveredClient,
	MetricSample,
	MetricsResponse,
	Scenario,
	SignalQuality
} from '$lib/types';
import {
	createFixtureSnapshot,
	DEMO_POLL_INTERVAL_SECONDS,
	DEMO_RETENTION_DAYS,
	FIXTURE_CLIENTS
} from './fixture';

type ClientOption = DiscoveredClient & { selected: boolean };
type StoredSample = MetricSample & { beaconMac: string };

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

function retryPercent(
	previous: { txRetries: number | null; txAttempts: number | null } | null,
	current: { txRetries: number | null; txAttempts: number | null }
): number | null {
	if (
		!previous ||
		previous.txRetries === null ||
		previous.txAttempts === null ||
		current.txRetries === null ||
		current.txAttempts === null
	) {
		return null;
	}
	const retryDelta = current.txRetries - previous.txRetries;
	const attemptDelta = current.txAttempts - previous.txAttempts;
	if (attemptDelta <= 0 || retryDelta < 0) return null;
	return Math.min(100, Math.max(0, (retryDelta / attemptDelta) * 100));
}

export class DemoRuntime {
	private readonly selected = new Map<string, { name: string; createdAt: number }>();
	private readonly samples: StoredSample[] = [];
	private readonly counters = new Map<
		string,
		{ txRetries: number | null; txAttempts: number | null }
	>();
	private scenarios: Scenario[] = [];
	private lastPollSucceededAt: number | null = null;

	constructor(now = Date.now()) {
		for (const client of FIXTURE_CLIENTS) {
			this.selected.set(client.mac, { name: client.name, createdAt: now });
		}
		this.seed(now, 5 * 60 * 1000, DEMO_POLL_INTERVAL_SECONDS * 1000);
	}

	getStatus(): CollectorStatus {
		return {
			mode: 'fixture',
			configured: true,
			running: true,
			lastPollStartedAt: this.lastPollSucceededAt,
			lastPollSucceededAt: this.lastPollSucceededAt,
			nextPollAt: (this.lastPollSucceededAt ?? Date.now()) + DEMO_POLL_INTERVAL_SECONDS * 1000,
			lastError: null,
			warning: 'Live demo with simulated beacons. Values are not from a UniFi console.',
			controllerVersion: 'fixture-10.3.58',
			discoveredClientCount: FIXTURE_CLIENTS.length,
			selectedBeaconCount: this.selected.size,
			pollIntervalSeconds: DEMO_POLL_INTERVAL_SECONDS,
			retentionDays: DEMO_RETENTION_DAYS
		};
	}

	getBeacons(): Beacon[] {
		return [...this.selected.entries()]
			.map(([mac, beacon]) => {
				const latest = this.latestSample(mac);
				return {
					mac,
					name: beacon.name,
					site: 'default',
					enabled: true,
					createdAt: beacon.createdAt,
					latest,
					quality: (latest?.online && latest.signalDbm !== null
						? classifyMetric('signalDbm', latest.signalDbm)
						: 'unknown') as SignalQuality
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	getClients(): ClientOption[] {
		const snapshot = createFixtureSnapshot();
		return snapshot.clients.map((client) => ({
			...client,
			selected: this.selected.has(client.mac)
		}));
	}

	getMetrics(from: number, to: number, maxPoints = 600): MetricsResponse {
		const range = Math.max(1, to - from);
		const bucketMs = Math.max(500, Math.ceil(range / maxPoints));
		const series = this.getBeacons().map((beacon) => {
			const buckets = new Map<number, StoredSample[]>();
			for (const sample of this.samples) {
				if (sample.beaconMac !== beacon.mac || sample.sampledAt < from || sample.sampledAt > to) {
					continue;
				}
				const key = Math.floor(sample.sampledAt / bucketMs) * bucketMs;
				const group = buckets.get(key) ?? [];
				group.push(sample);
				buckets.set(key, group);
			}

			const points = [...buckets.entries()]
				.sort((left, right) => left[0] - right[0])
				.map(([sampledAt, group]) => averageSample(sampledAt, group));

			return { mac: beacon.mac, name: beacon.name, points };
		});

		return { from, to, bucketSeconds: bucketMs / 1000, series };
	}

	addBeacon(mac: string, name: string, now = Date.now()): void {
		this.selected.set(mac, { name, createdAt: this.selected.get(mac)?.createdAt ?? now });
		this.recordAt(now);
	}

	removeBeacon(mac: string): void {
		this.selected.delete(mac);
	}

	reconnectClient(): void {}

	refresh(now = Date.now()): void {
		this.recordAt(now);
	}

	listScenarios(): Scenario[] {
		return [...this.scenarios].sort((left, right) => right.createdAt - left.createdAt);
	}

	saveScenario(scenario: Scenario): Scenario {
		this.scenarios = [scenario, ...this.scenarios.filter((item) => item.id !== scenario.id)];
		return scenario;
	}

	deleteScenario(id: string): boolean {
		const next = this.scenarios.filter((item) => item.id !== id);
		const removed = next.length !== this.scenarios.length;
		this.scenarios = next;
		return removed;
	}

	private seed(now: number, durationMs: number, stepMs: number): void {
		for (let sampledAt = now - durationMs; sampledAt <= now; sampledAt += stepMs) {
			this.recordAt(sampledAt);
		}
	}

	private recordAt(sampledAt: number): void {
		const snapshot = createFixtureSnapshot(sampledAt);
		const stations = new Map(snapshot.stations.map((station) => [station.mac, station]));
		for (const mac of this.selected.keys()) {
			const station = stations.get(mac);
			const previous = this.counters.get(mac) ?? null;
			const sample: StoredSample = station
				? {
						beaconMac: mac,
						sampledAt,
						online: true,
						signalDbm: station.signalDbm,
						noiseDbm: station.noiseDbm,
						snrDb: station.snrDb,
						satisfaction: station.satisfaction,
						txRateKbps: station.txRateKbps,
						rxRateKbps: station.rxRateKbps,
						retryPercent: retryPercent(previous, station),
						channel: station.channel,
						radio: station.radio,
						radioProtocol: station.radioProtocol,
						apMac: station.apMac,
						apName: station.apName,
						txRetries: station.txRetries,
						txAttempts: station.txAttempts
					}
				: { beaconMac: mac, ...emptySample(sampledAt) };
			this.samples.push(sample);
			if (station) this.counters.set(mac, station);
		}
		this.lastPollSucceededAt = sampledAt;
		const cutoff = sampledAt - DEMO_RETENTION_DAYS * 24 * 60 * 60 * 1000;
		while (this.samples[0] && this.samples[0].sampledAt < cutoff) this.samples.shift();
	}

	private latestSample(mac: string): MetricSample | null {
		for (let index = this.samples.length - 1; index >= 0; index -= 1) {
			if (this.samples[index].beaconMac === mac) return this.samples[index];
		}
		return null;
	}
}

function averageSample(sampledAt: number, group: StoredSample[]): MetricSample {
	const online = group.every((sample) => sample.online);
	const avg = (read: (sample: StoredSample) => number | null): number | null => {
		const values = group.map(read).filter((value): value is number => value !== null);
		if (!values.length) return null;
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	};
	const last = group[group.length - 1];
	const sample: MetricSample = {
		sampledAt,
		online,
		signalDbm: avg((item) => item.signalDbm),
		noiseDbm: avg((item) => item.noiseDbm),
		snrDb: avg((item) => item.snrDb),
		satisfaction: avg((item) => item.satisfaction),
		txRateKbps: avg((item) => item.txRateKbps),
		rxRateKbps: avg((item) => item.rxRateKbps),
		retryPercent: avg((item) => item.retryPercent),
		channel: last.channel,
		radio: last.radio,
		radioProtocol: last.radioProtocol,
		apMac: last.apMac,
		apName: last.apName,
		txRetries: last.txRetries,
		txAttempts: last.txAttempts
	};
	if (!online) {
		sample.signalDbm = null;
		sample.noiseDbm = null;
		sample.snrDb = null;
		sample.satisfaction = null;
		sample.txRateKbps = null;
		sample.rxRateKbps = null;
		sample.retryPercent = null;
	}
	return sample;
}
