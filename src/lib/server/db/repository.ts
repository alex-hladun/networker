import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import type {
	Beacon,
	CollectorStatus,
	MetricSample,
	MetricsResponse,
	SignalQuality
} from '$lib/types';
import { signalQuality } from '../unifi/normalize';
import type { AppDatabase } from './index';
import { beacons, collectorStatus, metricSamples } from './schema';

type SampleInsert = MetricSample & { beaconMac: string };

export class Repository {
	constructor(private readonly database: AppDatabase) {}

	upsertBeacon(mac: string, name: string, site: string, now = Date.now()): void {
		this.database.orm
			.insert(beacons)
			.values({ mac, name, site, enabled: true, createdAt: now })
			.onConflictDoUpdate({
				target: beacons.mac,
				set: { name, site, enabled: true }
			})
			.run();
	}

	disableBeacon(mac: string): boolean {
		const result = this.database.orm
			.update(beacons)
			.set({ enabled: false })
			.where(eq(beacons.mac, mac))
			.run();
		return result.changes > 0;
	}

	getEnabledBeacons(): { mac: string; name: string; site: string }[] {
		return this.database.orm
			.select({ mac: beacons.mac, name: beacons.name, site: beacons.site })
			.from(beacons)
			.where(eq(beacons.enabled, true))
			.orderBy(asc(beacons.name))
			.all();
	}

	listBeacons(): Beacon[] {
		const rows = this.database.raw
			.prepare(
				`SELECT
					b.mac, b.name, b.site, b.enabled, b.created_at,
					m.sampled_at, m.online, m.signal_dbm, m.noise_dbm, m.snr_db,
					m.satisfaction, m.tx_rate_kbps, m.rx_rate_kbps, m.retry_percent,
					m.channel, m.radio, m.radio_protocol, m.ap_mac, m.tx_retries, m.tx_attempts
				FROM beacons b
				LEFT JOIN metric_samples m ON m.id = (
					SELECT id FROM metric_samples latest
					WHERE latest.beacon_mac = b.mac
					ORDER BY latest.sampled_at DESC, latest.id DESC
					LIMIT 1
				)
				WHERE b.enabled = 1
				ORDER BY b.name COLLATE NOCASE`
			)
			.all() as Record<string, unknown>[];

		return rows.map((row) => {
			const latest = row.sampled_at === null ? null : mapSample(row);
			return {
				mac: String(row.mac),
				name: String(row.name),
				site: String(row.site),
				enabled: Boolean(row.enabled),
				createdAt: Number(row.created_at),
				latest,
				quality: signalQuality(latest?.signalDbm ?? null)
			};
		});
	}

	getLatestCounters(mac: string): { txRetries: number | null; txAttempts: number | null } | null {
		const row = this.database.orm
			.select({
				txRetries: metricSamples.txRetries,
				txAttempts: metricSamples.txAttempts
			})
			.from(metricSamples)
			.where(and(eq(metricSamples.beaconMac, mac), eq(metricSamples.online, true)))
			.orderBy(desc(metricSamples.sampledAt))
			.limit(1)
			.get();
		return row ?? null;
	}

	recordSamples(samples: SampleInsert[]): void {
		if (!samples.length) return;
		this.database.orm
			.insert(metricSamples)
			.values(
				samples.map((sample) => ({
					beaconMac: sample.beaconMac,
					sampledAt: sample.sampledAt,
					online: sample.online,
					signalDbm: sample.signalDbm,
					noiseDbm: sample.noiseDbm,
					snrDb: sample.snrDb,
					satisfaction: sample.satisfaction,
					txRateKbps: sample.txRateKbps,
					rxRateKbps: sample.rxRateKbps,
					retryPercent: sample.retryPercent,
					channel: sample.channel,
					radio: sample.radio,
					radioProtocol: sample.radioProtocol,
					apMac: sample.apMac,
					txRetries: sample.txRetries,
					txAttempts: sample.txAttempts
				}))
			)
			.run();
	}

	pruneSamples(before: number): number {
		return this.database.orm.delete(metricSamples).where(lt(metricSamples.sampledAt, before)).run()
			.changes;
	}

	saveStatus(status: CollectorStatus): void {
		this.database.orm
			.insert(collectorStatus)
			.values({ id: 1, ...status })
			.onConflictDoUpdate({
				target: collectorStatus.id,
				set: status
			})
			.run();
	}

	getStatus(): CollectorStatus | null {
		const row = this.database.orm
			.select()
			.from(collectorStatus)
			.where(eq(collectorStatus.id, 1))
			.get();
		if (!row) return null;
		return {
			mode: row.mode,
			configured: row.configured,
			running: row.running,
			lastPollStartedAt: row.lastPollStartedAt,
			lastPollSucceededAt: row.lastPollSucceededAt,
			nextPollAt: row.nextPollAt,
			lastError: row.lastError,
			warning: row.warning,
			controllerVersion: row.controllerVersion,
			discoveredClientCount: row.discoveredClientCount,
			selectedBeaconCount: row.selectedBeaconCount,
			pollIntervalSeconds: row.pollIntervalSeconds,
			retentionDays: row.retentionDays
		};
	}

	getMetrics(from: number, to: number, maxPoints = 600): MetricsResponse {
		const range = Math.max(1, to - from);
		const bucketMs = Math.max(10_000, Math.ceil(range / maxPoints / 1000) * 1000);
		const rows = this.database.raw
			.prepare(
				`SELECT
					m.beacon_mac,
					CAST(m.sampled_at / ? AS INTEGER) * ? AS sampled_at,
					MIN(m.online) AS online,
					AVG(m.signal_dbm) AS signal_dbm,
					AVG(m.noise_dbm) AS noise_dbm,
					AVG(m.snr_db) AS snr_db,
					AVG(m.satisfaction) AS satisfaction,
					AVG(m.tx_rate_kbps) AS tx_rate_kbps,
					AVG(m.rx_rate_kbps) AS rx_rate_kbps,
					AVG(m.retry_percent) AS retry_percent,
					MAX(m.channel) AS channel,
					MAX(m.radio) AS radio,
					MAX(m.radio_protocol) AS radio_protocol,
					MAX(m.ap_mac) AS ap_mac,
					MAX(m.tx_retries) AS tx_retries,
					MAX(m.tx_attempts) AS tx_attempts
				FROM metric_samples m
				INNER JOIN beacons b ON b.mac = m.beacon_mac AND b.enabled = 1
				WHERE m.sampled_at BETWEEN ? AND ?
				GROUP BY m.beacon_mac, CAST(m.sampled_at / ? AS INTEGER)
				ORDER BY m.beacon_mac, sampled_at`
			)
			.all(bucketMs, bucketMs, from, to, bucketMs) as Record<string, unknown>[];

		const names = new Map(this.getEnabledBeacons().map((beacon) => [beacon.mac, beacon.name]));
		const grouped = new Map<string, MetricSample[]>();
		for (const row of rows) {
			const mac = String(row.beacon_mac);
			const points = grouped.get(mac) ?? [];
			const sample = mapSample(row);
			if (!sample.online) {
				for (const key of [
					'signalDbm',
					'noiseDbm',
					'snrDb',
					'satisfaction',
					'txRateKbps',
					'rxRateKbps',
					'retryPercent'
				] as const) {
					sample[key] = null;
				}
			}
			points.push(sample);
			grouped.set(mac, points);
		}

		return {
			from,
			to,
			bucketSeconds: bucketMs / 1000,
			series: [...grouped.entries()].map(([mac, points]) => ({
				mac,
				name: names.get(mac) ?? mac,
				points
			}))
		};
	}

	countSamples(): number {
		const result = this.database.orm
			.select({ count: sql<number>`count(*)` })
			.from(metricSamples)
			.get();
		return Number(result?.count ?? 0);
	}
}

function nullableNumber(value: unknown): number | null {
	return value === null || value === undefined ? null : Number(value);
}

function nullableString(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

function mapSample(row: Record<string, unknown>): MetricSample {
	return {
		sampledAt: Number(row.sampled_at),
		online: Boolean(row.online),
		signalDbm: nullableNumber(row.signal_dbm),
		noiseDbm: nullableNumber(row.noise_dbm),
		snrDb: nullableNumber(row.snr_db),
		satisfaction: nullableNumber(row.satisfaction),
		txRateKbps: nullableNumber(row.tx_rate_kbps),
		rxRateKbps: nullableNumber(row.rx_rate_kbps),
		retryPercent: nullableNumber(row.retry_percent),
		channel: nullableNumber(row.channel),
		radio: nullableString(row.radio),
		radioProtocol: nullableString(row.radio_protocol),
		apMac: nullableString(row.ap_mac),
		txRetries: nullableNumber(row.tx_retries),
		txAttempts: nullableNumber(row.tx_attempts)
	};
}

export function qualityLabel(quality: SignalQuality): string {
	return quality === 'unknown' ? 'No signal' : quality[0].toUpperCase() + quality.slice(1);
}
