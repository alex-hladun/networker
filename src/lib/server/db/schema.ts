import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const beacons = sqliteTable('beacons', {
	mac: text('mac').primaryKey(),
	name: text('name').notNull(),
	site: text('site').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull()
});

export const metricSamples = sqliteTable(
	'metric_samples',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beaconMac: text('beacon_mac')
			.notNull()
			.references(() => beacons.mac),
		sampledAt: integer('sampled_at').notNull(),
		online: integer('online', { mode: 'boolean' }).notNull(),
		signalDbm: real('signal_dbm'),
		noiseDbm: real('noise_dbm'),
		snrDb: real('snr_db'),
		satisfaction: real('satisfaction'),
		txRateKbps: real('tx_rate_kbps'),
		rxRateKbps: real('rx_rate_kbps'),
		retryPercent: real('retry_percent'),
		channel: real('channel'),
		radio: text('radio'),
		radioProtocol: text('radio_protocol'),
		apMac: text('ap_mac'),
		apName: text('ap_name'),
		txRetries: real('tx_retries'),
		txAttempts: real('tx_attempts')
	},
	(table) => [index('metric_samples_beacon_time_idx').on(table.beaconMac, table.sampledAt)]
);

export const collectorStatus = sqliteTable('collector_status', {
	id: integer('id').primaryKey(),
	mode: text('mode', { enum: ['unifi', 'fixture'] }).notNull(),
	configured: integer('configured', { mode: 'boolean' }).notNull(),
	running: integer('running', { mode: 'boolean' }).notNull(),
	lastPollStartedAt: integer('last_poll_started_at'),
	lastPollSucceededAt: integer('last_poll_succeeded_at'),
	nextPollAt: integer('next_poll_at'),
	lastError: text('last_error'),
	warning: text('warning'),
	controllerVersion: text('controller_version'),
	discoveredClientCount: integer('discovered_client_count').notNull().default(0),
	selectedBeaconCount: integer('selected_beacon_count').notNull().default(0),
	pollIntervalSeconds: real('poll_interval_seconds').notNull(),
	retentionDays: integer('retention_days').notNull()
});
